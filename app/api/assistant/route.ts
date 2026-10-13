import { NextResponse } from "next/server";

import { askAssistant, DeepSeekError } from "../../../lib/deepseek";
import { getNote } from "../../../lib/services/notes";
import { getSource } from "../../../lib/services/sources";

export const runtime = "nodejs";

type ContextType = "knowledge" | "raw" | "draft" | "none";

type AssistantRequestBody = {
  question?: unknown;
  contextType?: unknown;
  contextId?: unknown;
  draftContext?: unknown;
};

const CONTEXT_TYPES: ContextType[] = ["knowledge", "raw", "draft", "none"];

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isContextType(value: unknown): value is ContextType {
  return typeof value === "string" && CONTEXT_TYPES.includes(value as ContextType);
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

  const body = parsed as AssistantRequestBody;

  if (typeof body.question !== "string" || !body.question.trim()) {
    return errorResponse("先写下一个问题，再交给编辑助理。", 400, "QUESTION_REQUIRED");
  }

  if (!isContextType(body.contextType)) {
    return errorResponse("无法识别引用材料的类型，请重新选择。", 400, "INVALID_CONTEXT_TYPE");
  }

  let context = "";

  try {
    if (body.contextType === "knowledge") {
      if (typeof body.contextId !== "string" || !body.contextId.trim()) {
        return errorResponse("没有找到引用的知识页，请重新选择。", 400, "CONTEXT_ID_REQUIRED");
      }
      const knowledge = await getNote(body.contextId);
      if (!knowledge) {
        return errorResponse("引用的知识页已不存在，请重新选择。", 404, "KNOWLEDGE_NOT_FOUND");
      }
      context = [knowledge.title, knowledge.summary, knowledge.content].join("\n\n");
    } else if (body.contextType === "raw") {
      if (typeof body.contextId !== "string" || !body.contextId.trim()) {
        return errorResponse("没有找到引用的原始记录，请重新选择。", 400, "CONTEXT_ID_REQUIRED");
      }
      const raw = await getSource(body.contextId);
      if (!raw) {
        return errorResponse("引用的原始记录已不存在，请重新选择。", 404, "RAW_NOT_FOUND");
      }
      context = raw.text;
    } else if (body.contextType === "draft") {
      context = typeof body.draftContext === "string" ? body.draftContext : "";
    }
  } catch {
    return errorResponse(
      "引用的材料暂时没有载入。已保存的内容没有改变，请稍后重试。",
      500,
      "CONTEXT_READ_FAILED",
    );
  }

  try {
    const answer = await askAssistant({ question: body.question, context });
    return NextResponse.json({ answer });
  } catch (error) {
    if (error instanceof DeepSeekError) {
      const status = error.code === "CONFIG_MISSING" ? 503 : 502;
      const message = error.code === "CONFIG_MISSING"
        ? "编辑助理尚未完成服务配置。你的内容仍然安全，请联系维护者。"
        : error.code === "TIMEOUT"
          ? "编辑助理这次没有按时返回。你的内容仍然安全，请稍后重试。"
          : error.code === "UPSTREAM_INVALID_JSON"
            ? "编辑助理的回复暂时无法呈现。你的内容仍然安全，请重新提问。"
            : "编辑助理暂时无法回应。你的内容仍然安全，请稍后重试。";
      return errorResponse(message, status, error.code);
    }
    return errorResponse("编辑助理暂时无法回应。你的内容仍然安全，请稍后重试。", 500, "ASSISTANT_FAILED");
  }
}
