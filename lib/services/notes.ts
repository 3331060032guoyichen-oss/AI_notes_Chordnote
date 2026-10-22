import { randomUUID } from "node:crypto";
import { applyLegacyPatch,bodyWithoutTitle,knowledgeMarkdown } from "../documents/compat";
import { patchProperties,readMarkdown } from "../documents/markdown";
import { availableDocumentPath } from "./document-path";

import { and,desc,eq,inArray,isNotNull,isNull,or,sql } from "drizzle-orm";

import type { Knowledge } from "../../types/knowledge";
import { getUserContext, type Actor } from "../auth/context";
import { isRawCategory, isWikiCategory, rawCategory, type RawCategory, type WikiCategory } from "../documents/structure";
import { classifySourceInTx } from "./sources";
import { getDb,type DbTransaction } from "../db/client";
import { auditLog,noteRevisions,notes,noteSources,rawNotes } from "../db/schema";

// 知识页（notes）服务层。
// 读路径默认只返回"未归档且未软删除"的行；按 id / rawId 单条读取不过滤（与旧存储行为一致）。
//
// 写路径：
//   - promoteFromSource —— 从原始记录"手动提升"为知识页（按 rawId 幂等），并写入 v1 修订
//   - updateNote        —— 更新知识页（版本 +1、写新修订；带 version 时执行版本检查）

type NoteRow = typeof notes.$inferSelect;

