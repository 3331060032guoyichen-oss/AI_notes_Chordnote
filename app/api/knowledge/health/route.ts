import { NextResponse } from "next/server";

import { wikiHealth } from "../../../../lib/services/wiki-health";

export const runtime = "nodejs";

/** 只读体检报告。不改内容、不落库，可随时重复调用。 */
export async function GET() {
  try {
    return NextResponse.json(await wikiHealth());
  } catch {
    return NextResponse.json(
      { error: { code: "WIKI_HEALTH_FAILED", message: "体检报告暂时没有生成。你的内容没有受到影响，请稍后重试。" } },
      { status: 500 },
    );
  }
}
