import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  ACTOR_TYPES,
  AUDIT_RESULTS,
  CONTENT_ORIGINS,
  LINK_TYPES,
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  RISK_LEVELS,
  inListCheck,
} from "./enums";

// ===========================================================================
// Data model（对应 docs 阶段 C：07 号文件 §6.3；枚举语义见 lib/db/enums.ts）
// 命名约定：英文标识符；主键用 text，沿用 raw_/knowledge_/link_ 前缀风格。
// 所有业务表带 user_id（演示期为 DEFAULT_OWNER_ID），并按 user_id 建索引。
//
// 删除策略（2026-10-10 决策）：
//   - 笔记不硬删除：`archived_at` = 暂时收起（仍可见于"已归档"视图）；
//     `deleted_at` = 墓碑式软删（用户主动删除时打标记，常规查询隐藏，可恢复）；
//   - 墓碑保留笔记行、修订、提议、正式关系与审计链；恢复 = 清空 deleted_at；
//   - 正式关系（links）同样采用可恢复软删除（`deleted_at`），常规查询隐藏已删除关系；
//   - note_revisions / proposals / links 对 notes 的外键一律 RESTRICT，
//     任何删除都不会静默带走历史或正式关系；
//   - audit_log 无外键，天然不受级联影响。
// ===========================================================================

const id = text("id").primaryKey();
const userId = text("user_id").notNull();
const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---- 原始记录（用户可改、AI 不可改）------------------------------------
export const rawNotes = pgTable(
  "raw_notes",
  {
    id,
    userId,
    // 笔记名：可选。留空时列表回退为正文预览（记录原话的门槛不该被标题抬高）
    title: text("title"),
    text: text("text").notNull(),
    version: integer("version").notNull().default(1),
    // 归档优先：删除治理统一为"先归档"，永久删除属独立高风险流程
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userIdIdx: index("raw_notes_user_id_idx").on(table.userId),
  }),
);

// ---- 知识页（正式内容；正文/标题对 Agent 而言需走提议）------------------
export const notes = pgTable(
  "notes",
  {
    id,
    userId,
    rawId: text("raw_id")
      .notNull()
      .references(() => rawNotes.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    // 用户确认后的结构化字段（沿袭现有 Knowledge 的字段，迁移不丢数据）
    keyPoints: jsonb("key_points").notNull().default(sql`'[]'::jsonb`),
    concepts: jsonb("concepts").notNull().default(sql`'[]'::jsonb`),
    keywords: jsonb("keywords").notNull().default(sql`'[]'::jsonb`),
    version: integer("version").notNull().default(1),
    origin: text("origin", { enum: CONTENT_ORIGINS }).notNull().default("user"),
    // 归档：暂时收起，不隐藏
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // 墓碑：常规查询隐藏，可恢复（清空该列）；永久清除属独立流程，另行设计
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => ({
    userIdIdx: index("notes_user_id_idx").on(table.userId),
    rawIdIdx: index("notes_raw_id_idx").on(table.rawId),
    originCheck: inListCheck("notes_origin_check", "origin", CONTENT_ORIGINS),
  }),
);

// ---- 笔记版本历史（不可变；每行是一份完整快照，因此笔记消失后仍可读）----
export const noteRevisions = pgTable(
  "note_revisions",
  {
    id,
    userId,
    // RESTRICT：不允许因删除笔记而级联丢弃修订历史
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    content: text("content").notNull(),
    keyPoints: jsonb("key_points").notNull(),
    concepts: jsonb("concepts").notNull(),
    keywords: jsonb("keywords").notNull(),
    authorType: text("author_type", { enum: ACTOR_TYPES }).notNull(),
    authorId: text("author_id").notNull(),
    proposalId: text("proposal_id"),
    createdAt,
  },
  (table) => ({
    noteVersionIdx: index("note_revisions_note_version_idx").on(table.noteId, table.version),
    authorTypeCheck: inListCheck("note_revisions_author_type_check", "author_type", ACTOR_TYPES),
  }),
);

// ---- 标签 -----------------------------------------------------------------
export const tags = pgTable(
  "tags",
  {
    id,
    userId,
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    createdAt,
  },
  (table) => ({
    userNormalizedIdx: uniqueIndex("tags_user_normalized_idx").on(table.userId, table.normalizedName),
  }),
);

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    origin: text("origin", { enum: CONTENT_ORIGINS }).notNull().default("user"),
    createdAt,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.noteId, table.tagId] }),
    tagIdx: index("note_tags_tag_idx").on(table.tagId),
    originCheck: inListCheck("note_tags_origin_check", "origin", CONTENT_ORIGINS),
  }),
);

