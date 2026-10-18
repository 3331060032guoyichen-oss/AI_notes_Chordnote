import { NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/ai/provider";
import {
  AgentContextError,
  runOrganizeAgent,
  type AgentRunContextType,
} from "../../../../lib/agent/loop";

export const runtime = "nodejs";

/**
 * 让 agent 整理一份材料，返回可渲染的轨迹。
 *
 * 与 `/api/assistant` 的关键区别：那个是**单轮问答**，这个是**带工具调用的循环**——
 * 模型会自己检索、通读、然后提出待确认的提议。提议会真的落进 `proposals` 表
 * （`origin='ai'`、`status='pending'`），但正式数据一条都不会动：
 * 落库要等用户在界面上确认，走 `/api/proposals/:id/approve` + `/apply`。
 */

const CONTEXT_TYPES: AgentRunContextType[] = ["raw", "knowledge", "draft", "none"];

type RequestBody = {
  question?: unknown;
  contextType?: unknown;
  contextId?: unknown;
  draftContext?: unknown;
};

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isContextType(value: unknown): value is AgentRunContextType {
  return typeof value === "string" && CONTEXT_TYPES.includes(value as AgentRunContextType);
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

  const body = parsed as RequestBody;

  if (typeof body.question !== "string" || !body.question.trim()) {
    return errorResponse("先写下要 agent 做什么，再交给它。", 400, "QUESTION_REQUIRED");
  }

  if (!isContextType(body.contextType)) {
    return errorResponse("无法识别引用材料的类型，请重新选择。", 400, "INVALID_CONTEXT_TYPE");
  }

  try {
    const trace = await runOrganizeAgent({
      question: body.question.trim(),
      signal: request.signal,
      contextType: body.contextType,
      contextId: typeof body.contextId === "string" ? body.contextId : null,
      draftContext: typeof body.draftContext === "string" ? body.draftContext : null,
    });

    return NextResponse.json({ trace });
  } catch (error) {
    // 材料读不到：这是用户能自己修的问题，不要伪装成服务端故障
    if (error instanceof AgentContextError) {
      const status = error.code === "CONTEXT_NOT_FOUND" ? 404 : 400;

      return errorResponse(error.message, status, error.code);
    }

    if (error instanceof ProviderError) {
      if (error.code === "CONFIG_MISSING") {
        return errorResponse(
          "agent 尚未完成服务配置。你的内容仍然安全，请联系维护者。",
          503,
          "DEEPSEEK_CONFIG_MISSING",
        );
      }

      if (error.code === "TIMEOUT") {
        return errorResponse(
          "agent 这次没有按时返回。你的内容仍然安全，请稍后重新发起。",
          504,
          "DEEPSEEK_TIMEOUT",
        );
      }

      if (error.code === "UPSTREAM_INVALID_JSON") {
        return errorResponse(
          "agent 返回的结果无法呈现。你的内容仍然安全，请重新发起。",
          502,
          "INVALID_AGENT_RESPONSE",
        );
      }

      return errorResponse(
        "agent 暂时无法回应。你的内容仍然安全，请稍后重新发起。",
        502,
        "DEEPSEEK_UPSTREAM_ERROR",
      );
    }

    return errorResponse("这次整理暂时没有完成。你的内容仍然安全，请稍后重试。", 500, "AGENT_RUN_FAILED");
  }
}
