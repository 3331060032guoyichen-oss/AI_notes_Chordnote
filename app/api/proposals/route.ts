import { NextResponse } from "next/server";

import {
  PROPOSAL_KINDS,
  PROPOSAL_STATUSES,
  RISK_LEVELS,
  type ProposalKind,
  type ProposalStatus,
  type RiskLevel,
} from "../../../lib/db/enums";
import { createProposal, listProposals } from "../../../lib/services/proposals";
import { jsonError, proposalErrorResponse, readJsonBody } from "./errors";

export const runtime = "nodejs";

/**
 * 提议列表。
 *
 * 查询参数：`status`（默认 `pending`，可传 `all`）、`targetNoteId`（只看某张知识页的提议）、
 * `limit`、`cursor`。
 * 游标是上一页返回的 `nextCursor`，原样传回即可。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status");
  const targetNoteId = url.searchParams.get("targetNoteId");
  const limitParam = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");

  const rawStatus = statusParam ?? "pending";

  if (rawStatus !== "all" && !PROPOSAL_STATUSES.includes(rawStatus as ProposalStatus)) {
    return jsonError("无法识别这个提议状态。", 400, "INVALID_PROPOSAL_STATUS");
  }

  const status: ProposalStatus | "all" =
    rawStatus === "all" ? "all" : (rawStatus as ProposalStatus);

  let limit: number | undefined;

  if (limitParam !== null) {
    limit = Number(limitParam);

    if (!Number.isFinite(limit) || limit <= 0) {
      return jsonError("每页数量需要是正整数。", 400, "INVALID_LIMIT");
    }
  }

  try {
    const result = await listProposals({ status, targetNoteId, limit, cursor });
    return NextResponse.json(result);
  } catch {
    return jsonError(
      "提议列表暂时没有载入。已保存的内容没有改变，请稍后重试。",
      500,
      "PROPOSAL_STORAGE_READ_FAILED",
    );
  }
}

/**
 * 提交一条待确认的提议。
 *
 * **这里不读 `origin`。** 网页入口一律记为 `user`；内置 Agent 循环直接调服务层并显式传 `"ai"`。
 * 主体身份必须由服务端决定，不能由请求体声明（docs/reports/07 §5.3F 第 2 条）。
 */
export async function POST(request: Request) {
  const body = await readJsonBody(request);

  if (!body) {
    return jsonError("请求内容无法识别，请重新提交。", 400, "INVALID_JSON");
  }

  if (typeof body.kind !== "string" || !PROPOSAL_KINDS.includes(body.kind as ProposalKind)) {
    return jsonError("无法识别这类提议。", 400, "PROPOSAL_KIND_INVALID");
  }

  const payload = body.payload;

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonError("提议里没有要执行的内容。", 400, "PROPOSAL_PAYLOAD_REQUIRED");
  }

  if (
    body.riskLevel !== undefined &&
    (typeof body.riskLevel !== "string" || !RISK_LEVELS.includes(body.riskLevel as RiskLevel))
  ) {
    return jsonError("无法识别这个风险级别。", 400, "INVALID_RISK_LEVEL");
  }

  try {
    const proposal = await createProposal({
      kind: body.kind as ProposalKind,
      payload: payload as Record<string, unknown>,
      reason: typeof body.reason === "string" ? body.reason : null,
      targetNoteId: typeof body.targetNoteId === "string" ? body.targetNoteId : null,
      baseVersion: typeof body.baseVersion === "number" ? body.baseVersion : null,
      riskLevel: (body.riskLevel as RiskLevel | undefined) ?? undefined,
      impact:
        body.impact && typeof body.impact === "object" && !Array.isArray(body.impact)
          ? (body.impact as Record<string, unknown>)
          : null,
      origin: "user",
    });

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    return proposalErrorResponse(error, {
      code: "PROPOSAL_CREATE_FAILED",
      message: "提议暂时没有提交。已保存的内容没有改变，请稍后重试。",
    });
  }
}
