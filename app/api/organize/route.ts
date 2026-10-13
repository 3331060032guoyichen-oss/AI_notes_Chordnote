import { NextResponse } from "next/server";

import {
  createOrganizeDraft,
  DeepSeekError,
  type DeepSeekRequestConfig,
} from "../../../lib/deepseek";
import { listNotes } from "../../../lib/services/notes";
import { getSource } from "../../../lib/services/sources";

export const runtime = "nodejs";

type OrganizeRequestBody = {
  rawId?: unknown;
  apiKey?: unknown;
  model?: unknown;
};

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

  const body = parsed as OrganizeRequestBody;

  if (typeof body.rawId !== "string" || !body.rawId.trim()) {
    return errorResponse("没有找到要整理的笔记，请重新选择。", 400, "RAW_ID_REQUIRED");
  }

  if (body.apiKey !== undefined && typeof body.apiKey !== "string") {
    return errorResponse("DeepSeek API Key 格式无法识别，请检查设置。", 400, "INVALID_AI_CONFIG");
  }

  if (body.model !== undefined && (typeof body.model !== "string" || !body.model.trim())) {
    return errorResponse("模型名称不能为空，请检查设置。", 400, "INVALID_AI_CONFIG");
  }

  let raw;

  try {
    raw = await getSource(body.rawId);
  } catch {
    return errorResponse(
      "笔记内容暂时没有载入。已保存的数据没有改变，请稍后重试。",
      500,
      "RAW_STORAGE_READ_FAILED",
    );
  }

  if (!raw) {
    return errorResponse("这条笔记已不存在，请刷新目录后重新选择。", 404, "RAW_NOT_FOUND");
  }

  try {
    const existingKnowledge = (await listNotes())
      .filter((knowledge) => knowledge.rawId !== raw.id)
      .slice(0, 20)
      .map((knowledge) => ({
        id: knowledge.id,
        title: knowledge.title,
        summary: knowledge.summary.slice(0, 300),
      }));

    const config: DeepSeekRequestConfig | undefined = body.apiKey !== undefined || body.model !== undefined
      ? {
          apiKey: body.apiKey as string | undefined,
          model: body.model as string | undefined,
        }
      : undefined;

    const draft = await createOrganizeDraft({
      rawText: raw.text,
      existingKnowledge,
      config,
    });

    return NextResponse.json({ draft });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      if (error.code === "CONFIG_MISSING") {
        return errorResponse(
          "还没有配置 DeepSeek API Key。请打开设置填写，或联系维护者配置服务器 Key。当前笔记仍然安全。",
          503,
          "DEEPSEEK_CONFIG_MISSING",
        );
      }

      if (error.code === "TIMEOUT") {
        return errorResponse(
          "编辑助理这次没有按时返回。当前笔记仍然安全，请稍后重新提出建议。",
          504,
          "DEEPSEEK_TIMEOUT",
        );
      }

      if (error.code === "UPSTREAM_INVALID_JSON") {
        return errorResponse(
          "编辑助理返回的建议无法审阅。当前笔记仍然安全，请重新提出建议。",
          502,
          "INVALID_DRAFT",
        );
      }

      return errorResponse(
        "编辑助理暂时无法回应。当前笔记仍然安全，请稍后重新提出建议。",
        502,
        "DEEPSEEK_UPSTREAM_ERROR",
      );
    }

    return errorResponse("AI 建议暂时没有提出。当前笔记仍然安全，请稍后重试。", 500, "ORGANIZE_FAILED");
  }
}
