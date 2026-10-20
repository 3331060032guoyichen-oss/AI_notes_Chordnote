/**
 * AI 任务层：提示词 + 输出形状校验。
 *
 * 提示词只有这一份，不随供应商复制。传输、超时、错误码归 `lib/ai/provider.ts`；
 * 配置归 `lib/ai/config.ts`。这里不碰数据库，也不写正式内容。
 */

import type { OrganizeDraft } from "../../types/organize";
import {
  readModelSettings,
  resolveModelSettings,
  toProviderConfig,
} from "./config";
import { createChatProvider, ProviderError, type ChatProvider } from "./provider";

async function getProvider(): Promise<ChatProvider> {
  const file = await readModelSettings();
  const { settings } = resolveModelSettings(file);

  return createChatProvider(toProviderConfig(settings));
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
    throw new ProviderError("UPSTREAM_INVALID_JSON", "Model returned invalid JSON.");
  }

  if (!isOrganizeDraft(parsed)) {
    throw new ProviderError("UPSTREAM_INVALID_JSON", "Model returned an invalid draft shape.");
  }

  return parsed;
}

type AssistantInput = {
  question: string;
  context: string;
};

export async function askAssistant({ question, context }: AssistantInput): Promise<string> {
  const provider = await getProvider();
  const completion = await provider.chat({
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

  if (!completion.content) {
    throw new ProviderError("UPSTREAM_INVALID_JSON", "Model response did not contain an answer.");
  }

  return completion.content;
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
  const provider = await getProvider();
  const completion = await provider.chat({
    json: true,
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

  let parsed: unknown;

  try {
    parsed = JSON.parse(completion.content);
  } catch {
    throw new ProviderError("UPSTREAM_INVALID_JSON", "Model returned invalid JSON.");
  }

  if (!isNoteRevisionProposal(parsed)) {
    throw new ProviderError("UPSTREAM_INVALID_JSON", "Model returned an invalid revision shape.");
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
  const provider = await getProvider();
  const completion = await provider.chat({
    json: true,
    messages: [
      {
        role: "system",
        content:
          "You are an editorial assistant preparing a proposed organization of university study notes. Preserve the source's meaning, uncertainty, and point of view; do not add unsupported facts. Clearly mark interpretations as possibilities instead of facts. Write in the same language as rawText. Return only a valid JSON object with exactly these fields: title, summary, content, keyPoints, concepts, keywords, relatedKnowledge. title, summary, and content must be non-empty strings. keyPoints, concepts, and keywords must be arrays of strings. Each relation reason must be grounded in both provided items. Never invent knowledge IDs; use an empty relatedKnowledge array when no existing knowledge is provided. The complete Markdown content must start with one '# ' heading and then use these sections when evidence exists: '## 要点', '## 概念与关系', '## 来源', and '## 待确认'. Preserve every source [[wikilink]] and cite the actual Raw with '[[raw/inbox/<raw id>.md|原始记录标题]]（来源 id：<raw id>）' after reading it. Use [[页面标题]] or [[页面路径|显示名]] for links; do not treat repeated words as a formal relation. This is a proposal for the user to review, not a final decision.",
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

  const draft = parseOrganizeDraft(completion.content);
  const existingKnowledgeIds = new Set(
    existingKnowledge.map((knowledge) => knowledge.id),
  );

  return {
    ...draft,
    relatedKnowledge: draft.relatedKnowledge.filter((suggestion) =>
      existingKnowledgeIds.has(suggestion.knowledgeId),
    ),
  };
}
