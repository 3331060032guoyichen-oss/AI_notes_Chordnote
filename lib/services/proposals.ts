import { randomUUID } from "node:crypto";

import { and, desc, eq, inArray, lt, or, type SQL } from "drizzle-orm";

import type { Proposal } from "../../types/proposal";
import { getUserContext, type Actor } from "../auth/context";
import { getDb, type DbTransaction } from "../db/client";
import type { ContentOrigin, LinkType, ProposalKind, ProposalStatus, RiskLevel } from "../db/enums";
import { LINK_TYPES } from "../db/enums";
import { auditLog, idempotencyKeys, notes, proposals } from "../db/schema";
import { createOrReviveLinkInTx } from "./links";
import { attachSourcesToNoteInTx, updateNoteInTx, type SourceAttachment } from "./notes";
import { MAX_RAW_TEXT_LENGTH, createSourceInTx } from "./sources";
import { applyPreferences } from "./agent-schema";
import { validPreferences } from "../agent/preferences";
import { isRawCategory, isWikiCategory } from "../documents/structure";

// 变更提议（proposals）服务层。
//
// 这是"AI 提议 → 用户确认 → 服务端执行"这条链路的唯一落点。红线（AGENTS.md 改动边界、
// docs/tasks/03）在这里具体化为三点：
//   1. 本文件只提供"创建提议"与"执行已批准的提议"，**没有**任何"直接写入"的入口；
//   2. AI 的写入意图一律先落成 status='pending' 的行，用户批准（approved）后才可能被 apply；
//   3. 归属过滤（user_id）写在服务层，路由 / MCP / 内置 Agent 任一入口都自动继承。
//
// 状态转换与事务边界按 docs/reports/07 §7.2、§8 实现：合法转换用表驱动的
// ALLOWED_TRANSITIONS 判定；T4（执行提议）要求"写正式数据 → 更新提议状态 → 写审计"
// 在同一个事务内完成，任一步失败整体回滚。

export type ProposalErrorCode =
  | "PROPOSAL_NOT_FOUND"
  | "PROPOSAL_INVALID_TRANSITION"
  | "PROPOSAL_KIND_UNSUPPORTED"
  | "PROPOSAL_PAYLOAD_INVALID"
  | "PROPOSAL_TARGET_MISSING"
  /**
   * 目标在提议生成之后被改过，提议里的内容已经不是基于最新版写的。
   * 单独一个码，是因为它对应状态机里 `approved → stale`（而不是 `failed`）：
   * 过期提议只能重新生成，不能硬写进去。
   */
  | "PROPOSAL_TARGET_STALE";

export class ProposalError extends Error {
  constructor(
    public readonly code: ProposalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProposalError";
  }
}

type ProposalRow = typeof proposals.$inferSelect;

/**
 * 合法状态转换（docs/reports/07 §7.2）。
 *
 * 写成表而不是散落的 if：非法转换必须由服务端统一拒绝。
 * 特别注意 `applied` / `rejected` / `cancelled` 的出边为空——它们不能再回到 `pending`，
 * `stale` 的出边同样为空——过期提议只能重新生成，不能直接执行。
 */
const ALLOWED_TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  pending: ["approved", "rejected", "cancelled"],
  approved: ["applied", "failed", "stale"],
  rejected: [],
  applied: [],
  failed: [],
  stale: [],
  cancelled: [],
};

/**
 * 能真正执行的提议类型。
 *
 * 新增一种 = 在这里加一项 + 在 `applyKindEffect` 里加一个 case，两处必须同时改。
 * 不在表里的类型在**创建时**就被拒绝，避免留下永远不会被执行掉的 pending 行。
 */
const SUPPORTED_KINDS: readonly ProposalKind[] = [
  "link_create",
  "source_create",
  "note_update",
  "schema_preferences",
];

