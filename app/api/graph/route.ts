import { NextResponse } from "next/server";

import {readGraph} from "../../../lib/services/graph";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await readGraph());
  } catch {
    return NextResponse.json(
      { error: { code: "GRAPH_READ_FAILED", message: "知识网络暂时没有载入。已收录的内容仍然安全，请稍后重试。" } },
      { status: 500 },
    );
  }
}
