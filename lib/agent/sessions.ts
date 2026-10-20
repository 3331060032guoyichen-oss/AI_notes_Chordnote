import { randomUUID } from "node:crypto";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { estimateTokens, HISTORY_BUDGET } from "./context";

export type SessionTurn = { events: SessionEvent[]; user: string; reply: string };
type Conversation = { owner: string; turns: SessionTurn[]; busy: boolean; touched: number; total: number };
// Route bundles must share one store, including after development module reloads.
const host = process as typeof process & { chordnoteSessions?: Map<string, Conversation> };
const sessions = host.chordnoteSessions ??= new Map<string, Conversation>();
const TTL = 6 * 60 * 60 * 1000;
export class SessionError extends Error {
  constructor(public code: "SESSION_EXPIRED" | "SESSION_BUSY", message: string) { super(message); }
}
export function historyWindow() {
  const value = Number(process.env.CHORDNOTE_HISTORY_TURNS ?? 10);
  return Number.isInteger(value) && value >= 1 && value <= 50 ? value : 10;
}
export function trimTurns(turns: SessionTurn[], count = historyWindow()) {
  const kept = turns.slice(-count);
  while (kept.length && estimateTokens(JSON.stringify(kept)) > HISTORY_BUDGET) kept.shift();
  return kept;
}
export function beginSession(owner: string, requested?: string) {
  for (const [id, session] of sessions) if (!session.busy && Date.now() - session.touched > TTL) sessions.delete(id);
  const id = requested ?? randomUUID();
  let session = sessions.get(id);
  if (requested && (!session || session.owner !== owner)) throw new SessionError("SESSION_EXPIRED", "会话已结束或服务已重启，请开始新会话。");
  if (!session) {
    if (sessions.size >= 100) {
      const oldest = [...sessions].filter(([, s]) => !s.busy).sort((a, b) => a[1].touched - b[1].touched)[0];
      if (oldest) sessions.delete(oldest[0]);
      else throw new SessionError("SESSION_BUSY", "会话繁忙，请稍后重试。");
    }
    session = { owner, turns: [], busy: false, touched: Date.now(), total: 0 };
    sessions.set(id, session);
  }
  if (session.busy) throw new SessionError("SESSION_BUSY", "上一轮仍在处理，请稍后发送。");
  session.busy = true;
  session.touched = Date.now();
  return { id, history: trimTurns(session.turns).flatMap(turn => turn.events),
    finish(turn?: SessionTurn) {
      if (turn) { session!.turns = trimTurns([...session!.turns, turn]); session!.total++; }
      session!.busy = false; session!.touched = Date.now();
      if (!turn && !requested) sessions.delete(id);
    } };
}
export function closeSession(owner: string, id: string) {
  const session = sessions.get(id);
  if (!session || session.owner !== owner) throw new SessionError("SESSION_EXPIRED", "会话不存在或已结束。");
  if (session.busy) throw new SessionError("SESSION_BUSY", "请等待本轮回复后结束会话。");
  sessions.delete(id);
  return session.total;
}

export async function endSession(owner: string, id: string, record: (turns: number) => Promise<void>) {
  const session = sessions.get(id);
  if (!session || session.owner !== owner) throw new SessionError("SESSION_EXPIRED", "会话不存在或已结束。");
  if (session.busy) throw new SessionError("SESSION_BUSY", "请等待本轮回复后结束会话。");
  session.busy = true;
  try { await record(session.total); sessions.delete(id); }
  finally { session.busy = false; }
}