function assertTransition(from: ProposalStatus, to: ProposalStatus): void {
  if (!ALLOWED_TRANSITIONS[from].includes(to)) {
    throw new ProposalError(
      "PROPOSAL_INVALID_TRANSITION",
      `提议当前状态是「${from}」，不能变成「${to}」。`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// jsonb 列在 Drizzle 里推成 `unknown`，所以读写都要收口一次。
// 这两处不做校验（形状的校验在创建时做），只保证类型上是个对象。
function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function asRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function toProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    riskLevel: row.riskLevel,
    origin: row.origin,
    reason: row.reason,
    payload: asRecord(row.payload),
    impact: asRecordOrNull(row.impact),
    targetNoteId: row.targetNoteId,
    baseVersion: row.baseVersion,
    agentId: row.agentId,
    result: asRecordOrNull(row.result),
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    appliedAt: row.appliedAt ? row.appliedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// 读
// ---------------------------------------------------------------------------

export async function getProposal(id: string): Promise<Proposal | null> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
    .limit(1);

  return rows[0] ? toProposal(rows[0]) : null;
}

export type ListProposalsInput = {
  /** 默认只看待处理的提议（与 docs/reports/08 的接口约定一致）。 */
  status?: ProposalStatus | "all";
  /** 只看针对某张知识页的提议 —— 知识页右栏要按当前标签取，不能把全库的提议都端上来。 */
  targetNoteId?: string | null;
  limit?: number;
  /** 上一页返回的 `nextCursor`，原样传回即可。 */
  cursor?: string | null;
};

export type ListProposalsResult = {
  proposals: Proposal[];
  nextCursor: string | null;
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 100;

/**
 * 游标分页。游标是 `${createdAt.toISOString()}|${id}`。
 *
 * 只用 createdAt 做游标会在同一毫秒建了两条时漏掉一条，所以用 (createdAt, id) 复合键，
 * 排序也用同一组键 —— 排序键与游标键一致，翻页才不会跳行。
 */
export async function listProposals(
  input: ListProposalsInput = {},
): Promise<ListProposalsResult> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const status = input.status ?? "pending";
  const limit = Math.min(
    Math.max(1, Math.trunc(input.limit ?? DEFAULT_LIST_LIMIT)),
    MAX_LIST_LIMIT,
  );

  const conditions: SQL[] = [eq(proposals.userId, userId)];

  if (status !== "all") conditions.push(eq(proposals.status, status));

  if (input.targetNoteId) conditions.push(eq(proposals.targetNoteId, input.targetNoteId));

  if (input.cursor) {
    const [rawTime, cursorId] = input.cursor.split("|");
    const cursorTime = new Date(rawTime);

    if (!Number.isNaN(cursorTime.getTime()) && cursorId) {
      // 比游标更旧：(createdAt < t) 或 (createdAt = t 且 id < cursorId)
      const cursorCondition = or(
        lt(proposals.createdAt, cursorTime),
        and(eq(proposals.createdAt, cursorTime), lt(proposals.id, cursorId)),
      );

      if (cursorCondition) conditions.push(cursorCondition);
    }
  }

  // 多取一条用于判断还有没有下一页，返回前丢掉
  const rows = await db
    .select()
    .from(proposals)
    .where(and(...conditions))
    .orderBy(desc(proposals.createdAt), desc(proposals.id))
    .limit(limit + 1);

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    proposals: page.map(toProposal),
    nextCursor:
      rows.length > limit && last
        ? `${last.createdAt.toISOString()}|${last.id}`
        : null,
  };
}

// ---------------------------------------------------------------------------
// 创建
// ---------------------------------------------------------------------------

export type CreateProposalInput = {
  kind: ProposalKind;
  payload: Record<string, unknown>;
  reason?: string | null;
  targetNoteId?: string | null;
  baseVersion?: number | null;
  riskLevel?: RiskLevel;
  impact?: Record<string, unknown> | null;
  /**
   * 内容来源。**由服务端代码决定，绝不来自请求体**（docs/reports/07 §5.3F 第 2 条）：
   * 内置 Agent 循环传 "ai"，网页表单走默认值 "user"。
   */
  origin?: ContentOrigin;
  /** 发起提议的 agent 标识，`origin = "ai"` 时使用。 */
  agentId?: string | null;
};

const DEFAULT_AGENT_ID = "chordnote-organizer";

function assertLinkCreatePayload(payload: Record<string, unknown>): void {
  if (
    !isNonEmptyString(payload.sourceId) ||
    !isNonEmptyString(payload.targetId) ||
    !isNonEmptyString(payload.reason)
  ) {
    throw new ProposalError(
      "PROPOSAL_PAYLOAD_INVALID",
      "建立关联的提议缺少起始知识页、目标知识页或理由。",
    );
  }

  if (payload.sourceId === payload.targetId) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "同一张知识页无需与自己建立关联。");
  }

  if (payload.type !== undefined && !LINK_TYPES.includes(payload.type as LinkType)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "无法识别这种关联类型。");
  }

  // 有方向的关系必须带证据，否则只是一句"感觉相关"。
  if (payload.type !== undefined && payload.type !== "related" && !isNonEmptyString(payload.evidence)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "有方向的关联需要给出支撑它的原文证据。");
  }
}

