import { NextResponse } from "next/server";

import { approveProposal } from "../../../../../lib/services/proposals";
import { proposalErrorResponse } from "../../errors";

export const runtime = "nodejs";

/**
 * 批准一条提议。
 *
 * 批准本身**不写入任何正式数据**，只是把提议从 `pending` 推进到可执行的 `approved`。
 * 真正落库发生在 `POST /api/proposals/:id/apply`。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    return NextResponse.json({ proposal: await approveProposal(id) });
  } catch (error) {
    return proposalErrorResponse(error, {
      code: "PROPOSAL_APPROVE_FAILED",
      message: "这条提议暂时无法批准。已保存的内容没有改变，请稍后重试。",
    });
  }
}
