import { NextResponse } from "next/server";
import { AGENT_MANUAL, MANUAL_VERSION } from "../../../../lib/agent/manual";
import { readAgentSchema, saveAgentSchema } from "../../../../lib/services/agent-schema";
import { isLocalJsonRequest } from "../../../../lib/api/local-request";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({ title: "LLM Wiki Schema", ...await readAgentSchema(), tools: AGENT_MANUAL,
    version: MANUAL_VERSION });
}
export async function PATCH(request: Request) {
  if (!isLocalJsonRequest(request)) return NextResponse.json({ error: "仅接受本机 JSON 请求" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "无效 JSON" }, { status: 400 }); }
  if (!body || typeof body.schema !== "string" || !body.schema.trim() || body.schema.length > 100_000 || typeof body.hash !== "string") {
    return NextResponse.json({ error: "请提供非空 Markdown（最多 100000 字符）与版本 hash" }, { status: 400 });
  }
  const result = await saveAgentSchema(body.schema, body.hash);
  if (!result) return NextResponse.json({ error: "Schema 已在其他窗口修改，请复制当前修改后重新打开。" }, { status: 409 });
  return NextResponse.json(result);
}
