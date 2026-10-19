import { rawMarkdown } from "../documents/compat";
import { makeMarkdown, readMarkdown, patchProperties } from "../documents/markdown";
import { availableDocumentPath } from "./document-path";
import { randomUUID } from "node:crypto";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { Raw } from "../../types/raw";
import { requireUserActor } from "../auth/authorize";
import { getUserContext } from "../auth/context";
import { getDb, type DbTransaction } from "../db/client";
import { auditLog, rawNotes } from "../db/schema";

// 原始记录（raw_notes）服务层。
// 读路径默认只返回"未归档"的行；按 id 单条读取不过滤（保持与旧存储一致的行为）。
//
// 注意：raw_notes 目前**只有 archived_at，没有 deleted_at**——raw 的墓碑机制
// 尚未设计（按决策随存储层重写的写路径一起做）。因此这里只过滤归档。
//
// 写路径：
//   - createSource  —— 新建原始记录，user_id 取自服务端用户上下文
//   - archiveSource —— 归档（普通"移除"走这里，不做物理删除）
//   - updateSource  —— 修改正文（`user_edit`：只有 user 主体可用；每次修改留下修订记录）

type SourceRow = typeof rawNotes.$inferSelect;

/** 原始记录正文长度上限（POST 与 PATCH 共用同一个数字，避免两处各写一份）。 */
export const MAX_RAW_TEXT_LENGTH = 50_000;

/** 笔记名长度上限。标题只是索引用的短标签，不需要很长。 */
export const MAX_RAW_TITLE_LENGTH = 120;

function toSource(row: SourceRow): Raw {
  return {
    id: row.id,
    title: row.title,
    text: row.text,
    markdown: rawMarkdown(row),
    path: row.path ?? `raw/articles/${row.id}.md`,
    version: row.version,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listSources(): Promise<Raw[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(rawNotes)
    .where(and(eq(rawNotes.userId, userId), isNull(rawNotes.archivedAt)))
    .orderBy(desc(rawNotes.createdAt));

  return rows.map(toSource);
}

/**
 * 已归档的原始记录。
 *
 * 为什么要单独一个函数：**导出包含已归档内容**（归档是"我不想在日常里看到它"，
 * 不是"它不是我的数据"），所以导入判重时必须也能看见它们 —— 只看未归档的那一份，
 * 重导自己的包就会把已归档的原话当成新的再建一遍。
 */
export async function listArchivedSources(): Promise<Raw[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(rawNotes)
    .where(and(eq(rawNotes.userId, userId), isNotNull(rawNotes.archivedAt)))
    .orderBy(desc(rawNotes.createdAt));

  return rows.map(toSource);
}

export async function getSource(id: string): Promise<Raw | null> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(rawNotes)
    .where(and(eq(rawNotes.id, id), eq(rawNotes.userId, userId)))
    .limit(1);
  const [row] = rows;

  return row ? toSource(row) : null;
}

/**
 * 新建原始记录。
 * `title` 可选：原始记录允许先只有正文，笔记名后补（也允许一直不填）。
 */
export async function createSource(text: string, title?: string | null, document?: {markdown:string;path?:string}): Promise<Raw> {
  const { db } = await getDb();

  return db.transaction((tx) => createSourceInTx(tx, text, title, document));
}

/**
 * 事务内版本。
 *
 * 提议执行（`source_create`）要求"写 raw_notes → 更新提议状态 → 写审计"在同一个事务内完成，
 * 所以真正的插入放在这里；`createSource` 只是自带事务的薄包装，规则只有这一份。
 *
 * 注意：raw_notes 没有 `proposal_id` 列（与 links 不同），提议关联记在提议侧。
 */
export async function createSourceInTx(
  tx: DbTransaction,
  text: string,
  title?: string | null,
  document?: {markdown:string;path?:string},
): Promise<Raw> {
  const { userId } = getUserContext();
  const id = `raw_${randomUUID()}`;
  // Every newly captured note gets a real persisted inbox path.  The sidebar can
  // therefore render "未整理笔记" from server data instead of temporary UI state.
  // Explicit import/document paths remain untouched for compatibility.
  const path = await availableDocumentPath(tx, document?.path ?? `raw/inbox/${id}.md`, id);
  const normalizedTitle = typeof title === "string" && title.trim() ? title.trim() : null;
  const rows = await tx
    .insert(rawNotes)
    .values({ id, userId, text, title: normalizedTitle, markdown:document?.markdown, path })
    .returning();

  return toSource(rows[0]);
}

/**
 * 直接建立一条可编辑的空白 Raw。
 *
 * 「新建笔记」不是临时输入态：点击后立刻在本机库里占一个位置，
 * 因此刷新、切换标签或关闭面板都不会丢失。编号按同一用户所有 Raw
 * （也包括归档项）取最大值，避免恢复归档后撞名。
 */
export async function createUntitledSource(text = ""): Promise<Raw> {
  const { db } = await getDb();
  const { userId } = getUserContext();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ title: rawNotes.title })
      .from(rawNotes)
      .where(eq(rawNotes.userId, userId))
      .for("update");
    const next = existing.reduce((highest, row) => {
      const match = row.title?.trim().match(/^未命名\s*(\d+)$/);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1;
    const title = `未命名${next}`;
    return createSourceInTx(tx, text, title, { markdown: makeMarkdown(title, text) });
  });
}

