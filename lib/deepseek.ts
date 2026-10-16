import type { OrganizeDraft } from "../types/organize";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 30_000;

export class DeepSeekError extends Error {
  constructor(
    public readonly code:
      | "CONFIG_MISSING"
      | "TIMEOUT"
      | "UPSTREAM_ERROR"
      | "UPSTREAM_INVALID_JSON",
    message: string,
  ) {
    super(message);
    this.name = "DeepSeekError";
  }
}

type ChatCompletionMessage = {
  content?: unknown;
  tool_calls?: unknown;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: ChatCompletionMessage;
  }>;
};

/** 传给模型的函数定义（DeepSeek / OpenAI 兼容的 `/chat/completions` 线格式）。 */
export interface ChatToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

/** 模型要求调用某个工具。`arguments` 是 JSON **字符串**，要自己解析。 */
export interface ChatToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * 多轮对话里的一条消息。
 *
 * 工具循环要按这个形状把 assistant 的 `tool_calls` 原样回传，否则上游会拒绝。
 */
export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

function getTimeoutMs() {
  const configured = Number(process.env.DEEPSEEK_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

function getBaseUrl() {
  return (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

/**
 * 发一次 `/chat/completions` 并把响应信封收口。
 *
 * 抽出来的理由：请求 + 超时 + HTTP 错误 + JSON 解析这段逻辑，在"单轮问答"、
 * "结构化整理稿"、"工具循环"三处完全一样。抄三份迟早会分叉，所以只有一个实现。
 * 具体从响应里取什么字段，由调用方决定——那部分各函数确实不同。
 */
async function requestChatCompletion(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<ChatCompletionResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getTimeoutMs());

  try {
    let response: Response;

    try {
      response = await fetch(`${getBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DeepSeekError("TIMEOUT", "DeepSeek request timed out.");
      }

      throw new DeepSeekError("UPSTREAM_ERROR", "DeepSeek request failed.");
    }

    if (!response.ok) {
      throw new DeepSeekError(
        "UPSTREAM_ERROR",
        `DeepSeek returned HTTP ${response.status}.`,
      );
    }

    let payload: unknown;

    try {
      payload = await response.json();
    } catch {
      throw new DeepSeekError(
        "UPSTREAM_INVALID_JSON",
        "DeepSeek returned a non-JSON response.",
      );
    }

    if (!isRecord(payload)) {
      throw new DeepSeekError(
        "UPSTREAM_INVALID_JSON",
        "DeepSeek returned an invalid response envelope.",
      );
    }

    return payload as ChatCompletionResponse;
  } finally {
    clearTimeout(timeout);
  }
}

/** 取 API Key。缺了要抛 CONFIG_MISSING，而不是让请求带着 undefined 出去。 */
function requireApiKey(): string {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new DeepSeekError("CONFIG_MISSING", "DeepSeek API key is not configured.");
  }

  return apiKey;
}

export function isOrganizeDraft(value: unknown): value is OrganizeDraft {
  if (!isRecord(value)) return false;

  if (
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.summary) ||
    !isNonEmptyString(value.content) ||
    !isStringArray(value.keyPoints) ||
    !isStringArray(value.concepts) ||
    !isStringArray(value.keywords) ||
    !Array.isArray(value.relatedKnowledge)
  ) {
    return false;
  }

  return value.relatedKnowledge.every((item) => {
    if (!isRecord(item)) return false;
    return isNonEmptyString(item.knowledgeId) && isNonEmptyString(item.reason);
  });
}

export function parseOrganizeDraft(content: string): OrganizeDraft {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("DeepSeek returned invalid JSON.");
  }

  if (!isOrganizeDraft(parsed)) {
    throw new Error("DeepSeek returned an invalid draft shape.");
  }

  return parsed;
}

type AssistantInput = {
  question: string;
  context: string;
};

export async function askAssistant({
  question,
  context,
}: AssistantInput): Promise<string> {
  const completion = await requestChatCompletion(requireApiKey(), {
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content:
          "You are an editorial assistant inside a private knowledge editor. Only answer from the material in the user message's `context` field. Never invent facts or use outside knowledge. If the material is empty or insufficient, state that plainly and identify what evidence is missing. Separate statements supported by the material from your own possible interpretations. Use calm, concise, proposal-oriented language such as 'one possible reading is' rather than presenting your interpretation as final. The user retains final judgment. Answer in the same language as the question.",
      },
      {
        role: "user",
        content: JSON.stringify({ context, question }),
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;

  if (typeof content !== "string" || !content.trim()) {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek response did not contain an answer.",
    );
  }

  return content.trim();
}

type OrganizeInput = {
  rawText: string;
  existingKnowledge: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
};

/**
 * 编辑助理针对某张知识页提出的改写。
 *
 * `content` 是**改写后的完整正文**：Diff 预览卡要拿它和当前正文逐行比对，
 * 用户确认后也是整段写入，所以不能只返回片段。
 */
export type NoteRevisionProposal = {
  content: string;
  /** null 表示不动摘要。 */
  summary: string | null;
  reason: string;
};

function isNoteRevisionProposal(value: unknown): value is NoteRevisionProposal {
  if (!isRecord(value)) return false;

  const summary = value.summary;

  return (
    isNonEmptyString(value.content) &&
    isNonEmptyString(value.reason) &&
    (summary === null || summary === undefined || isNonEmptyString(summary))
  );
}

type ProposeNoteRevisionInput = {
  noteTitle: string;
  noteSummary: string;
  currentContent: string;
  question: string;
};

/**
 * 让编辑助理针对一张知识页写一段改写建议。
 *
 * 注意它**只产出文本**，不碰数据库：提议的落库由调用方走 `createProposal`，
 * 正式写入要等用户确认。这条分界与 `/api/organize` 产草稿是同一条规矩。
 */
export async function proposeNoteRevision({
  noteTitle,
  noteSummary,
  currentContent,
  question,
}: ProposeNoteRevisionInput): Promise<NoteRevisionProposal> {
  const completion = await requestChatCompletion(requireApiKey(), {
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an editorial assistant inside a private knowledge editor for university students. The user message contains the note under `note` and the student's `question`. Produce a proposed revision of this note's body that addresses the question, using ONLY the material already in the note. Never invent facts, numbers, sources or citations. Preserve the note's meaning, its uncertainty and its point of view. Keep the student's own wording where it is already clear. Return only a valid JSON object with exactly these fields: content, summary, reason. `content` must be the COMPLETE revised body as one string, in the same language as the note — not a diff, not a fragment, not commentary about the change. `summary` is a one-sentence summary in the same language, or null to leave the existing summary untouched. `reason` must be one short sentence in the same language explaining why this edit is worth accepting. This is a proposal for the student to review, not a final decision.",
      },
      {
        role: "user",
        content: JSON.stringify({
          note: { title: noteTitle, summary: noteSummary, content: currentContent },
          question,
        }),
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek response did not contain a revision.",
    );
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek returned invalid JSON.",
    );
  }

  if (!isNoteRevisionProposal(parsed)) {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek returned an invalid revision shape.",
    );
  }

  return {
    content: parsed.content.trim(),
    summary: isNonEmptyString(parsed.summary) ? parsed.summary.trim() : null,
    reason: parsed.reason.trim(),
  };
}

export async function createOrganizeDraft({
  rawText,
  existingKnowledge,
}: OrganizeInput): Promise<OrganizeDraft> {
  const completion = await requestChatCompletion(requireApiKey(), {
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content:
          "You are an editorial assistant preparing a proposed organization of university study notes. Preserve the source's meaning, uncertainty, and point of view; do not add unsupported facts. Clearly mark interpretations as possibilities instead of facts. Write in the same language as rawText. Return only a valid JSON object with exactly these fields: title, summary, content, keyPoints, concepts, keywords, relatedKnowledge. title, summary, and content must be non-empty strings. keyPoints, concepts, and keywords must be arrays of strings. relatedKnowledge must be an array of objects with knowledgeId and reason strings. Each relation reason must be grounded in both provided items. Never invent knowledge IDs; use an empty relatedKnowledge array when no existing knowledge is provided. This is a proposal for the user to review, not a final decision.",
      },
      {
        role: "user",
        content: JSON.stringify({
          rawText,
          existingKnowledge,
        }),
      },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek response did not contain draft content.",
    );
  }

  try {
    const draft = parseOrganizeDraft(content);
    const existingKnowledgeIds = new Set(
      existingKnowledge.map((knowledge) => knowledge.id),
    );

    return {
      ...draft,
      relatedKnowledge: draft.relatedKnowledge.filter((suggestion) =>
        existingKnowledgeIds.has(suggestion.knowledgeId),
      ),
    };
  } catch {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek returned an invalid draft.",
    );
  }
}

export type ChatWithToolsInput = {
  messages: ChatMessage[];
  tools: ChatToolDefinition[];
};

export type ChatWithToolsResult = {
  /** 模型的自然语言回复。只调工具不讲话时是空串。 */
  content: string;
  /** 模型要求调用的工具。空数组表示本轮没有工具调用，循环可以收尾。 */
  toolCalls: ChatToolCall[];
};

function isToolCall(value: unknown): value is ChatToolCall {
  if (!isRecord(value)) return false;

  const fn = value.function;

  return (
    typeof value.id === "string" &&
    value.type === "function" &&
    isRecord(fn) &&
    typeof fn.name === "string" &&
    typeof fn.arguments === "string"
  );
}

/**
 * 带工具的一轮对话。
 *
 * 与另外两个函数的区别：这里不把"没有文本"当错误——模型可能整轮都在调工具，
 * `content` 是空串或 null。是否收尾由调用方按 `toolCalls` 是否为空判断。
 */
export async function createChatCompletionWithTools({
  messages,
  tools,
}: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  const completion = await requestChatCompletion(requireApiKey(), {
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    temperature: 0.2,
    messages,
    tools,
    tool_choice: "auto",
  });

  const message = completion.choices?.[0]?.message;

  if (!message) {
    throw new DeepSeekError(
      "UPSTREAM_INVALID_JSON",
      "DeepSeek response did not contain a message.",
    );
  }

  const rawCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  return {
    content: typeof message.content === "string" ? message.content.trim() : "",
    toolCalls: rawCalls.filter(isToolCall),
  };
}
