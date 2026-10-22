import { NextResponse } from "next/server";

import { isOrganizeDraft } from "../../../lib/ai/tasks";
import { listArchivedNotes, listNotes, promoteFromSource } from "../../../lib/services/notes";
import { getSource } from "../../../lib/services/sources";

export const runtime = "nodejs";

type KnowledgeRequestBody = {
  rawId?: unknown;
  draft?: unknown;
  origin?: unknown;
};

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * 知识页列表。
 *
 * `?scope=archived` 读已归档的那些 —— 归档是"日常看不到"，所以要有一条显式的读取路径，
 * 否则归档就成了一扇单向门。
 */
export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    const knowledges = scope === "archived" ? await listArchivedNotes() : await listNotes();
    return NextResponse.json({ knowledges });
  } catch {
    return errorResponse(
      "知识页暂时没有载入。已收录的内容没有改变，请稍后重试。",
      500,
      "KNOWLEDGE_STORAGE_READ_FAILED",
    );
  }
}

/**
 * 从原始记录提升为知识页（决策 4：知识页只能这样创建）。
 *
 * 请求体沿用现有契约 `{ rawId, draft }`：draft 允许来自 AI 整理稿，也允许由界面
 * 按同一形状手工组装（"手动提升"路径），因此不改变前端契约。
 *
 * `origin` 可选（'user' | 'ai'），默认 'user'；AI 整理流程应显式传 'ai' 以保留来源。
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

  const body = parsed as KnowledgeRequestBody;

  if (typeof body.rawId !== "string" || !body.rawId.trim()) {
    return errorResponse("没有找到整理稿对应的原始记录，请重新整理。", 400, "RAW_ID_REQUIRED");
  }

  if (!isOrganizeDraft(body.draft)) {
    return errorResponse("整理稿的内容不完整，暂时无法收录。请重新整理。", 400, "INVALID_DRAFT");
  }

  if (body.origin !== undefined && body.origin !== "user" && body.origin !== "ai") {
    return errorResponse("来源标记无法识别，请重新提交。", 400, "INVALID_ORIGIN");
  }

  try {
    const raw = await getSource(body.rawId);

    if (!raw) {
      return errorResponse("整理稿对应的原始记录已不存在，暂时无法收录。", 404, "RAW_NOT_FOUND");
    }

    const result = await promoteFromSource({
      rawId: raw.id,
      rawCategory: body.draft.rawCategory,
      wikiCategory: body.draft.wikiCategory,
      title: body.draft.title,
      summary: body.draft.summary,
      content: body.draft.content,
      keyPoints: body.draft.keyPoints,
      concepts: body.draft.concepts,
      keywords: body.draft.keywords,
      origin: body.origin === "ai" ? "ai" : "user",
    });

    return NextResponse.json({ ...result, raw: await getSource(raw.id) }, { status: result.created ? 201 : 200 });
  } catch {
    return errorResponse(
      "整理稿暂时无法收录。原始记录仍然安全，请稍后重试。",
      500,
      "KNOWLEDGE_STORAGE_WRITE_FAILED",
    );
  }
}
