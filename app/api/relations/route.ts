import { NextResponse } from "next/server";

import { createOrReviveLink, listLinks } from "../../../lib/services/links";
import { getNote } from "../../../lib/services/notes";

export const runtime = "nodejs";

type RelationRequestBody = {
  sourceId?: unknown;
  targetId?: unknown;
  type?: unknown;
  reason?: unknown;
};

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  try {
    return NextResponse.json({ relations: await listLinks() });
  } catch {
    return errorResponse(
      "交叉引用暂时没有载入。已收录的知识页没有改变，请稍后重试。",
      500,
      "RELATION_STORAGE_READ_FAILED",
    );
  }
}

/**
 * 建立交叉引用。
 *
 * 语义与旧实现一致：同一对知识页（**无序**）只保留一条 `related` 关系，
 * 因此 A→B 与 B→A 视为同一条；已被软删除的关系会被复活（`created: true`）。
 */
export async function POST(request: Request) {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return errorResponse("请求内容无法识别，请重新提交。", 400, "INVALID_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("请求格式无法识别，请重新提交。", 400, "INVALID_BODY");
  }

  const body = parsed as RelationRequestBody;

  if (typeof body.sourceId !== "string" || !body.sourceId.trim()) {
    return errorResponse("没有找到交叉引用的起始知识页。", 400, "SOURCE_ID_REQUIRED");
  }

  if (typeof body.targetId !== "string" || !body.targetId.trim()) {
    return errorResponse("没有找到交叉引用的目标知识页。", 400, "TARGET_ID_REQUIRED");
  }

  if (body.sourceId === body.targetId) {
    return errorResponse("同一张知识页无需与自己建立交叉引用。", 400, "SELF_RELATION");
  }

  if (body.type !== "related") {
    return errorResponse("暂时无法识别这种关联方式，请重新选择。", 400, "RELATION_TYPE_INVALID");
  }

  if (typeof body.reason !== "string" || !body.reason.trim()) {
    return errorResponse("请说明两张知识页为何相关。", 400, "RELATION_REASON_REQUIRED");
  }

  try {
    const [source, target] = await Promise.all([
      getNote(body.sourceId),
      getNote(body.targetId),
    ]);

    if (!source || !target) {
      return errorResponse(
        "交叉引用中的知识页已不存在，请刷新目录后重新选择。",
        404,
        "KNOWLEDGE_NOT_FOUND",
      );
    }

    const result = await createOrReviveLink({
      sourceId: source.id,
      targetId: target.id,
      reason: body.reason.trim(),
    });

    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch {
    return errorResponse(
      "交叉引用暂时没有保存。知识页没有受到影响，请稍后重试。",
      500,
      "RELATION_STORAGE_WRITE_FAILED",
    );
  }
}
