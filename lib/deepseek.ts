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

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

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
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new DeepSeekError(
      "CONFIG_MISSING",
      "DeepSeek API key is not configured.",
    );
  }

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
        body: JSON.stringify({
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
        }),
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

    const completion = payload as ChatCompletionResponse;
    const content = completion.choices?.[0]?.message?.content;

    if (typeof content !== "string" || !content.trim()) {
      throw new DeepSeekError(
        "UPSTREAM_INVALID_JSON",
        "DeepSeek response did not contain an answer.",
      );
    }

    return content.trim();
  } finally {
    clearTimeout(timeout);
  }
}

type OrganizeInput = {
  rawText: string;
  existingKnowledge: Array<{
    id: string;
    title: string;
    summary: string;
  }>;
};

export async function createOrganizeDraft({
  rawText,
  existingKnowledge,
}: OrganizeInput): Promise<OrganizeDraft> {
  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    throw new DeepSeekError(
      "CONFIG_MISSING",
      "DeepSeek API key is not configured.",
    );
  }

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
        body: JSON.stringify({
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
        }),
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

    const completion = payload as ChatCompletionResponse;
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
  } finally {
    clearTimeout(timeout);
  }
}
