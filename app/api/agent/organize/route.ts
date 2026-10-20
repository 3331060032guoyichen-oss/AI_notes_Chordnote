import { NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/ai/provider";
import { SessionError } from "../../../../lib/agent/sessions";
import { estimateTokens, MESSAGE_BUDGET } from "../../../../lib/agent/context";
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
const PERMISSIONS = ["ask", "read", "propose"] as const;

type RequestBody = {
  sessionId?: unknown;
  question?: unknown;
  contextType?: unknown;
  contextId?: unknown;
  draftContext?: unknown;
  permission?: unknown;
};

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function isContextType(value: unknown): value is AgentRunContextType {
  return typeof value === "string" && CONTEXT_TYPES.includes(value as AgentRunContextType);
}

function isPermission(value: unknown): value is (typeof PERMISSIONS)[number] {
  return typeof value === "string" && PERMISSIONS.includes(value as (typeof PERMISSIONS)[number]);
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

  if (body.permission !== undefined && !isPermission(body.permission)) {
    return errorResponse("无法识别 AI 权限，请重新选择。", 400, "INVALID_PERMISSION");
  }

  if (estimateTokens(body.question) > MESSAGE_BUDGET) return errorResponse("消息过长，请分段发送。", 400, "MESSAGE_TOO_LONG");
  if (body.sessionId !== undefined && (typeof body.sessionId !== "string" || !/^[a-f0-9-]{36}$/.test(body.sessionId))) return errorResponse("会话编号无效。", 400, "INVALID_SESSION");
  try {
    const trace = await runOrganizeAgent({
      question: body.question.trim(),
      sessionId: body.sessionId as string | undefined,
      signal: request.signal,
      contextType: body.contextType,
      contextId: typeof body.contextId === "string" ? body.contextId : null,
      draftContext: typeof body.draftContext === "string" ? body.draftContext : null,
      permission: isPermission(body.permission) ? body.permission : undefined,
    });

    return NextResponse.json({ trace });
  } catch (error) {
    if (error instanceof SessionError) return errorResponse(error.message, error.code === "SESSION_BUSY" ? 409 : 404, error.code);
    // 材料读不到：这是用户能自己修的问题，不要伪装成服务端故障
    if (error instanceof AgentContextError) {
      const status = error.code === "CONTEXT_NOT_FOUND" ? 404 : 400;

      return errorResponse(error.message, status, error.code);
    }

    if (error instanceof ProviderError) {
      if (error.code === "CONFIG_MISSING") {
        return errorResponse(
          "agent 尚未完成服务配置。你的内容仍然安全，请打开设置配置模型。",
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
        error.message === "本轮上下文已达到长度上限，请缩小引用范围或开始新会话。" ? error.message : "agent 暂时无法回应。你的内容仍然安全，请稍后重新发起。",
        502,
        "DEEPSEEK_UPSTREAM_ERROR",
      );
    }

    return errorResponse("这次整理暂时没有完成。你的内容仍然安全，请稍后重试。", 500, "AGENT_RUN_FAILED");
  }
}
