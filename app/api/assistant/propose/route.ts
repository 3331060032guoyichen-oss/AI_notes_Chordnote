import { NextResponse } from "next/server";

import { ProviderError } from "../../../../lib/ai/provider";
import { proposeNoteRevision } from "../../../../lib/ai/tasks";
import { getNote } from "../../../../lib/services/notes";
import { createProposal } from "../../../../lib/services/proposals";

export const runtime = "nodejs";

/**
 * 编辑助理针对一张知识页生成**改写提议**。
 *
 * 与 `/api/assistant`（单轮问答，只返回文本）的分工：那个是"问我一句"，
 * 这个是"你要改我的正文"。后者必然产生写入意图，所以它**不写正文**，
 * 只落一条 `status = 'pending'` 的 `note_update` 提议，等用户在正文底部确认。
 * 这是 AGENTS.md 改动边界里"AI 只生成草稿或回答，落库必须经过用户确认"的具体形态。
 *
 * 请求体：`{ knowledgeId, question }`。
 * 响应：`{ proposal }`，其中 `payload.content` 是改写后的完整正文，供前端做 Diff。
 */

type ProposeRequestBody = {
  knowledgeId?: unknown;
  question?: unknown;
};

/** 发起这条提议的主体标识。写进 proposals.agent_id 与审计，便于回溯是谁提的。 */
const ASSISTANT_AGENT_ID = "chordnote-editor-assistant";

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

  const body = parsed as ProposeRequestBody;

  if (typeof body.knowledgeId !== "string" || !body.knowledgeId.trim()) {
    return errorResponse("没有找到要改写的知识页，请重新选择。", 400, "KNOWLEDGE_ID_REQUIRED");
  }

  if (typeof body.question !== "string" || !body.question.trim()) {
    return errorResponse("先写下想让编辑助理改什么，再提交。", 400, "QUESTION_REQUIRED");
  }

  let note;

  try {
    note = await getNote(body.knowledgeId);
  } catch {
    return errorResponse(
      "这张知识页暂时没有载入。已保存的内容没有改变，请稍后重试。",
      500,
      "KNOWLEDGE_READ_FAILED",
    );
  }

  if (!note) {
    return errorResponse("要改写的知识页已不存在，请重新选择。", 404, "KNOWLEDGE_NOT_FOUND");
  }

  let revision;

  try {
    revision = await proposeNoteRevision({
      noteTitle: note.title,
      noteSummary: note.summary,
      currentContent: note.content,
      question: body.question,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "CONFIG_MISSING" ? 503 : 502;
      const message = error.code === "CONFIG_MISSING"
        ? "编辑助理尚未完成服务配置。你的内容仍然安全，请联系维护者。"
        : error.code === "TIMEOUT"
          ? "编辑助理这次没有按时返回。你的内容仍然安全，请稍后重试。"
          : error.code === "UPSTREAM_INVALID_JSON"
            ? "编辑助理这次给出的改写无法呈现。你的内容仍然安全，请重新提交。"
            : "编辑助理暂时无法回应。你的内容仍然安全，请稍后重试。";
      return errorResponse(message, status, error.code);
    }

    return errorResponse(
      "编辑助理暂时无法回应。你的内容仍然安全，请稍后重试。",
      500,
      "ASSISTANT_PROPOSE_FAILED",
    );
  }

  try {
    const proposal = await createProposal({
      kind: "note_update",
      payload: {
        noteId: note.id,
        content: revision.content,
        summary: revision.summary,
        reason: revision.reason,
      },
      reason: revision.reason,
      targetNoteId: note.id,
      // 版本快照：执行时若这一页已经不是这个版本，提议判为过期而不是覆盖用户的手改。
      baseVersion: note.version ?? null,
      riskLevel: "medium",
      impact: {
        noteId: note.id,
        baseVersion: note.version ?? null,
        previousLength: note.content.length,
        nextLength: revision.content.length,
      },
      // 主体是 agent，不是用户。origin 只由服务端代码决定（见 createProposal 的注释）。
      origin: "ai",
      agentId: ASSISTANT_AGENT_ID,
    });

    return NextResponse.json({ proposal }, { status: 201 });
  } catch {
    return errorResponse(
      "改写提议暂时没有提交。你的正文没有改变，请稍后重试。",
      500,
      "PROPOSAL_CREATE_FAILED",
    );
  }
}