// ---- 正式关系（有向；候选关系只存在于 proposals）-------------------------
export const links = pgTable(
  "links",
  {
    id,
    userId,
    // RESTRICT：删笔记不得静默清掉已确认的正式关系
    sourceNoteId: text("source_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "restrict" }),
    targetNoteId: text("target_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "restrict" }),
    type: text("type", { enum: LINK_TYPES }).notNull().default("related"),
    reason: text("reason").notNull(),
    origin: text("origin", { enum: CONTENT_ORIGINS }).notNull().default("user"),
    proposalId: text("proposal_id"),
    // 可恢复软删除：普通删除只打标记，常规查询隐藏（deleted_at is null）
    // 注意：links_pair_idx 不是部分索引，因此"重新建立同一关系"必须复活已有行
    //      （清空 deleted_at），而不是插入新行——详见 10-purge永久清除设计.md
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt,
  },
  (table) => ({
    userIdIdx: index("links_user_id_idx").on(table.userId),
    sourceIdx: index("links_source_idx").on(table.sourceNoteId),
    targetIdx: index("links_target_idx").on(table.targetNoteId),
    uniquePair: uniqueIndex("links_pair_idx").on(
      table.userId,
      table.sourceNoteId,
      table.targetNoteId,
      table.type,
    ),
    typeCheck: inListCheck("links_type_check", "type", LINK_TYPES),
    originCheck: inListCheck("links_origin_check", "origin", CONTENT_ORIGINS),
  }),
);

// ---- AI 元数据（独立表；与正文分离，Agent 白名单可直接写）----------------
export const noteAiMetadata = pgTable(
  "note_ai_metadata",
  {
    id,
    userId,
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    aiSummary: text("ai_summary"),
    candidateConcepts: jsonb("candidate_concepts").notNull().default(sql`'[]'::jsonb`),
    candidateKeywords: jsonb("candidate_keywords").notNull().default(sql`'[]'::jsonb`),
    classification: text("classification"),
    extractedEntities: jsonb("extracted_entities").notNull().default(sql`'[]'::jsonb`),
    // 故意不加 CHECK：合法状态集与转换规则尚未确认（尚无写入路径）。
    // 确认后在 lib/db/enums.ts 增加常量，并用新迁移补 CHECK。
    status: text("status").notNull().default("pending"),
    modelName: text("model_name"),
    sourceVersion: integer("source_version"),
    createdAt,
    updatedAt,
  },
  (table) => ({
    noteUnique: uniqueIndex("note_ai_metadata_note_idx").on(table.noteId),
    userIdIdx: index("note_ai_metadata_user_idx").on(table.userId),
  }),
);

// ---- 变更提议 -------------------------------------------------------------
export const proposals = pgTable(
  "proposals",
  {
    id,
    userId,
    kind: text("kind", { enum: PROPOSAL_KINDS }).notNull(),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull().default("pending"),
    // RESTRICT：保留提议历史，禁止有历史提议时直接硬删除目标笔记
    targetNoteId: text("target_note_id").references(() => notes.id, { onDelete: "restrict" }),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    diff: jsonb("diff"),
    reason: text("reason"),
    impact: jsonb("impact"),
    riskLevel: text("risk_level", { enum: RISK_LEVELS }).notNull().default("medium"),
    baseVersion: integer("base_version"),
    origin: text("origin", { enum: CONTENT_ORIGINS }).notNull().default("ai"),
    agentId: text("agent_id"),
    result: jsonb("result"),
    createdAt,
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
  },
  (table) => ({
    userIdIdx: index("proposals_user_id_idx").on(table.userId),
    statusIdx: index("proposals_status_idx").on(table.userId, table.status),
    kindCheck: inListCheck("proposals_kind_check", "kind", PROPOSAL_KINDS),
    statusCheck: inListCheck("proposals_status_check", "status", PROPOSAL_STATUSES),
    riskLevelCheck: inListCheck("proposals_risk_level_check", "risk_level", RISK_LEVELS),
    originCheck: inListCheck("proposals_origin_check", "origin", CONTENT_ORIGINS),
  }),
);

// ---- 审计日志（无外键：任何级联删除都不会影响它）--------------------------
export const auditLog = pgTable(
  "audit_log",
  {
    id,
    userId,
    actorType: text("actor_type", { enum: ACTOR_TYPES }).notNull(),
    actorId: text("actor_id").notNull(),
    operation: text("operation").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    proposalId: text("proposal_id"),
    idempotencyKey: text("idempotency_key"),
    result: text("result", { enum: AUDIT_RESULTS }).notNull(),
    detail: jsonb("detail"),
    createdAt,
  },
  (table) => ({
    userIdIdx: index("audit_log_user_id_idx").on(table.userId),
    targetIdx: index("audit_log_target_idx").on(table.targetType, table.targetId),
    actorTypeCheck: inListCheck("audit_log_actor_type_check", "actor_type", ACTOR_TYPES),
    resultCheck: inListCheck("audit_log_result_check", "result", AUDIT_RESULTS),
  }),
);

// ---- 幂等键 ---------------------------------------------------------------
export const idempotencyKeys = pgTable(
  "idempotency_keys",
  {
    key: text("key").notNull(),
    userId,
    operation: text("operation").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: jsonb("response_json"),
    createdAt,
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.key] }),
  }),
);

// ---- 远程 MCP 凭据（可撤销）------------------------------------------------
export const agentTokens = pgTable(
  "agent_tokens",
  {
    id,
    userId,
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopes: jsonb("scopes").notNull().default(sql`'[]'::jsonb`),
    createdAt,
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("agent_tokens_hash_idx").on(table.tokenHash),
    userIdIdx: index("agent_tokens_user_id_idx").on(table.userId),
  }),
);
