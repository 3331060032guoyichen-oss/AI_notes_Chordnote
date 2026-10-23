import { and, desc, eq, inArray, ne } from "drizzle-orm";

import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { auditLog, notes, proposals, rawNotes } from "../db/schema";
import type { AuditEvent } from "../../types/audit";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/** 只保留界面需要的可读字段：不带内部 id、原文快照或 UUID 路径。 */
function sanitizeDetail(detail: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!detail) return null;
  const safe: Record<string, unknown> = {};
  for (const key of ["permission", "error", "reason", "title"] as const) {
    if (typeof detail[key] === "string" && detail[key]) safe[key] = detail[key];
  }
  if (detail.health && typeof detail.health === "object" && !Array.isArray(detail.health)) safe.health = detail.health;
  if (typeof detail.afterPath === "string") {
    const category = detail.afterPath.replace(/\\/g, "/").split("/")[1];
    if (category) safe.category = category;
  }
  if (Array.isArray(detail.steps)) {
    safe.steps = detail.steps
      .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step))
      .map(step => ({
        tool: typeof step.tool === "string" ? step.tool : null,
        status: typeof step.status === "string" ? step.status : null,
        detail: typeof step.detail === "string" ? step.detail : null,
      }));
  }
  if (Array.isArray(detail.sourceIds)) safe.sourceCount = detail.sourceIds.length;
  if (Array.isArray(detail.readIds)) safe.readCount = detail.readIds.length;
  if (Array.isArray(detail.citedIds)) safe.citedCount = detail.citedIds.length;
  return safe;
}

/**
 * 最近的操作记录，按用户隔离。
 *
 * 只读：日志只从 audit_log 投影，不写回任何表。目标标题在这里解析，
 * 前端拿到的记录不含内部 id，避免界面出现 UUID。
 */
export async function listAuditEvents(limit = DEFAULT_LIMIT): Promise<AuditEvent[]> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_LIMIT) : DEFAULT_LIMIT;
  const { db } = await getDb();
  const { userId } = getUserContext();

  const rows = await db.select({
    id: auditLog.id,
    operation: auditLog.operation,
    targetType: auditLog.targetType,
    targetId: auditLog.targetId,
    proposalId: auditLog.proposalId,
    result: auditLog.result,
    detail: auditLog.detail,
    createdAt: auditLog.createdAt,
  }).from(auditLog)
    .where(and(eq(auditLog.userId, userId), ne(auditLog.operation, "agent.run.failed")))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(safeLimit);

  const noteIds = new Set<string>();
  const rawIds = new Set<string>();
  const proposalIds = new Set<string>();
  for (const row of rows) {
    if (row.targetType === "note" && row.targetId) noteIds.add(row.targetId);
    if (row.targetType === "raw" && row.targetId) rawIds.add(row.targetId);
    if (row.proposalId) proposalIds.add(row.proposalId);
    const detail = row.detail as Record<string, unknown> | null;
    if (row.targetType === "link" && detail) {
      if (typeof detail.sourceId === "string") noteIds.add(detail.sourceId);
      if (typeof detail.targetId === "string") noteIds.add(detail.targetId);
    }
  }

  const proposalRows = proposalIds.size
    ? await db.select({ id: proposals.id, targetNoteId: proposals.targetNoteId }).from(proposals)
      .where(and(eq(proposals.userId, userId), inArray(proposals.id, [...proposalIds])))
    : [];
  for (const proposal of proposalRows) if (proposal.targetNoteId) noteIds.add(proposal.targetNoteId);

  const noteRows = noteIds.size
    ? await db.select({ id: notes.id, title: notes.title }).from(notes)
      .where(and(eq(notes.userId, userId), inArray(notes.id, [...noteIds])))
    : [];
  const rawRows = rawIds.size
    ? await db.select({ id: rawNotes.id, title: rawNotes.title }).from(rawNotes)
      .where(and(eq(rawNotes.userId, userId), inArray(rawNotes.id, [...rawIds])))
    : [];

  const noteTitles = new Map(noteRows.map(row => [row.id, row.title]));
  const rawTitles = new Map(rawRows.map(row => [row.id, row.title ?? "未命名笔记"]));
  const proposalTargets = new Map(proposalRows.map(row => [row.id, row.targetNoteId]));

  return rows.map((row) => {
    const detail = row.detail as Record<string, unknown> | null;
    let targetTitle: string | null = null;
    if (row.targetType === "note" && row.targetId) targetTitle = noteTitles.get(row.targetId) ?? null;
    else if (row.targetType === "raw" && row.targetId) targetTitle = rawTitles.get(row.targetId) ?? null;
    else if (row.targetType === "link" && detail) {
      const source = typeof detail.sourceId === "string" ? noteTitles.get(detail.sourceId) : undefined;
      const target = typeof detail.targetId === "string" ? noteTitles.get(detail.targetId) : undefined;
      targetTitle = source && target ? `${source} ↔ ${target}` : null;
    } else if (row.targetType === "proposal" && row.proposalId) {
      const targetId = proposalTargets.get(row.proposalId);
      targetTitle = targetId ? noteTitles.get(targetId) ?? null : null;
    } else if (row.targetType === "session") {
      targetTitle = "整理会话";
    }
    if (!targetTitle && detail && typeof detail.title === "string") targetTitle = detail.title;

    return {
      id: row.id,
      operation: row.operation,
      targetType: row.targetType,
      targetTitle,
      result: row.result,
      detail: sanitizeDetail(detail),
      createdAt: row.createdAt.toISOString(),
    };
  });
}
