import { sql } from "drizzle-orm";
import { check } from "drizzle-orm/pg-core";

// ===========================================================================
// 枚举值的唯一来源（single source of truth）
//
// 用途：
//   1. Drizzle Schema —— 生成数据库 CHECK 约束，并给列带来 TypeScript 联合类型；
//   2. 后续 API / 服务层校验 —— 直接引用同一份数组，避免"代码与约束各说各话"。
//
// 语义约定（2026-10-10 决策）：
//   - origin      表示"内容来源"：这条记录由谁产生（用户提供 / AI 生成）→ user | ai
//   - actor_type / author_type 表示"操作主体"：谁执行了这次操作 → user | agent | system
// ===========================================================================

/** 内容来源（notes.origin / note_tags.origin / proposals.origin / links.origin） */
export const CONTENT_ORIGINS = ["user", "ai"] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

/** 操作主体（note_revisions.author_type / audit_log.actor_type） */
export const ACTOR_TYPES = ["user", "agent", "system"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** 正式关系类型。当前代码只产生 related（见 app/api/relations/route.ts）；扩展需另开迁移。 */
export const LINK_TYPES = ["related"] as const;
export type LinkType = (typeof LINK_TYPES)[number];

/** 变更提议类型（proposals.kind） */
export const PROPOSAL_KINDS = [
  "note_update",
  "link_create",
  "link_delete",
  "note_merge",
  "bulk_organize",
  "moc_update",
  // 把一条原始记录（如错题）存进知识库。走提议而非直接写入：
  // 原始记录是 AI 不得改写的对象，新建同样必须经用户确认（AGENTS.md 改动边界）。
  "source_create",
  "schema_preferences",
] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];

/** 变更提议状态（proposals.status）。合法状态转换见 07 号文档 §7.2。 */
export const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "applied",
  "failed",
  "stale",
  "cancelled",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** 风险级别（proposals.risk_level） */
export const RISK_LEVELS = ["low", "medium", "high"] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** 审计结果（audit_log.result） */
export const AUDIT_RESULTS = ["ok", "failed", "partial"] as const;
export type AuditResult = (typeof AUDIT_RESULTS)[number];

// 说明：note_ai_metadata.status 故意不在此定义。
// 该表目前没有任何写入路径，候选状态与转换规则尚未确认；
// 待确认后在此补充常量，并追加一个迁移来增加对应 CHECK。

/**
 * 生成 `CHECK ("column" in ('a','b'))`。
 *
 * 值来自本文件的常量，不接受外部输入；对单引号做转义仅为防御性写法。
 * 返回 CheckBuilder，可直接放进 pgTable 第三个参数的 extras 对象。
 */
export function inListCheck(
  constraintName: string,
  columnName: string,
  values: readonly string[],
) {
  const list = values.map((value) => `'${value.replace(/'/g, "''")}'`).join(", ");
  return check(constraintName, sql.raw(`"${columnName}" in (${list})`));
}
