import { NextResponse } from "next/server";

import { rejectProposal } from "../../../../../lib/services/proposals";
import { proposalErrorResponse } from "../../errors";

export const runtime = "nodejs";

/** 拒绝一条提议。`rejected` 是终态，不会被重新打开——要改主意只能重新生成一条新提议。 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    return NextResponse.json({ proposal: await rejectProposal(id) });
  } catch (error) {
    return proposalErrorResponse(error, {
      code: "PROPOSAL_REJECT_FAILED",
      message: "这条提议暂时无法拒绝。已保存的内容没有改变，请稍后重试。",
    });
  }
}
