import { NextResponse } from "next/server";

import { createUntitledSource } from "../../../../lib/services/sources";

export const runtime = "nodejs";

/**
 * The New Note action creates a real Raw document immediately. This deliberately
 * has its own route so an empty editor is never only client-side state.
 */
export async function POST() {
  try {
    return NextResponse.json({ raw: await createUntitledSource() }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: "RAW_STORAGE_WRITE_FAILED", message: "新笔记暂时无法建立，请稍后重试。" } },
      { status: 500 },
    );
  }
}
