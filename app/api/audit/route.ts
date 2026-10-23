import { NextResponse } from "next/server";

import { listAuditEvents } from "../../../lib/services/audit";

export const runtime = "nodejs";

/** 只读操作日志，供 Wiki Log 展示；不提供任何写入入口。 */
export async function GET(request: Request) {
  const limit = Number(new URL(request.url).searchParams.get("limit") ?? 50);

  try {
    return NextResponse.json({ events: await listAuditEvents(limit) });
  } catch {
    return NextResponse.json(
      { error: { code: "AUDIT_READ_FAILED", message: "操作日志暂时没有载入。已有记录没有改变，请稍后重试。" } },
      { status: 500 },
    );
  }
}
