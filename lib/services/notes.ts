import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull } from "drizzle-orm";

import type { Knowledge } from "../../types/knowledge";
import type { Raw } from "../../types/raw";
import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { noteRevisions, notes, rawNotes } from "../db/schema";

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
    title: row.title,
    summary: row.summary,
    content: row.content,
    keyPoints: toStringArray(row.keyPoints),
    concepts: toStringArray(row.concepts),
    keywords: toStringArray(row.keywords),
    version: row.version,
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

export async function getNoteByRawId(rawId: string): Promise<Knowledge | null> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.rawId, rawId), eq(notes.userId, userId)))
    .limit(1);
  const [row] = rows;

  return row ? toKnowledge(row) : null;
}

function titleFromText(text: string) {
  const firstLine = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? "未命名笔记";
  const withoutHeading = firstLine.replace(/^#+\s*/, "").trim() || "未命名笔记";
  return withoutHeading.length > 40 ? `${withoutHeading.slice(0, 40)}…` : withoutHeading;
}

/**
 * 创建一条笔记，同时保留一份不可替代的原始出处。
 * 两张表在同一事务中写入，避免新建笔记只留下 Raw 或只留下 Knowledge。
 */
export async function createNoteFromText(text: string): Promise<{ knowledge: Knowledge; raw: Raw }> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const content = text.trim();
  const title = titleFromText(content);
  const summary = content.replace(/\s+/g, " ").slice(0, 160) || "未添加摘要";

  return db.transaction(async (tx) => {
    const raw = (
      await tx
        .insert(rawNotes)
        .values({ id: `raw_${randomUUID()}`, userId, text })
        .returning()
    )[0];

    const row = (
      await tx
        .insert(notes)
        .values({
          id: `knowledge_${randomUUID()}`,
          userId,
          rawId: raw.id,
          title,
          summary,
          content,
          keyPoints: [],
          concepts: [],
          keywords: [],
          origin: "user",
        })
        .returning()
    )[0];

    await tx.insert(noteRevisions).values({
      id: `revision_${randomUUID()}`,
      userId,
      noteId: row.id,
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

    return {
      knowledge: toKnowledge(row),
      raw: {
        id: raw.id,
        // 原始记录的「笔记名」列（迁移 0004 新增），由用户手填，可与自动标题并存
        title: raw.title,
        text: raw.text,
        createdAt: raw.createdAt.toISOString(),
      },
    };
  });
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
    const inserted = await tx
      .insert(notes)
      .values({
        id,
        userId,
        rawId: input.rawId,
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
  Pick<Knowledge, "title" | "summary" | "content" | "keyPoints" | "concepts" | "keywords">
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
  const { userId } = getUserContext();

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

    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      return { status: "conflict" as const, knowledge: toKnowledge(current) };
    }

    const updated = (
      await tx
        .update(notes)
        .set({ ...patch, version: current.version + 1, updatedAt: new Date() })
        .where(and(eq(notes.id, id), eq(notes.userId, userId)))
        .returning()
    )[0];

    await tx.insert(noteRevisions).values({
      id: `revision_${randomUUID()}`,
      userId,
      noteId: updated.id,
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
  });
}