function assertSourceCreatePayload(payload: Record<string, unknown>): void {
  if (!isNonEmptyString(payload.text)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "存为原始记录的提议没有正文。");
  }

  if (payload.text.length > MAX_RAW_TEXT_LENGTH) {
    throw new ProposalError(
      "PROPOSAL_PAYLOAD_INVALID",
      `原始记录正文超过 ${MAX_RAW_TEXT_LENGTH} 字上限。`,
    );
  }

  if (payload.title !== undefined && payload.title !== null && !isNonEmptyString(payload.title)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "标题不能是空字符串。");
  }
}

function assertNoteUpdatePayload(payload: Record<string, unknown>): void {
  if (!isNonEmptyString(payload.noteId)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "改写提议没有指明要改哪张知识页。");
  }

  if (!isNonEmptyString(payload.content)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "改写提议没有给出改写后的正文。");
  }

  // 理由不是装饰：Diff 卡上要显示它，用户靠这句话判断该不该接受。
  if (!isNonEmptyString(payload.reason)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "改写提议缺少理由，用户无从判断。");
  }

  if (payload.summary !== undefined && payload.summary !== null && !isNonEmptyString(payload.summary)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "摘要不能是空字符串。");
  }

  if (payload.wikiCategory !== undefined && !isWikiCategory(payload.wikiCategory)) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "知识页分类无法识别。");
  }

  if (payload.sourceLinks !== undefined) {
    if (!Array.isArray(payload.sourceLinks) || payload.sourceLinks.some((item) => !isRecord(item)
      || !isNonEmptyString(item.rawId) || !isRawCategory(item.rawCategory))) {
      throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "补充来源必须带有 Raw id 与有效的来源分类。");
    }
  }
}

/**
 * 创建一条待确认的提议。
 *
 * 只写 proposals 与 audit_log —— **不碰任何正式数据**。真正写入发生在 applyProposal。
 */
export async function createProposal(input: CreateProposalInput): Promise<Proposal> {
  if (!SUPPORTED_KINDS.includes(input.kind)) {
    throw new ProposalError(
      "PROPOSAL_KIND_UNSUPPORTED",
      `暂时无法执行「${input.kind}」这一类提议。`,
    );
  }

  if (input.kind === "link_create") assertLinkCreatePayload(input.payload);
  if (input.kind === "source_create") assertSourceCreatePayload(input.payload);
  if (input.kind === "note_update") assertNoteUpdatePayload(input.payload);
  if (input.kind === "schema_preferences" && (!validPreferences(input.payload.content)
    || typeof input.payload.schemaHash !== "string" || !/^[a-f0-9]{64}$/.test(input.payload.schemaHash)
    || !isNonEmptyString(input.payload.evidence) || !isNonEmptyString(input.reason))) {
    throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "偏好提议需包含偏好内容、Schema 版本、用户原话和理由。");
  }

  const { db } = await getDb();
  const { userId, actor } = getUserContext();
  const origin: ContentOrigin = input.origin ?? "user";
  const agentId = input.agentId ?? (origin === "ai" ? DEFAULT_AGENT_ID : null);
  const riskLevel: RiskLevel = input.riskLevel ?? "medium";

  // 审计要如实记下"是谁发起的"：origin = 'ai' 的提议由 agent 发起。
  // origin 只来自服务端代码（见 CreateProposalInput 的注释），不是请求体字段。
  const auditActor =
    origin === "ai" && agentId
      ? { type: "agent" as const, id: agentId }
      : { type: actor.type, id: actor.id };

  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(proposals)
      .values({
        id: `proposal_${randomUUID()}`,
        userId,
        kind: input.kind,
        status: "pending",
        targetNoteId: input.targetNoteId ?? null,
        payload: input.payload,
        reason: input.reason ?? null,
        impact: input.impact ?? null,
        riskLevel,
        baseVersion: input.baseVersion ?? null,
        origin,
        agentId,
      })
      .returning();

    const proposal = rows[0];

    await tx.insert(auditLog).values({
      id: `audit_${randomUUID()}`,
      userId,
      actorType: auditActor.type,
      actorId: auditActor.id,
      operation: "proposal.create",
      targetType: "proposal",
      targetId: proposal.id,
      proposalId: proposal.id,
      result: "ok",
      detail: { kind: input.kind, riskLevel, origin, reason: input.reason ?? null },
    });

    return proposal;
  });

  return toProposal(inserted);
}

