import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { closeDb } from "../../../../lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidToken(candidate: string | null): boolean {
  const expected = process.env.CHORDNOTE_SHUTDOWN_TOKEN;
  if (!candidate || !expected) return false;

  const receivedBytes = Buffer.from(candidate);
  const expectedBytes = Buffer.from(expected);

  return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

/**
 * 仅由 Tauri 宿主在退出时调用。令牌只在子进程环境中存在，浏览器从不接触它。
 */
export async function POST(request: Request) {
  if (!hasValidToken(request.headers.get("x-chordnote-shutdown-token"))) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await closeDb();

  // 先返回 HTTP 响应，再让 standalone Node 正常结束。
  setTimeout(() => process.exit(0), 25).unref();

  return NextResponse.json({ status: "shutting_down" });
}
