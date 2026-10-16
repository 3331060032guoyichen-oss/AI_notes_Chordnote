import { NextResponse } from "next/server";

import { getProposal } from "../../../../lib/services/proposals";
import { jsonError } from "../errors";

export const runtime = "nodejs";

/** 单条提议详情（含 `payload` / `result` / `diff` 这类 jsonb 字段）。 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const proposal = await getProposal(id);

    if (!proposal) {
      return jsonError("这条提议已不存在。", 404, "PROPOSAL_NOT_FOUND");
    }

    return NextResponse.json({ proposal });
  } catch {
    return jsonError(
      "这条提议暂时没有载入。已保存的内容没有改变，请稍后重试。",
      500,
      "PROPOSAL_STORAGE_READ_FAILED",
    );
  }
}
