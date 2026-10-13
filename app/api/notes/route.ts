import { NextResponse } from "next/server";

import { createNoteFromText } from "../../../lib/services/notes";
import { MAX_RAW_TEXT_LENGTH } from "../../../lib/services/sources";

export const runtime = "nodejs";

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
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

  const text = (parsed as { text?: unknown }).text;

  if (typeof text !== "string") {
    return errorResponse("没有收到要保存的内容，请重新填写。", 400, "TEXT_REQUIRED");
  }

  if (!text.trim()) {
    return errorResponse("先写下一段内容，再尝试保存。", 400, "TEXT_EMPTY");
  }

  if (text.length > MAX_RAW_TEXT_LENGTH) {
    return errorResponse(
      `这条笔记不能超过 ${MAX_RAW_TEXT_LENGTH} 个字符，请删减后再保存。`,
      400,
      "TEXT_TOO_LONG",
    );
  }

  try {
    return NextResponse.json(await createNoteFromText(text), { status: 201 });
  } catch {
    return errorResponse(
      "这条笔记暂时没有保存。内容仍在输入框中，请稍后重试。",
      500,
      "NOTE_STORAGE_WRITE_FAILED",
    );
  }
}