/** 知识页的默认保鲜期；体检据此判断过期页。 */
const STALE_AFTER_DAYS = 90;
const nextStaleAfter = () => new Date(Date.now() + STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/** 标题判重不区分大小写与 Unicode 组合形式；显示仍用原文。 */
function normalizeNoteTitle(title: string): string {
  return title.normalize("NFC").toLocaleLowerCase().trim();
}

/** 正文判重忽略首个一级标题：收录时存的是草稿原文，编辑后存的是去掉标题的正文。 */
function noteBody(value: string): string {
  return value.replace(/^\s*#\s[^\n]*\n?/, "").trim();
}

/** 标题被自动编号时，正文里的首个一级标题要一起改，否则会出现两个 H1。 */
function rewriteHeading(markdown: string, title: string): string {
  return /^\s*#\s/.test(markdown) ? markdown.replace(/^(\s*)#\s[^\n]*/, `$1# ${title}`) : markdown;
}

function toKnowledge(row: NoteRow, sourceRawIds: string[] = [row.rawId]): Knowledge {
  return {
    id: row.id,
    rawId: row.rawId,
    sourceRawIds: [...new Set([row.rawId, ...sourceRawIds])],
    markdown: knowledgeMarkdown(row),
    path: row.path ?? `wilki/concept/${row.id}.md`,
    title: row.title,
    summary: row.summary,
    content: row.content,
    keyPoints: toStringArray(row.keyPoints),
    concepts: toStringArray(row.concepts),
    keywords: toStringArray(row.keywords),
    confidence: row.confidence,
    staleAfter: row.staleAfter ? row.staleAfter.toISOString() : null,
    version: row.version,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function sourceIdsByNoteIds(noteIds: string[]): Promise<Map<string, string[]>> {
  const grouped = new Map<string, string[]>();
  if (!noteIds.length) return grouped;
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db.select({ noteId: noteSources.noteId, rawId: noteSources.rawId })
    .from(noteSources)
    .where(and(eq(noteSources.userId, userId), inArray(noteSources.noteId, noteIds)));
  for (const row of rows) grouped.set(row.noteId, [...(grouped.get(row.noteId) ?? []), row.rawId]);
  return grouped;
}

async function asKnowledgeList(rows: NoteRow[]): Promise<Knowledge[]> {
  const sourceIds = await sourceIdsByNoteIds(rows.map(row => row.id));
  return rows.map(row => toKnowledge(row, sourceIds.get(row.id)));
}

export async function listNotes(): Promise<Knowledge[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(notes)
    .where(and(eq(notes.userId, userId), isNull(notes.archivedAt), isNull(notes.deletedAt)))
    .orderBy(desc(notes.updatedAt));

  return asKnowledgeList(rows);
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

  return asKnowledgeList(rows);
}

export type ArchiveNoteResult = { status: "ok"; knowledge: Knowledge } | { status: "not_found" };

/** 归档 / 恢复。`archived: false` 即恢复。 */
export async function setNoteArchived(id: string, archived: boolean, actorOverride?: Actor, expectedVersion?: number): Promise<ArchiveNoteResult> {
  const { db } = await getDb();
  const { userId, actor } = getUserContext(actorOverride);

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
    if (expectedVersion !== undefined && current.version !== expectedVersion) throw new Error("VERSION_CONFLICT");

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

  if (!row) return null;
  return toKnowledge(row, (await sourceIdsByNoteIds([row.id])).get(row.id));
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
    .select({ note: notes })
    .from(notes)
    .innerJoin(noteSources, and(eq(noteSources.noteId, notes.id), eq(noteSources.userId, userId)))
    .where(
      and(
        eq(noteSources.rawId, rawId),
        eq(notes.userId, userId),
        isNull(notes.archivedAt),
        isNull(notes.deletedAt),
      ),
    )
    .limit(1);
  const row = rows[0]?.note;

  if (!row) return null;
  return toKnowledge(row, (await sourceIdsByNoteIds([row.id])).get(row.id));
}

export type PromoteInput = {
  rawCategory?: RawCategory;
  wikiCategory?: WikiCategory;
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
 *
 * 一份材料可以产出多张页（来源摘要页、实体页、概念页……）。幂等按
 * **（Raw, 标题, 正文）** 判定：同一份材料提交同一标题与同一正文视为重试，
 * 返回已有页；否则新建，标题撞车时按仓库惯例追加 1、2 编号（如「Python 协程1」）。
 * Raw 与知识页的关系仍以 `note_sources` 为准，`raw_id` 只记录主要来源。
 */
export async function promoteFromSource(
  input: PromoteInput,
  actorOverride?: Actor,
): Promise<{ knowledge: Knowledge; created: boolean }> {
  if (!input.title.trim() || /^(?:#{1,6}|---|\.\.\.)$/.test(input.title.trim())) {
    throw new Error("INVALID_NOTE_TITLE");
  }
  if (input.origin === "ai" && (!isRawCategory(input.rawCategory) || !isWikiCategory(input.wikiCategory))) {
    throw new Error("AI_DRAFT_CATEGORY_REQUIRED");
  }
  const { db } = await getDb();
  const { userId, actor } = getUserContext(actorOverride);

  return db.transaction(async (tx) => {
    // Lock the source first so concurrent confirmations cannot duplicate a page.
    const source = (await tx.select().from(rawNotes).where(and(eq(rawNotes.id, input.rawId), eq(rawNotes.userId, userId), isNull(rawNotes.archivedAt))).limit(1).for("update"))[0];
    if (!source) throw new Error("RAW_NOT_FOUND");

    // 来源的载体分类属于 Raw 本身：第一次由 AI 整理时，采用草稿给出的
    // 分类（也能修正旧数据里统一落在 articles 的路径）；完成过一次明确分类
    // 后，后一张页不能再把同一来源搬到别的目录。
    const pathCategory = source.path?.replace(/\\/g, "/").split("/")[1];
    const classifications = await tx.select({ detail: auditLog.detail }).from(auditLog)
      .where(and(eq(auditLog.userId, userId), eq(auditLog.operation, "raw.classify"), eq(auditLog.targetId, input.rawId)))
      .limit(20);
    const classifiedBefore = classifications.some(row => {
      const detail = row.detail && typeof row.detail === "object" ? row.detail as Record<string, unknown> : {};
      return detail.sourceAttachment !== true;
    });
    const sourceCategory = input.origin === "ai" && !classifiedBefore && isRawCategory(input.rawCategory)
      ? input.rawCategory
      : (isRawCategory(pathCategory) ? pathCategory : (input.rawCategory ?? rawCategory(source.path)));

    const linkedIds = (await tx.select({ id: noteSources.noteId }).from(noteSources)
      .where(and(eq(noteSources.userId, userId), eq(noteSources.rawId, input.rawId)))).map(row => row.id);
    const candidates = await tx.select().from(notes).where(and(eq(notes.userId, userId), linkedIds.length
      ? or(eq(notes.rawId, input.rawId), inArray(notes.id, linkedIds))
      : eq(notes.rawId, input.rawId)));
    const duplicate = candidates.find(note => normalizeNoteTitle(note.title) === normalizeNoteTitle(input.title)
      && noteBody(note.content) === noteBody(input.content));

    if (duplicate) {
      await attachSourcesToNoteInTx(tx, duplicate.id, [{ rawId: input.rawId, rawCategory: sourceCategory }], actor);
      return { knowledge: toKnowledge(duplicate), created: false };
    }

    // 标题在整库里唯一，避免 wikilink 解析歧义；重复时追加 1、2（与「未命名1」同一约定）。
    const usedTitles = new Set((await tx.select({ title: notes.title }).from(notes)
      .where(eq(notes.userId, userId))).map(row => normalizeNoteTitle(row.title)));
    const baseTitle = input.title.trim();
    let title = baseTitle;
    if (usedTitles.has(normalizeNoteTitle(title))) {
      let suffix = 1;
      while (usedTitles.has(normalizeNoteTitle(`${baseTitle}${suffix}`))) suffix += 1;
      title = `${baseTitle}${suffix}`;
    }
    const content = title === baseTitle ? input.content : rewriteHeading(input.content, title);

    const id = `knowledge_${randomUUID()}`;
    const markdown = knowledgeMarkdown({ ...input, title, content, createdAt: new Date() });
    const inserted = await tx
      .insert(notes)
      .values({
        id,
        userId,
        rawId: input.rawId,
        markdown,
        path: `wilki/${input.wikiCategory ?? "concept"}/${id}.md`,
        title,
        summary: input.summary,
        content,
        // 注意：Drizzle 的 jsonb 列在 mapToDriverValue 里已经 JSON.stringify 一次，
        // 这里必须直接传数组。若再手动 stringify，库里存下的会是 jsonb 字符串而不是数组，
        // SQL 层（`concepts ? 'x'`、jsonb_array_elements、GIN 索引）就查不动了。
        keyPoints: input.keyPoints,
        concepts: input.concepts,
        keywords: input.keywords,
        origin: input.origin,
        confidence: "medium",
        staleAfter: nextStaleAfter(),
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
      authorType: actor.type,
      authorId: actor.id,
    });

    await attachSourcesToNoteInTx(tx, row.id, [{ rawId: input.rawId, rawCategory: sourceCategory }], actor);
    await tx.insert(auditLog).values({ id: `audit_${randomUUID()}`, userId, actorType: actor.type, actorId: actor.id,
      operation: "note.create", targetType: "note", targetId: row.id, result: "ok", detail: { rawId: input.rawId, permission: actor.type === "agent" ? "full" : "propose" } });

    return { knowledge: toKnowledge(row), created: true };
  });
}

export type SourceAttachment = { rawId: string; rawCategory: RawCategory };

/**
 * 把一个或多个 Raw 作为知识页的正式来源并按建议分类。
 *
 * 正文里的“来源”区块方便阅读，但这里才是检索、已整理判断和 Raw 目录迁移共用的
 * 事实边界；因此合并补充资料也必须走这一处。
 */
export async function attachSourcesToNoteInTx(
  tx: DbTransaction,
  noteId: string,
  attachments: SourceAttachment[],
  actorOverride?: Actor,
): Promise<string[]> {
  const { userId, actor } = getUserContext(actorOverride);
  const unique = [...new Map(attachments.map(item => [item.rawId, item])).values()];
  for (const attachment of unique) {
    if (!attachment.rawId || !attachment.rawCategory) throw new Error("INVALID_SOURCE_ATTACHMENT");
    await tx.insert(noteSources).values({ noteId, rawId: attachment.rawId, userId }).onConflictDoNothing();
    await classifySourceInTx(tx, attachment.rawId, attachment.rawCategory, actor, undefined, { sourceAttachment: true });
  }
  if (unique.length) {
    // 多来源交叉确认才升到 high；单来源保持 medium（见 enums.ts 的说明）。
    const sources = await tx.select({ count: sql<number>`count(*)::int` }).from(noteSources)
      .where(and(eq(noteSources.noteId, noteId), eq(noteSources.userId, userId)));
    if (Number(sources[0]?.count ?? 0) >= 2) {
      await tx.update(notes).set({ confidence: "high" }).where(and(eq(notes.id, noteId), eq(notes.userId, userId)));
    }
  }
  if (unique.length) await tx.insert(auditLog).values({
    id: `audit_${randomUUID()}`, userId, actorType: actor.type, actorId: actor.id,
    operation: "note.sources.attach", targetType: "note", targetId: noteId, result: "ok",
    detail: { sourceIds: unique.map(item => item.rawId), categories: unique.map(item => item.rawCategory) },
  });
  return unique.map(item => item.rawId);
}

/** 事务外入口，供导入等用户发起的批量操作复用同一来源关联规则。 */
export async function attachSourcesToNote(noteId: string, attachments: SourceAttachment[], actorOverride?: Actor): Promise<string[]> {
  const { db } = await getDb();
  return db.transaction(tx => attachSourcesToNoteInTx(tx, noteId, attachments, actorOverride));
}

export type UpdateNoteResult =
  | { status: "ok"; knowledge: Knowledge }
  | { status: "not_found" }
  | { status: "conflict"; knowledge: Knowledge };

export async function classifyNote(id: string, category: string, expectedVersion: number, actorOverride?: Actor) {
  if (!isWikiCategory(category)) throw new Error("INVALID_WIKI_CATEGORY");
  const { db } = await getDb();
  const { userId, actor } = getUserContext(actorOverride);
  return db.transaction(async tx => {
    const result = await updateNoteInTx(tx, id, { path: `wilki/${category}/${id}.md` }, expectedVersion, actor);
    if (result.status !== "ok") throw new Error(result.status === "conflict" ? "VERSION_CONFLICT" : "NOTE_NOT_FOUND");
    await tx.insert(auditLog).values({ id: `audit_${randomUUID()}`, userId, actorType: actor.type, actorId: actor.id,
      operation: "note.classify", targetType: "note", targetId: id, result: "ok", detail: { path: result.knowledge.path, version: result.knowledge.version } });
    return result.knowledge;
  });
}

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
  actorOverride?: Actor,
): Promise<UpdateNoteResult> {
  const { userId, actor } = getUserContext(actorOverride);

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

  let markdown = patch.markdown ?? applyLegacyPatch(knowledgeMarkdown(current), patch);
  const properties = readMarkdown(markdown).properties;
  if (readMarkdown(markdown).data.title !== properties.title) markdown = patchProperties(markdown, {title:properties.title});
  const normalizedPatch = { ...patch, markdown, title: properties.title || patch.title || current.title,
    summary: properties.description, keywords: properties.tags, content: bodyWithoutTitle(markdown),
    ...(patch.path ? { path: await availableDocumentPath(tx, patch.path, id) } : {}) };
  const updated = (
    await tx
      .update(notes)
      .set({ ...normalizedPatch, version: current.version + 1, updatedAt: new Date(), staleAfter: nextStaleAfter() })
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
    authorType: actor.type,
    authorId: actor.id,
  });

  return { status: "ok" as const, knowledge: toKnowledge(updated) };
}