/**
 * 归档原始记录（普通"移除"路径）。
 * 只对"尚未归档"的行生效：影响 0 行时返回 null（不存在或已归档），调用方据此返回 404。
 * 不做物理删除——原始记录一旦删除，引用它的知识页会失去出处。
 */
export async function archiveSource(id: string): Promise<Raw | null> {
  const { db } = await getDb();
  const { userId,actor } = getUserContext();
  const now = new Date();
  return db.transaction(async tx => {
  const rows = await tx
    .update(rawNotes)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(rawNotes.id, id), eq(rawNotes.userId, userId), isNull(rawNotes.archivedAt)))
    .returning();
  const [row] = rows;
  if(row) await tx.insert(auditLog).values({id:`audit_${randomUUID()}`,userId,actorType:actor.type,actorId:actor.id,operation:"raw.archive",targetType:"raw",targetId:id,result:"ok",detail:{title:row.title,path:row.path}});
  return row ? toSource(row) : null;
  });
}

export type UpdateSourceResult =
  | { status: "ok"; raw: Raw; revisionId: string }
  | { status: "unchanged"; raw: Raw }
  | { status: "not_found" };

/**
 * 修改原始记录正文（`user_edit`）。
 *
 * 产品原则（2026-10-10 决策）：**Raw 用户可改、AI 不可改**。
 *   - 只有 `user` 主体可以调用；Agent 主体在这里被拒（`USE_PROPOSAL_FLOW`），
 *     评审入口在路由层转成 403，不允许通过"普通用户编辑接口"绕过提议机制；
 *   - 每次成功修改都在同一事务里写一条 `audit_log`（`operation = 'raw.update'`，
 *     `detail = { before, after, version }`）作为修订记录：保留了改前的原文，
 *     因此任何一次修改都可追溯、可人工还原；
 *   - 正文相同视为无改动：不写库、不产生修订记录，返回 `unchanged`。
 *
 * 为什么修订记录写在 `audit_log` 而不是新表：`audit_log` 无外键、`detail` 是 jsonb，
 * 正好承载"改前 / 改后"快照，且不需要新增迁移。若将来要做"逐版本对比 / 回滚到某一版"
 * 的界面，再单开 `raw_revisions` 表并追加迁移（见 docs/schema.md）。
 */
export async function updateSource(id: string, text: string, document?: { markdown: string; path?: string; version?: number }): Promise<UpdateSourceResult> {
  requireUserActor(getUserContext());

  const { db } = await getDb();
  const { userId } = getUserContext();

  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(rawNotes)
        .where(and(eq(rawNotes.id, id), eq(rawNotes.userId, userId), isNull(rawNotes.archivedAt)))
        .limit(1)
        .for("update")
    )[0];

    if (!current) return { status: "not_found" as const };

    if (document?.version !== undefined && current.version !== document.version) throw new Error("VERSION_CONFLICT");
    if (current.text === text && !document) {
      return { status: "unchanged" as const, raw: toSource(current) };
    }

    const canonical = document ? patchProperties(document.markdown, {title:readMarkdown(document.markdown).properties.title}) : null;
    const path = document?.path ? await availableDocumentPath(tx,document.path,id) : undefined;
    const updated = (
      await tx
        .update(rawNotes)
        .set({ text, ...(document ? { markdown: canonical, title: readMarkdown(document.markdown).properties.title || null, ...(path ? { path } : {}) } : { markdown: null }), version: current.version + 1, updatedAt: new Date() })
        .where(and(eq(rawNotes.id, id), eq(rawNotes.userId, userId)))
        .returning()
    )[0];

    const revisionId = `audit_${randomUUID()}`;
    await tx.insert(auditLog).values({
      id: revisionId,
      userId,
      actorType: "user",
      actorId: userId,
      operation: "raw.update",
      targetType: "raw",
      targetId: id,
      result: "ok",
      // Drizzle 的 jsonb 列会自行 stringify，这里直接传对象（见 notes.ts 里的同类说明）。
      detail: {
        before: current.text,
        after: text,
        version: updated.version,
        beforeMarkdown: current.markdown, afterMarkdown: updated.markdown,
        beforePath: current.path, afterPath: updated.path,
      },
    });

    return { status: "ok" as const, raw: toSource(updated), revisionId };
  });
}
