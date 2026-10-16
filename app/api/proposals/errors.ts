import { NextResponse } from "next/server";

import { ProposalError, type ProposalErrorCode } from "../../../lib/services/proposals";

/**
 * 提议接口的错误映射。
 *
 * 服务层抛 `ProposalError`（带稳定的 `code`），路由只负责翻成 HTTP 状态码，
 * 业务判断不在这一层重复。消息沿用服务层的写法：面向用户、说明数据是否安全、下一步做什么
 * （见 docs/schema.md §5 的约定）。
 */
const STATUS_BY_CODE: Record<ProposalErrorCode, number> = {
  PROPOSAL_NOT_FOUND: 404,
  PROPOSAL_INVALID_TRANSITION: 409,
  PROPOSAL_KIND_UNSUPPORTED: 400,
  PROPOSAL_PAYLOAD_INVALID: 400,
  PROPOSAL_TARGET_MISSING: 409,
  PROPOSAL_TARGET_STALE: 409,
};

export function proposalErrorResponse(
  error: unknown,
  fallback: { code: string; message: string },
) {
  if (error instanceof ProposalError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: STATUS_BY_CODE[error.code] },
    );
  }

  return NextResponse.json({ error: fallback }, { status: 500 });
}

/** 参数校验失败用的响应，与项目其余路由的 `{ error: { code, message } }` 形状一致。 */
export function jsonError(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/** 统一的 JSON 请求体解析：解析失败或不是对象都返回 null，由调用方给具体错误码。 */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

  return parsed as Record<string, unknown>;
}
