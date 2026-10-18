import { NextResponse } from "next/server";

import { AuthorizationError, requireUserActor } from "../../../../lib/auth/authorize";
import { getUserContext } from "../../../../lib/auth/context";
import { MAX_RAW_TEXT_LENGTH, updateSource } from "../../../../lib/services/sources";

export const runtime = "nodejs";

type RawPatchBody = { text?: unknown; markdown?: unknown; path?: unknown; version?: unknown };

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * 修改原始记录正文（`user_edit`）。
 *
 * 产品原则：**Raw 用户可改、AI 不可改**。这里的"用户可改"指的是用户本人在界面上的正常编辑，
 * 不需要提议或自我审批；但 Agent 主体调用会被服务端拒绝（403 `USE_PROPOSAL_FLOW`），
 * 不允许借这个接口绕过提议机制。
 *
 * 每次成功修改都会在同一事务里留下一条修订记录（`audit_log`，含改前 / 改后原文），
 * 因此原始内容不会被静默覆盖。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  if (!id || !id.trim()) {
    return errorResponse("没有找到要修改的原始记录，请刷新目录。", 404, "RAW_NOT_FOUND");
  }

  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return errorResponse("请求内容无法识别，请重新提交。", 400, "INVALID_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("请求格式无法识别，请重新提交。", 400, "INVALID_BODY");
  }

  const body = parsed as RawPatchBody;

  if (typeof body.text !== "string") {
    return errorResponse("没有收到要保存的内容，请重新填写。", 400, "TEXT_REQUIRED");
  }

  if (!body.text.trim()) {
    return errorResponse("原文不能改成空白，请补充内容后再保存。", 400, "TEXT_EMPTY");
  }

  if (body.text.length > MAX_RAW_TEXT_LENGTH) {
    return errorResponse(
      `这段原话不能超过 ${MAX_RAW_TEXT_LENGTH} 个字符，请删减后再保存。`,
      400,
      "TEXT_TOO_LONG",
    );
  }

  try {
    requireUserActor(getUserContext());

    if (body.markdown !== undefined && (typeof body.markdown !== "string" || body.markdown.length > MAX_RAW_TEXT_LENGTH)) return errorResponse("文档无效", 400, "INVALID_MARKDOWN");
    const result = await updateSource(id, body.text, typeof body.markdown === "string" ? {
      markdown: body.markdown, path: typeof body.path === "string" ? body.path : undefined,
      version: typeof body.version === "number" ? body.version : undefined,
    } : undefined);

    if (result.status === "not_found") {
      return errorResponse("这条原始记录已不存在，请刷新目录。", 404, "RAW_NOT_FOUND");
    }

    if (result.status === "unchanged") {
      return NextResponse.json({ raw: result.raw, changed: false });
    }

    return NextResponse.json({
      raw: result.raw,
      changed: true,
      revisionId: result.revisionId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CONFLICT") return errorResponse("记录已有新版本，当前编辑已保留，请重新载入后合并。", 409, "VERSION_CONFLICT");
    if (error instanceof AuthorizationError) {
      return errorResponse("该操作需要通过提议流程，请改用提议接口。", 403, error.code);
    }

    return errorResponse(
      "这段原话暂时没有保存。内容没有改变，请稍后重试。",
      500,
      "RAW_STORAGE_WRITE_FAILED",
    );
  }
}
