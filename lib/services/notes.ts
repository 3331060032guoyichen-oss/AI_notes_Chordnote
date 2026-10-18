import { knowledgeMarkdown, applyLegacyPatch, bodyWithoutTitle } from "../documents/compat";
import { readMarkdown, safeDocumentPath } from "../documents/markdown";
import { randomUUID } from "node:crypto";

import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";

import type { Knowledge } from "../../types/knowledge";
import type { Raw } from "../../types/raw";
import { getUserContext } from "../auth/context";
import { getDb, type DbTransaction } from "../db/client";
import { auditLog, noteRevisions, notes, rawNotes } from "../db/schema";

// 知识页（notes）服务层。
// 读路径默认只返回"未归档且未软删除"的行；按 id / rawId 单条读取不过滤（与旧存储行为一致）。
//
// 写路径：
//   - promoteFromSource —— 从原始记录"手动提升"为知识页（按 rawId 幂等），并写入 v1 修订
//   - updateNote        —— 更新知识页（版本 +1、写新修订；带 version 时执行版本检查）

type NoteRow = typeof notes.$inferSelect;

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function toKnowledge(row: NoteRow): Knowledge {
  return {
    id: row.id,
    rawId: row.rawId,
    markdown: knowledgeMarkdown(row),
    path: row.path ?? `wilki/concept/${row.id}.md`,
    title: row.title,
    summary: row.summary,
    content: row.content,
    keyPoints: toStringArray(row.keyPoints),
    concepts: toStringArray(row.concepts),
    keywords: toStringArray(row.keywords),
    version: row.version,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listNotes(): Promise<Knowledge[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.archivedAt), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt));

  return rows.map(toKnowledge);
}

/**
 * 已归档的知识页。
 *
 * 归档的语义是"我不想在日常里看到它"，不是删除 —— 所以必须有一个地方能找回来，
 * 否则归档就是一扇单向门。墓碑（`deleted_at`）与永久清除不在这里：见 AGENTS.md
 * 的删除生命周期，purge 需要独立的高风险流程。
 */
export async function listArchivedNotes(): Promise<Knowledge[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), isNotNull(notes.archivedAt), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt));

  return rows.map(toKnowledge);
}

export type ArchiveNoteResult = { status: "ok"; knowledge: Knowledge } | { status: "not_found" };

/** 归档 / 恢复。`archived: false` 即恢复。 */
export async function setNoteArchived(id: string, archived: boolean): Promise<ArchiveNoteResult> {
  const { db } = await getDb();
  const { userId, actor } = getUserContext();

  return db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, id), eq(notes.userId, userId)))
        .limit(1)
        .for("update")
    )[0];

    if (!current) return { status: "not_found" as const };

    const updated = (
      await tx
        .update(notes)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
        .where(and(eq(notes.id, id), eq(notes.userId, userId)))
        .returning()
    )[0];

    // 归档不写修订：它没有改动正文，写进修订历史只会让"这一页改过什么"变难读。
    // 但它是用户的一次决定，所以进审计。
    await tx.insert(auditLog).values({
      id: `audit_${randomUUID()}`,
      userId,
      actorType: actor.type,
      actorId: actor.id,
      operation: archived ? "note.archive" : "note.restore",
      targetType: "note",
      targetId: id,
      result: "ok",
      detail: { title: updated.title },
    });

    return { status: "ok" as const, knowledge: toKnowledge(updated) };
  });
}

export async function getNote(id: string): Promise<Knowledge | null> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, userId)))
    .limit(1);
  const [row] = rows;

  return row ? toKnowledge(row) : null;
}

/**
 * 取这条原始记录**当前有效**的知识页（已归档、已删除的不算）。
 *
 * 名字里那个 active 是刻意的：调用方是「移除原始记录」的守卫，而**归档只是
 * "我不想在日常里看到它"** —— 那一页已经不占着这条原话的日常位置了。
 * 如果连归档的也算数，用户就没有出口：知识页没有删除接口，归档是它唯一的"处理"方式，
 * 于是"移除了那一页 → 出处却永远删不掉"（2026-10-17 就是这么被绊住的）。
 */
export async function getActiveNoteByRawId(rawId: string): Promise<Knowledge | null> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(notes)
    .where(
      and(
        eq(notes.rawId, rawId),
        eq(notes.userId, userId),
        isNull(notes.archivedAt),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);
  const [row] = rows;

  return row ? toKnowledge(row) : null;
}

export type PromoteInput = {
  rawId: string;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  concepts: string[];
  keywords: string[];
  /** 内容来源：'ai'（来自 AI 整理稿）/ 'user'（手动撰写）。默认 'user'。 */
  origin: "user" | "ai";
};

/**
 * 从原始记录提升为知识页（决策 4：知识页只能这样创建）。
 * 按 rawId 幂等：已存在则原样返回，`created: false`。
 * 同一事务内写入 v1 修订，保证历史从第一版就完整。
 */
