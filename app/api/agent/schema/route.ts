import { NextResponse } from "next/server";
import { AGENT_INSTRUCTION, AGENT_MANUAL, MANUAL_VERSION } from "../../../../lib/agent/manual";
import { createHash } from "node:crypto";
export const runtime = "nodejs";
export async function GET() {
  return NextResponse.json({ title: "LLM Wiki 工作流", schema: AGENT_INSTRUCTION, tools: AGENT_MANUAL,
    version: MANUAL_VERSION, hash: createHash("sha256").update(AGENT_INSTRUCTION).digest("hex") });
}
