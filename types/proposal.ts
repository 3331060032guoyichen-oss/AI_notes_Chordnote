import type {
  ContentOrigin,
  ProposalKind,
  ProposalStatus,
  RiskLevel,
} from "../lib/db/enums";

/**
 * 提议（`proposals`）的对外形态。
 *
 * 时间一律是 ISO 字符串 —— 与 `Knowledge` / `Raw` / `KnowledgeRelation` 保持一致，
 * 路由直接把服务层返回值交给 `NextResponse.json`，不在这里做二次转换。
 *
 * `payload` / `impact` / `result` 是 jsonb，形状随 `kind` 变化，见 `lib/services/proposals.ts`。
 */
export type Proposal = {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  riskLevel: RiskLevel;
  origin: ContentOrigin;
  reason: string | null;
  payload: Record<string, unknown>;
  impact: Record<string, unknown> | null;
  targetNoteId: string | null;
  baseVersion: number | null;
  agentId: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  appliedAt: string | null;
};

/** `link_create` 提议的 payload（AI 提议在两页之间建立正式关系）。 */
export type LinkCreatePayload = {
  sourceId: string;
  targetId: string;
  reason: string;
};

/** `source_create` 提议的 payload（AI 提议把一段材料存为原始记录）。 */
export type SourceCreatePayload = {
  text: string;
  title?: string | null;
};

/**
 * `note_update` 提议的 payload（编辑助理提议改写某张知识页的正文）。
 *
 * `content` 是**改写后的完整正文**，不是增量片段：Diff 预览卡要拿它和当前正文逐行对比，
 * 确认后也是整段写入。`summary` 缺省表示只动正文。
 */
export type NoteUpdatePayload = {
  noteId: string;
  content: string;
  summary?: string | null;
  reason: string;
};