// ---------------------------------------------------------------------------
// 决议（批准 / 拒绝 / 取消）
// ---------------------------------------------------------------------------

async function resolveProposal(
  id: string,
  next: Extract<ProposalStatus, "approved" | "rejected" | "cancelled">,
  actorOverride?: Actor,
): Promise<Proposal> {
  const { db } = await getDb();
  const { userId, actor } = getUserContext(actorOverride);

  const rows = await db.transaction(async (tx) => {
    const current = (
      await tx
        .select()
        .from(proposals)
        .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
        .limit(1)
        .for("update")
    )[0];

    if (!current) {
      throw new ProposalError("PROPOSAL_NOT_FOUND", "这条提议已不存在。");
    }

    assertTransition(current.status, next);

    const now = new Date();
    const updated = (
      await tx
        .update(proposals)
        .set({ status: next, resolvedAt: now })
        .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
        .returning()
    )[0];

    await tx.insert(auditLog).values({
      id: `audit_${randomUUID()}`,
      userId,
      actorType: actor.type,
      actorId: actor.id,
      operation: `proposal.${next === "approved" ? "approve" : next === "rejected" ? "reject" : "cancel"}`,
      targetType: "proposal",
      targetId: id,
      proposalId: id,
      result: "ok",
      detail: { from: current.status, to: next },
    });

    return updated;
  });

  return toProposal(rows);
}

/** 批准。批准本身不写入任何正式数据，只把提议推进到可执行的 approved。 */
export async function approveProposal(id: string, actor?: Actor): Promise<Proposal> {
  return resolveProposal(id, "approved", actor);
}

export async function rejectProposal(id: string): Promise<Proposal> {
  return resolveProposal(id, "rejected");
}

export async function cancelProposal(id: string): Promise<Proposal> {
  return resolveProposal(id, "cancelled");
}

// ---------------------------------------------------------------------------
// 执行
// ---------------------------------------------------------------------------

export type ApplyProposalInput = {
  /** Host-only attribution for an explicit full-permission run. Never read from a request body. */
  actor?: Actor;
  /**
   * 幂等键。与状态检查构成双保险（docs/reports/07 §7.2）：
   * 同一把钥匙重复提交直接返回上次的结果，不会执行第二次。
   */
  idempotencyKey?: string | null;
};

export type ApplyProposalResult = {
  proposal: Proposal;
  /** false 表示这次没有真的执行——提议先前已经 applied，直接返回了既有结果。 */
  applied: boolean;
  effect: Record<string, unknown> | null;
};

/**
 * 执行提议的实际效果（`link_create` / `source_create` / `note_update`）。
 * **必须在事务里调用**，返回写进 `proposals.result` 的内容。
 */
