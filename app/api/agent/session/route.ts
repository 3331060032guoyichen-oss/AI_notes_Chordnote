import { NextResponse } from "next/server";
import { endSession, SessionError } from "../../../../lib/agent/sessions";
import { getUserContext } from "../../../../lib/auth/context";
import { logAgentEvent } from "../../../../lib/services/agent-context";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.sessionId !== "string" || !/^[a-f0-9-]{36}$/.test(body.sessionId)) return NextResponse.json({ error: { message: "会话编号无效" } }, { status: 400 });
  try {
    await endSession(getUserContext().userId, body.sessionId, turns => logAgentEvent("session.end", body.sessionId, { turns }));
    return NextResponse.json({ ended: true });
  } catch (error) {
    if (error instanceof SessionError) return NextResponse.json({ error: { message: error.message } }, { status: error.code === "SESSION_BUSY" ? 409 : 404 });
    return NextResponse.json({ error: { message: "会话日志暂时无法保存" } }, { status: 500 });
  }
}
