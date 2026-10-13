import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import type { Raw } from "../../types/raw";
import { requireUserActor } from "../auth/authorize";
import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
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

function toSource(row: SourceRow): Raw {
  return {
    id: row.id,
    text: row.text,
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

export async function createSource(text: string): Promise<Raw> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .insert(rawNotes)
    .values({ id: `raw_${randomUUID()}`, userId, text })
    .returning();

  return toSource(rows[0]);
}

/**
 * 归档原始记录（普通"移除"路径）。
 * 只对"尚未归档"的行生效：影响 0 行时返回 null（不存在或已归档），调用方据此返回 404。
 * 不做物理删除——原始记录一旦删除，引用它的知识页会失去出处。
 */
export async function archiveSource(id: string): Promise<Raw | null> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const now = new Date();
  const rows = await db
    .update(rawNotes)
    .set({ archivedAt: now, updatedAt: now })
    .where(and(eq(rawNotes.id, id), eq(rawNotes.userId, userId), isNull(rawNotes.archivedAt)))
    .returning();
  const [row] = rows;

  return row ? toSource(row) : null;
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
export async function updateSource(id: string, text: string): Promise<UpdateSourceResult> {
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

    if (current.text === text) {
      return { status: "unchanged" as const, raw: toSource(current) };
    }

    const updated = (
      await tx
        .update(rawNotes)
        .set({ text, version: current.version + 1, updatedAt: new Date() })
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
      },
    });

    return { status: "ok" as const, raw: toSource(updated), revisionId };
  });
}