async function applyKindEffect(
  tx: DbTransaction,
  proposalId: string,
  row: ProposalRow,
  actor?: Actor,
): Promise<Record<string, unknown>> {
  const { userId } = getUserContext();
  const payload = asRecord(row.payload);
  if (row.kind === "schema_preferences") {
    const saved = await applyPreferences(String(payload.content), String(payload.schemaHash), proposalId);
    if (!saved) throw new ProposalError("PROPOSAL_TARGET_STALE", "Schema 已修改，请重新生成偏好提议。");
    return { schemaHash: saved.hash, target: "Schema.md#用户偏好" };
  }

  if (row.kind === "link_create") {
    const sourceId = payload.sourceId;
    const targetId = payload.targetId;
    const reason = payload.reason;

    // payload 在创建时校验过，但库里可能躺着更早的行，这里再挡一次
    if (!isNonEmptyString(sourceId) || !isNonEmptyString(targetId) || !isNonEmptyString(reason)) {
      throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "这条提议缺少建立关联所需的信息。");
    }

    const found = await tx
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.userId, userId), inArray(notes.id, [sourceId, targetId])));

    if (found.length !== 2) {
      throw new ProposalError(
        "PROPOSAL_TARGET_MISSING",
        "提议里的知识页已不存在，请重新整理后再确认。",
      );
    }

    const { relation, created } = await createOrReviveLinkInTx(
      tx,
      {
        sourceId, targetId, reason,
        type: LINK_TYPES.includes(payload.type as LinkType) ? payload.type as LinkType : "related",
        evidence: isNonEmptyString(payload.evidence) ? payload.evidence : null,
      },
      { proposalId, origin: "ai" },
    );

    return { linkId: relation.id, created, sourceId, targetId, type: relation.type };
  }

  if (row.kind === "source_create") {
    const text = payload.text;
    const title = payload.title;

    if (!isNonEmptyString(text)) {
      throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "这条提议没有可保存的正文。");
    }

    const raw = await createSourceInTx(tx, text, typeof title === "string" ? title : null);

    return { rawId: raw.id, title: raw.title };
  }

  if (row.kind === "note_update") {
    const noteId = payload.noteId;
    const content = payload.content;
    const summary = payload.summary;

    // payload 在创建时校验过，但库里可能躺着更早的行，这里再挡一次
    if (!isNonEmptyString(noteId) || !isNonEmptyString(content)) {
      throw new ProposalError("PROPOSAL_PAYLOAD_INVALID", "这条提议缺少要写入的正文。");
    }

    const wikiCategory = isWikiCategory(payload.wikiCategory) ? payload.wikiCategory : undefined;
    const sourceLinks: SourceAttachment[] = Array.isArray(payload.sourceLinks)
      ? payload.sourceLinks.filter(isRecord).map((item) => ({ rawId: String(item.rawId), rawCategory: item.rawCategory as SourceAttachment["rawCategory"] }))
      : [];
    const result = await updateNoteInTx(
      tx,
      noteId,
      {
        content,
        ...(isNonEmptyString(summary) ? { summary } : {}),
        ...(wikiCategory ? { path: `wilki/${wikiCategory}/${noteId}.md` } : {}),
      },
      row.baseVersion ?? undefined,
      actor,
    );

    if (result.status === "not_found") {
      throw new ProposalError(
        "PROPOSAL_TARGET_MISSING",
        "提议要改写的知识页已不存在，请重新整理后再确认。",
      );
    }

    // 提议生成之后用户自己改过这一页：写进去就会覆盖掉用户的手改，所以判过期。
    if (result.status === "conflict") {
      throw new ProposalError(
        "PROPOSAL_TARGET_STALE",
        `这张知识页在提议生成之后已经被改过（现在是第 ${result.knowledge.version} 版），这条提议已经过期。请让编辑助理重新生成一份。`,
      );
    }

    if (sourceLinks.length) await attachSourcesToNoteInTx(tx, noteId, sourceLinks, actor);

    return {
      noteId,
      version: result.knowledge.version,
      contentLength: result.knowledge.content.length,
      ...(wikiCategory ? { wikiCategory } : {}),
      ...(sourceLinks.length ? { sourceRawIds: sourceLinks.map(item => item.rawId) } : {}),
    };
  }

  throw new ProposalError(
    "PROPOSAL_KIND_UNSUPPORTED",
    `暂时无法执行「${row.kind}」这一类提议。`,
  );
}

/**
 * 执行一条已批准的提议。
 *
 * 前置条件：`status = 'approved'`（否则抛 PROPOSAL_INVALID_TRANSITION）。
 * 执行内容与提议状态更新、审计写入在同一个事务里完成（docs/reports/07 §8 T4）。
 * 失败时事务回滚，另开一次写入把提议置为 `failed`，确保失败留下痕迹而不是悄悄卡在 approved。
 */
