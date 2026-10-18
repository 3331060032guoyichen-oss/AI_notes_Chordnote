import { NextResponse } from "next/server";

import { getDb } from "../../../lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 仅供本机桌面宿主轮询；首次调用也会验证 PGlite 初始化与迁移。 */
export async function GET() {
  try {
    const { client } = await getDb();
    await client.query("select 1 as ok");

    return NextResponse.json({ status: "ok", database: "ok" });
  } catch {
    return NextResponse.json({ status: "unavailable", database: "unavailable" }, { status: 503 });
  }
}
