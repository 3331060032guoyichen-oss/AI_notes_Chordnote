import { NextResponse } from "next/server";

import { applyProposal } from "../../../../../lib/services/proposals";
import { proposalErrorResponse, readJsonBody } from "../../errors";

export const runtime = "nodejs";

/**
 * 执行一条**已批准**的提议——这是整条提议链路上唯一真正写正式数据的地方。
 *
 * 幂等键优先从 `Idempotency-Key` 请求头取，其次从请求体的 `idempotencyKey` 字段取。
 * 两者都没有时不会拒绝执行：`proposals.status` 的状态检查（已 `applied` 不再执行）
 * 已经挡住了重复提交，幂等键只是并发重复请求的第二道保险（docs/reports/07 §7.2）。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  const headerKey = request.headers.get("Idempotency-Key");
  let idempotencyKey = headerKey && headerKey.trim() ? headerKey.trim() : null;

  if (!idempotencyKey) {
    const body = await readJsonBody(request);
    const bodyKey = body?.idempotencyKey;

    if (typeof bodyKey === "string" && bodyKey.trim()) idempotencyKey = bodyKey.trim();
  }

  try {
    const result = await applyProposal(id, { idempotencyKey });
    return NextResponse.json(result);
  } catch (error) {
    return proposalErrorResponse(error, {
      code: "PROPOSAL_APPLY_FAILED",
      message: "这条提议暂时无法执行。已保存的内容没有改变，请稍后重试。",
    });
  }
}