export async function applyProposal(
  id: string,
  input: ApplyProposalInput = {},
): Promise<ApplyProposalResult> {
  const { db } = await getDb();
  const { userId, actor } = getUserContext(input.actor);
  const idempotencyKey = input.idempotencyKey ?? null;

  const existing = await getProposal(id);

  if (!existing) {
    throw new ProposalError("PROPOSAL_NOT_FOUND", "这条提议已不存在。");
  }

  // 双保险之一：已经执行过就不再执行。另一道是幂等键。
  if (existing.status === "applied") {
    return { proposal: existing, applied: false, effect: existing.result };
  }

  assertTransition(existing.status, "applied");

  let outcome: { idempotent: true; stored: Record<string, unknown> | null } | { idempotent: false; updated: ProposalRow };

  try {
    outcome = await db.transaction(async (tx) => {
      if (idempotencyKey) {
        const claimed = await tx
          .insert(idempotencyKeys)
          .values({
            key: idempotencyKey,
            userId,
            operation: "proposal.apply",
            requestHash: id,
          })
          .onConflictDoNothing()
          .returning();

        if (claimed.length === 0) {
          const prior = (
            await tx
              .select()
              .from(idempotencyKeys)
              .where(
                and(
                  eq(idempotencyKeys.userId, userId),
                  eq(idempotencyKeys.key, idempotencyKey),
                ),
              )
              .limit(1)
          )[0];

          return { idempotent: true as const, stored: asRecordOrNull(prior?.responseJson) };
        }
      }

      // 锁住这一行：并发重复执行会被挡住，不会写两次正式数据
      const locked = (
        await tx
          .select()
          .from(proposals)
          .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
          .limit(1)
          .for("update")
      )[0];

      if (!locked) {
        throw new ProposalError("PROPOSAL_NOT_FOUND", "这条提议已不存在。");
      }

      if (locked.status !== "approved") {
        throw new ProposalError(
          "PROPOSAL_INVALID_TRANSITION",
          `提议当前状态是「${locked.status}」，需要先批准才能执行。`,
        );
      }

      const effect = await applyKindEffect(tx, id, locked, actor);
      const now = new Date();

      const updated = (
        await tx
          .update(proposals)
          .set({
            status: "applied",
            appliedAt: now,
            resolvedAt: locked.resolvedAt ?? now,
            result: effect,
          })
          .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
          .returning()
      )[0];

      await tx.insert(auditLog).values({
        id: `audit_${randomUUID()}`,
        userId,
        actorType: actor.type,
        actorId: actor.id,
        operation: "proposal.apply",
        targetType: "proposal",
        targetId: id,
        proposalId: id,
        idempotencyKey,
        result: "ok",
        detail: { kind: locked.kind, effect },
      });

      if (idempotencyKey) {
        await tx
          .update(idempotencyKeys)
          .set({ responseJson: { proposalId: id, kind: locked.kind, effect } })
          .where(
            and(eq(idempotencyKeys.userId, userId), eq(idempotencyKeys.key, idempotencyKey)),
          );
      }

      return { idempotent: false as const, updated };
    });
  } catch (error) {
    // 数据库事务已回滚。Schema 文件可能已写入：非业务错误保留 approved，
    // 允许依靠文件内的提议回执重试并补齐数据库状态。
    if (error instanceof ProposalError && error.code !== "PROPOSAL_NOT_FOUND") {
      // 目标被改过属于「过期」而不是「失败」：状态机里 approved → stale 是独立的一条边，
      // 过期提议不能重新执行，只能重新生成。
      await markFailed(
        id,
        error.message,
        error.code === "PROPOSAL_TARGET_STALE" ? "stale" : "failed",
        actor,
      );
    }
    throw error;
  }

  if (outcome.idempotent) {
    const current = await getProposal(id);
    if (!current) {
      throw new ProposalError("PROPOSAL_NOT_FOUND", "这条提议已不存在。");
    }
    return { proposal: current, applied: false, effect: current.result };
  }

  return {
    proposal: toProposal(outcome.updated),
    applied: true,
    effect: asRecordOrNull(outcome.updated.result),
  };
}

/**
 * 把提议置为 `failed`（或目标过期时的 `stale`），并记一条审计。
 * 独立于失败的那个事务 —— 那个已经回滚了。
 */
async function markFailed(
  id: string,
  message: string,
  status: Extract<ProposalStatus, "failed" | "stale"> = "failed",
  actorOverride?: Actor,
): Promise<void> {
  const { db } = await getDb();
  const { userId, actor } = getUserContext(actorOverride);

  try {
    await db.transaction(async (tx) => {
      const updated = await tx
        .update(proposals)
        .set({ status, resolvedAt: new Date(), result: { error: message } })
        .where(
          and(
            eq(proposals.id, id),
            eq(proposals.userId, userId),
            eq(proposals.status, "approved"),
          ),
        )
        .returning();

      if (updated.length === 0) return;

      await tx.insert(auditLog).values({
        id: `audit_${randomUUID()}`,
        userId,
        actorType: actor.type,
        actorId: actor.id,
        operation: "proposal.apply",
        targetType: "proposal",
        targetId: id,
        proposalId: id,
        result: "failed",
        detail: { error: message, status },
      });
    });
  } catch {
    // 连"标记失败"都写不进去时不再向上抛：原始错误更值得让调用方看到
  }
}