export async function promoteFromSource(
  input: PromoteInput,
): Promise<{ knowledge: Knowledge; created: boolean }> {
  const { db } = await getDb();
  const { userId } = getUserContext();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.rawId, input.rawId), eq(notes.userId, userId)))
      .limit(1);

    if (existing[0]) {
      return { knowledge: toKnowledge(existing[0]), created: false };
    }

    const id = `knowledge_${randomUUID()}`;
    const markdown = knowledgeMarkdown({ ...input, createdAt: new Date() });
    const inserted = await tx
      .insert(notes)
      .values({
        id,
        userId,
        rawId: input.rawId,
        markdown,
        path: `wilki/concept/${id}.md`,
        title: input.title,
        summary: input.summary,
        content: input.content,
        // 注意：Drizzle 的 jsonb 列在 mapToDriverValue 里已经 JSON.stringify 一次，
        // 这里必须直接传数组。若再手动 stringify，库里存下的会是 jsonb 字符串而不是数组，
        // SQL 层（`concepts ? 'x'`、jsonb_array_elements、GIN 索引）就查不动了。
        keyPoints: input.keyPoints,
        concepts: input.concepts,
        keywords: input.keywords,
        origin: input.origin,
      })
      .returning();
    const row = inserted[0];

    await tx.insert(noteRevisions).values({
      id: `revision_${randomUUID()}`,
      userId,
      noteId: row.id,
      markdown: row.markdown,
      path: row.path,
      version: row.version,
      title: row.title,
      summary: row.summary,
      content: row.content,
      keyPoints: row.keyPoints,
      concepts: row.concepts,
      keywords: row.keywords,
      authorType: "user",
      authorId: userId,
    });

    return { knowledge: toKnowledge(row), created: true };
  });
}

export type UpdateNoteResult =
  | { status: "ok"; knowledge: Knowledge }
  | { status: "not_found" }
  | { status: "conflict"; knowledge: Knowledge };

export type UpdateNotePatch = Partial<
  Pick<Knowledge, "title" | "summary" | "content" | "keyPoints" | "concepts" | "keywords" | "markdown" | "path">
>;

/**
 * 更新知识页。
 * - 单事务：锁定当前行 → 条件更新（version +1）→ 写入新修订；
 * - `expectedVersion` 提供时执行版本检查，不匹配则返回 conflict（不写入）；
 * - 未提供时按 last-write-wins 处理（现有前端尚未发送 version，保持其可用）。
 */
export async function updateNote(
  id: string,
  patch: UpdateNotePatch,
  expectedVersion?: number,
): Promise<UpdateNoteResult> {
  const { db } = await getDb();
  return db.transaction((tx) => updateNoteInTx(tx, id, patch, expectedVersion));
}

/**
 * 在一个**已有**事务里更新知识页。
 *
 * 与 `updateNote` 语义完全一致，`updateNote` 只是它外面包了一层事务。之所以要暴露
 * 事务内版本：执行 `note_update` 提议时必须把"改正文 → 写入修订 → 更新提议状态 → 写审计"
 * 放进同一个事务，否则中途失败会留下"正文改了但提议还停在 approved"的错位状态。
 */
export async function updateNoteInTx(
  tx: DbTransaction,
  id: string,
  patch: UpdateNotePatch,
  expectedVersion?: number,
): Promise<UpdateNoteResult> {
  const { userId } = getUserContext();

  const current = (
    await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .limit(1)
      .for("update")
  )[0];

  if (!current) return { status: "not_found" as const };

  if (expectedVersion !== undefined && current.version !== expectedVersion) {
    return { status: "conflict" as const, knowledge: toKnowledge(current) };
  }

  const markdown = patch.markdown ?? applyLegacyPatch(knowledgeMarkdown(current), patch);
  const properties = readMarkdown(markdown).properties;
  const normalizedPatch = { ...patch, markdown, title: properties.title || patch.title || current.title,
    summary: properties.description, keywords: properties.tags, content: bodyWithoutTitle(markdown),
    ...(patch.path ? { path: safeDocumentPath(patch.path) } : {}) };
  const updated = (
    await tx
      .update(notes)
      .set({ ...normalizedPatch, version: current.version + 1, updatedAt: new Date() })
      .where(and(eq(notes.id, id), eq(notes.userId, userId)))
      .returning()
  )[0];

  await tx.insert(noteRevisions).values({
    id: `revision_${randomUUID()}`,
    userId,
    noteId: updated.id,
    markdown: updated.markdown,
    path: updated.path,
    version: updated.version,
    title: updated.title,
    summary: updated.summary,
    content: updated.content,
    keyPoints: updated.keyPoints,
    concepts: updated.concepts,
    keywords: updated.keywords,
    authorType: "user",
    authorId: userId,
  });

  return { status: "ok" as const, knowledge: toKnowledge(updated) };
}
