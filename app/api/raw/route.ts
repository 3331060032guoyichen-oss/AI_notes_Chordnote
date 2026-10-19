import { NextResponse } from "next/server";

import { getActiveNoteByRawId } from "../../../lib/services/notes";
import {
  archiveSource,
  createSource,
  createUntitledSource,
  listArchivedSources,
  listSources,
  MAX_RAW_TEXT_LENGTH,
  MAX_RAW_TITLE_LENGTH,
} from "../../../lib/services/sources";

export const runtime = "nodejs";

type RawRequestBody = { text?: unknown; title?: unknown; rawId?: unknown };

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * 原始记录列表。
 *
 * `?scope=archived` 读已归档的那些 —— 与 `GET /api/knowledge?scope=archived` 同口径：
 * 归档是「日常看不到」，得有回去看的路，否则归档就成了单向门。
 */
export async function GET(request: Request) {
  try {
    const scope = new URL(request.url).searchParams.get("scope");
    const raws = scope === "archived" ? await listArchivedSources() : await listSources();
    return NextResponse.json({ raws });
  } catch {
    return errorResponse(
      "原始记录暂时没有载入。已保存的数据没有改变，请稍后重试。",
      500,
      "RAW_STORAGE_READ_FAILED",
    );
  }
}

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

  const body = parsed as RawRequestBody;

  if (typeof body.text !== "string") {
    return errorResponse("没有收到要留下的内容，请重新填写。", 400, "TEXT_REQUIRED");
  }

  if (!body.text.trim()) {
    return errorResponse("先写下一段原话，再尝试保存。", 400, "TEXT_EMPTY");
  }

  if (body.text.length > MAX_RAW_TEXT_LENGTH) {
    return errorResponse(
      `这段原话不能超过 ${MAX_RAW_TEXT_LENGTH} 个字符，请删减后再保存。`,
      400,
      "TEXT_TOO_LONG",
    );
  }

  // 笔记名可选；只做长度与类型校验，不接受非字符串
  let title: string | null = null;
  if (body.title !== undefined && body.title !== null) {
    if (typeof body.title !== "string") {
      return errorResponse("笔记名的格式无法识别，请重新填写。", 400, "TITLE_INVALID");
    }
    if (body.title.length > MAX_RAW_TITLE_LENGTH) {
      return errorResponse(
        `笔记名不能超过 ${MAX_RAW_TITLE_LENGTH} 个字符，请缩短后再保存。`,
        400,
        "TITLE_TOO_LONG",
      );
    }
    title = body.title;
  }

  try {
    return NextResponse.json({ raw: title?.trim() ? await createSource(body.text, title) : await createUntitledSource(body.text) }, { status: 201 });
  } catch {
    return errorResponse(
      "这段原话暂时没有留下。内容没有写入，请稍后重试。",
      500,
      "RAW_STORAGE_WRITE_FAILED",
    );
  }
}

/**
 * 普通"移除"路径 = 归档，不做物理删除。
 *
 * 为什么归档而不是删除：原始记录是知识页的出处（`notes.raw_id` 是 RESTRICT 外键），
 * 物理删除会让知识页失去来源；永久清除必须走独立的高风险流程（见 outputs/10）。
 *
 * 响应仍保留 `deleted` 字段以保持前端契约不变，并额外返回 `archived: true` 说明真实语义。
 */
export async function DELETE(request: Request) {
  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return errorResponse("请求内容无法识别，请重新提交。", 400, "INVALID_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("请求格式无法识别，请重新提交。", 400, "INVALID_BODY");
  }

  const body = parsed as RawRequestBody;

  if (typeof body.rawId !== "string" || !body.rawId.trim()) {
    return errorResponse("没有找到要移除的原始记录，请重新选择。", 400, "RAW_ID_REQUIRED");
  }

  try {
    // 只看**当前有效**的那一页：已归档的知识页不再挡着它的出处被收起，
    // 否则用户会卡死在"那一页已归档、这条原话却永远删不掉"。
    const knowledge = await getActiveNoteByRawId(body.rawId);
    if (knowledge) {
      return errorResponse(
        `这条原话已经整理成「${knowledge.title}」了。要先收起它，请先在左栏「笔记」里归档那一页，再回来移除这条记录。`,
        409,
        "RAW_REFERENCED_BY_KNOWLEDGE",
      );
    }

    const archived = await archiveSource(body.rawId);
    if (!archived) {
      return errorResponse("这条原始记录已不存在，请刷新目录。", 404, "RAW_NOT_FOUND");
    }

    return NextResponse.json({ deleted: archived, archived: true });
  } catch {
    return errorResponse(
      "这条原始记录暂时无法移除。其他内容没有受到影响，请稍后重试。",
      500,
      "RAW_STORAGE_DELETE_FAILED",
    );
  }
}
