import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { auditLog, proposals } from "../db/schema";
import { getUserContext } from "../auth/context";
import { listArchivedNotes, listNotes } from "./notes";
import { listSources } from "./sources";
import { listProposals } from "./proposals";
import { clipContext, retrieveContext } from "../agent/context";

export async function agentContext(question: string) {
  const notes = await listNotes();
  const archivedNotes = await listArchivedNotes();
  const organizedRawIds = new Set([...notes, ...archivedNotes].map(note => note.rawId));
  const raws = await listSources();
  const documents = [
    ...notes.filter(n => !n.archivedAt).map(n => ({ id: n.id, path: n.path ?? `wilki/${n.id}.md`, title: n.title, content: n.markdown ?? n.content, kind: "knowledge" as const })),
    ...raws.map(r => ({ id: r.id, path: r.path ?? `raw/${r.id}.md`, title: r.title ?? "", content: r.markdown ?? r.text, kind: "raw" as const, organized: organizedRawIds.has(r.id) })),
  ];
  const context = retrieveContext(question, documents);
  const { db } = await getDb();
  const { userId } = getUserContext();
  const logs = await db.select({ createdAt: auditLog.createdAt, operation: auditLog.operation, targetId: auditLog.targetId, result: auditLog.result,
    detail: auditLog.detail, kind: proposals.kind, noteId: proposals.targetNoteId }).from(auditLog)
    .leftJoin(proposals, and(eq(proposals.id, auditLog.proposalId), eq(proposals.userId, userId))).where(and(eq(auditLog.userId, userId),
    inArray(auditLog.operation, ["proposal.create", "proposal.approve", "proposal.reject", "proposal.apply", "proposal.stale", "session.end"])))
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id)).limit(5);
  const labels: Record<string, string> = { "proposal.create": "提交提议", "proposal.approve": "批准提议（尚未应用）", "proposal.reject": "拒绝提议", "proposal.apply": "应用提议", "proposal.stale": "提议过期", "session.end": "结束会话" };
  const pending = await listProposals({ status: "all", limit: 10 });
  return { ...context, logs: clipContext(logs.map(row => {
    const title = row.kind === "schema_preferences" ? "Schema · 用户偏好" : documents.find(doc => doc.id === row.noteId)?.path ?? row.targetId;
    const detail = row.detail as { turns?: number } | null;
    const subject = row.operation === "session.end" ? `${detail?.turns ?? 0} 轮对话` : title;
    return `${row.createdAt.toISOString().replace("T", " ").slice(0, 16)} UTC | ${labels[row.operation]}：${subject}（${row.result}；${row.targetId}）`;
  }).join("\n"), 2_000),
    proposalStates: pending.proposals.map(p => ({ id: p.id, status: p.status })) };
}

export async function logAgentEvent(operation: "session.end" | "agent.query", sessionId: string, detail: Record<string, unknown>) {
  const { db } = await getDb();
  const { userId } = getUserContext();
  await db.insert(auditLog).values({ id: `audit_${randomUUID()}`, userId, actorType: "system", actorId: "agent-context",
    operation, targetType: "session", targetId: sessionId, result: "ok", detail });
}
