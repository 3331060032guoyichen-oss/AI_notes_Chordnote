import { readModelSettings, resolveModelSettings } from "../ai/config";
import type { ChatToolCall } from "../ai/provider";
import { runHarness } from "./runtime";
import { parseOrganizeDraft } from "../ai/tasks";
import { createProposal } from "../services/proposals";
import { getNote, listNotes } from "../services/notes";
import { getSource } from "../services/sources";
import type { AgentRunTrace, AgentStep } from "../../types/agent";
import {
  AGENT_INSTRUCTION,
  MANUAL_VERSION,
  authorizationList,
  getTool,
  toChatToolDefinitions,
} from "./manual";

// Agent 工具循环。
//
// 这个文件是"模型提议 → 宿主执行 → 结果回传 → 继续推理"的宿主一侧。
// 它最要紧的性质是**结构性的**：整个循环里没有任何一条写正式数据的路径。
// 只读工具直接执行；写意图一律调用 `createProposal()`，产出 status='pending' 的提议。
// 也就是说"Agent 直接越权写入条目"不是靠约定避免的，而是不可能发生——
// 没有那个函数可以调。这一点比任何提示词约束都可靠。

/** 单次运行的最大轮数。防止模型在工具之间来回打转把额度烧光。 */


/** `search_notes` 一次最多回传几条，避免把上下文塞满。 */
const MAX_SEARCH_HITS = 8;

/** `read_note` 回传给模型的正文上限。 */
const READ_NOTE_CHAR_LIMIT = 4000;

export type AgentRunContextType = "raw" | "knowledge" | "draft" | "none";

export type AgentRunInput = {
  /** 用户那句话，例如「把这道错题整理进知识库」。 */
  question: string;
  history?: {role:"user"|"assistant";text:string}[];
  signal?: AbortSignal;
  contextType: AgentRunContextType;
  contextId?: string | null;
  draftContext?: string | null;
};

/** 材料读不到时要让路由能给出 404 / 400，而不是伪装成 500。 */
export class AgentContextError extends Error {
  constructor(
    public readonly code: "CONTEXT_ID_REQUIRED" | "CONTEXT_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "AgentContextError";
  }
}

type LoadedContext = {
  material: string;
  contextTitle: string | null;
};

/**
 * 按 `contextType` + `contextId` **在服务端重新读一遍真实内容**。
 *
 * 与 `/api/assistant` 一致：材料不经浏览器传递，所以前端无法篡改送进模型的东西。
 */
async function loadContext(input: AgentRunInput): Promise<LoadedContext> {
  if (input.contextType === "none") {
    return { material: "", contextTitle: null };
  }

  if (input.contextType === "draft") {
    return {
      material: typeof input.draftContext === "string" ? input.draftContext : "",
      contextTitle: null,
    };
  }

  if (!input.contextId) {
    throw new AgentContextError("CONTEXT_ID_REQUIRED", "没有找到要整理的笔记，请重新选择。");
  }

  if (input.contextType === "knowledge") {
    const note = await getNote(input.contextId);

    if (!note) {
      throw new AgentContextError("CONTEXT_NOT_FOUND", "引用的知识页已不存在，请重新选择。");
    }

    return {
      material: [note.title, note.summary, note.content].join("\n\n"),
      contextTitle: note.title,
    };
  }

  const raw = await getSource(input.contextId);

  if (!raw) {
    throw new AgentContextError("CONTEXT_NOT_FOUND", "引用的原始记录已不存在，请重新选择。");
  }

  return { material: raw.text, contextTitle: raw.title ?? null };
}

type SearchHit = { id: string; title: string; summary: string };

/**
 * 本地关键词检索。
 *
 * 刻意不做模糊匹配、不做向量检索：命中与否必须**可解释**——
 * 用户看到"命中 2 条"时，得能自己在标题/概念/关键词里对照出为什么。
 */
async function searchNotes(keywords: string[]): Promise<SearchHit[]> {
  const terms = keywords.map((keyword) => keyword.trim().toLowerCase()).filter(Boolean);

  if (terms.length === 0) return [];

  const notes = await listNotes();

  return notes
    .filter((note) => {
      const haystack = [
        note.title,
        note.summary,
        note.content,
        ...(note.concepts ?? []),
        ...(note.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return terms.some((term) => haystack.includes(term));
    })
    .slice(0, MAX_SEARCH_HITS)
    .map((note) => ({ id: note.id, title: note.title, summary: note.summary.slice(0, 300) }));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 解析模型给的 JSON 参数。解析不了就当作一次失败的调用，而不是让整个循环崩掉。 */
function parseArguments(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

type ToolOutcome = {
  draft?: AgentRunTrace["draft"];
  /** 记进轨迹的步骤。为 null 表示这一步不单独展示（例如重复的 manual_load）。 */
  step: AgentStep | null;
  /** 回传给模型的工具结果，永远是一段文本。 */
  toolResult: string;
};

/** 材料本身不参与工具执行，但传递进来以便将来加"引用原文"类工具。 */
type ExecuteContext = { input: AgentRunInput; recorder: StepRecorder };

/** 每一步的序号由它发。**每次运行一个实例**，不能做成模块级计数器。 */
type StepRecorder = {
  next: (step: Omit<AgentStep, "index" | "hint">) => AgentStep;
};

/**
 * 造一个步骤记录器。
 *
 * 为什么不用模块级变量：Next.js 服务端模块是进程级共享的。如果序号计数放在模块顶层，
 * 两个人同时点"整理"时，两条轨迹的序号会互相穿插（A 的第 2 步跳成 5）。
 * 每次运行各持一个闭包，序号天然隔离。
 */
function createStepRecorder(): StepRecorder {
  let index = 0;

  return {
    next(step) {
      index += 1;
      return {
        index,
        ...step,
        // 副标题统一从工作手册取：新增工具时只改手册一处，不会出现轨迹上漏掉说明。
        hint: getTool(step.tool)?.hint ?? null,
      };
    },
  };
}

async function executeTool(
  call: ChatToolCall,
  context: ExecuteContext,
): Promise<ToolOutcome> {
  const { recorder } = context;
  const toolName = call.function.name;
  const spec = getTool(toolName);
  const args = parseArguments(call.function.arguments);

  // 未登记、或登记为 blocked 的工具：拒绝执行，并把"被挡住"这件事记下来。
  if (!spec || spec.access === "blocked") {
    return {
      step: recorder.next({
        tool: toolName,
        label: spec?.label ?? "未登记的工具",
        kind: "boundary",
        status: "blocked",
        detail: `${toolName} 不在本次授权范围内，已拦截。写操作必须经用户确认。`,
        proposalId: null,
        payload: null,
      }),
      toolResult: `未授权：${toolName} 不在本次的工作手册授权范围内。请改用 propose_* 系列工具提交提议。`,
    };
  }

  if (!args) {
    return {
      step: recorder.next({
        tool: toolName,
        label: spec.label,
        kind: spec.access === "proposal" ? "gate" : "auto",
        status: "failed",
        detail: "这一步的参数没能解析，已跳过。",
        proposalId: null,
        payload: null,
      }),
      toolResult: `参数解析失败：${toolName} 收到的不是合法 JSON。请重新调用并确保 arguments 是合法 JSON 对象。`,
    };
  }

  if (toolName === "draft_knowledge") {
    const raw = await getSource(asString(args.rawId) ?? "");
    if (!raw || raw.archivedAt) return { step:null, toolResult:"原始记录不存在或已归档。" };
    try {
      const value = parseOrganizeDraft(String(args.draftJson ?? ""));
      if (value.content.length > 200_000 || value.title.length > 120) throw new Error("草稿过长");
      return { draft:{rawId:raw.id,value}, step:recorder.next({tool:toolName,label:spec.label,kind:"gate",status:"pending",detail:value.title,proposalId:null,payload:{rawId:raw.id}}),toolResult:"草稿已交给用户审阅；尚未创建知识页。" };
    } catch { return { step:null,toolResult:"草稿格式无效，请按 OrganizeDraft 字段重新提交。" }; }
  }
  if (toolName === "read_raw") {
    const raw = await getSource(asString(args.id) ?? "");
    return { step: recorder.next({ tool: toolName, label: spec.label, kind: "auto", status: raw ? "done" : "failed", detail: raw?.title ?? "原始记录", proposalId: null, payload: { id: args.id } }), toolResult: JSON.stringify(raw ?? { error: "NOT_FOUND" }) };
  }
  if (toolName === "propose_update") {
    const note = await getNote(asString(args.noteId) ?? "");
    if (!note || !asString(args.content) || !asString(args.reason)) return { step: null, toolResult: "缺少知识页或完整正文/理由" };
    const proposal = await createProposal({ kind: "note_update", targetNoteId: note.id, baseVersion: note.version,
      payload: { content: args.content, reason: args.reason }, reason: asString(args.reason), origin: "ai" });
    return { step: recorder.next({ tool: toolName, label: spec.label, kind: "gate", status: "pending", detail: String(args.reason), proposalId: proposal.id, payload: proposal.payload }), toolResult: JSON.stringify({ proposalId: proposal.id, status: "pending" }) };
  }

  if (toolName === "manual_load") {
    // 手册内容本来就已经逐字嵌进了系统提示词，所以这一步不重复展示。
    return {
      step: null,
      toolResult: JSON.stringify({
        manualVersion: MANUAL_VERSION,
        tools: authorizationList(),
      }),
    };
  }

  if (toolName === "search_notes") {
    const keywords = asStringArray(args.keywords);
    const hits = await searchNotes(keywords);
    const keywordText = keywords.join(" ") || "（未给出关键词）";
    const hitText =
      hits.length === 0 ? "没有命中" : `命中 ${hits.length} 条：${hits.map((h) => h.title).join("、")}`;

    return {
      step: recorder.next({
        tool: toolName,
        label: spec.label,
        kind: "auto",
        status: "done",
        detail: `关键词 ${keywordText} → ${hitText}。`,
        proposalId: null,
        payload: { keywords, hits },
      }),
      toolResult: JSON.stringify({ hits }),
    };
  }

  if (toolName === "read_note") {
    const noteId = asString(args.noteId);

    if (!noteId) {
      return {
        step: recorder.next({
          tool: toolName,
          label: spec.label,
          kind: "auto",
          status: "failed",
          detail: "没有给出要通读的知识页。",
          proposalId: null,
          payload: null,
        }),
        toolResult: "缺少 noteId。只能读取 search_notes 真实返回过的知识页 id。",
      };
    }

    const note = await getNote(noteId);

    if (!note) {
      return {
        step: recorder.next({
          tool: toolName,
          label: spec.label,
          kind: "auto",
          status: "failed",
          detail: `找不到知识页 ${noteId}，已跳过。`,
          proposalId: null,
          payload: null,
        }),
        toolResult: `找不到 id 为 ${noteId} 的知识页。不要臆造 id，请只用 search_notes 返回过的 id。`,
      };
    }

    return {
      step: recorder.next({
        tool: toolName,
        label: spec.label,
        kind: "auto",
        status: "done",
        detail: `读完《${note.title}》的正文与概念。`,
        proposalId: null,
        payload: { noteId: note.id, title: note.title },
      }),
      toolResult: JSON.stringify({
        id: note.id,
        title: note.title,
        summary: note.summary,
        content: note.content.slice(0, READ_NOTE_CHAR_LIMIT),
        concepts: note.concepts,
        keywords: note.keywords,
      }),
    };
  }

  if (toolName === "propose_link") {
    const sourceId = asString(args.sourceId);
    const targetId = asString(args.targetId);
    const reason = asString(args.reason);

    if (!sourceId || !targetId || !reason) {
      return {
        step: recorder.next({
          tool: toolName,
          label: spec.label,
          kind: "gate",
          status: "failed",
          detail: "提议缺少起始知识页、目标知识页或理由。",
          proposalId: null,
          payload: null,
        }),
        toolResult: "缺少 sourceId / targetId / reason 之一。理由必须基于双方内容。",
      };
    }

    // 先确认两端真的存在。否则会留下一条永远执行不掉的提议。
    const [source, target] = await Promise.all([getNote(sourceId), getNote(targetId)]);

    if (!source || !target) {
      return {
        step: recorder.next({
          tool: toolName,
          label: spec.label,
          kind: "gate",
          status: "failed",
          detail: "提议里的知识页不存在，已跳过。",
          proposalId: null,
          payload: null,
        }),
        toolResult: `找不到 id 为 ${source ? targetId : sourceId} 的知识页。不要臆造 id。`,
      };
    }

    const proposal = await createProposal({
      kind: "link_create",
      payload: { sourceId: source.id, targetId: target.id, reason },
      reason,
      targetNoteId: source.id,
      riskLevel: "low",
      // 主体是 agent，不是用户。origin 只由服务端代码决定（见 createProposal 的注释）。
      origin: "ai",
    });

    return {
      step: recorder.next({
        tool: toolName,
        label: spec.label,
        kind: "gate",
        status: "pending",
        detail: reason,
        proposalId: proposal.id,
        payload: {
          sourceId: source.id,
          sourceTitle: source.title,
          targetId: target.id,
          targetTitle: target.title,
          reason,
        },
      }),
      toolResult: `已生成待确认的提议（id: ${proposal.id}）。它不会立即生效，需要用户确认。`,
    };
  }

  if (toolName === "propose_source") {
    const text = asString(args.text);
    const title = asString(args.title);

    if (!text) {
      return {
        step: recorder.next({
          tool: toolName,
          label: spec.label,
          kind: "gate",
          status: "failed",
          detail: "提议没有可保存的正文。",
          proposalId: null,
          payload: null,
        }),
        toolResult: "缺少 text。原文不得改写，也不得用摘要代替。",
      };
    }

    const proposal = await createProposal({
      kind: "source_create",
      payload: { text, title },
      reason: title ? `留档：${title}` : "把材料原样留档为原始记录",
      riskLevel: "low",
      origin: "ai",
    });

    return {
      step: recorder.next({
        tool: toolName,
        label: spec.label,
        kind: "gate",
        status: "pending",
        // 这段是产品文案，不是模型输出：它解释的是产品规则，不是这次判断的理由。
        detail:
          "错题不会变成知识页——它会成为一条指向上述知识页的原始记录。确认后，「反复出错的知识点」就能被统计出来。",
        proposalId: proposal.id,
        payload: { text, title },
      }),
      toolResult: `已生成待确认的提议（id: ${proposal.id}）。它不会立即落库，需要用户确认。`,
    };
  }

  // 手册里登记过、但循环没有实现的分支。宁可显式失败，也不要静默跳过。
  return {
    step: recorder.next({
      tool: toolName,
      label: spec.label,
      kind: "boundary",
      status: "failed",
      detail: `${toolName} 还没有可执行的实现，已跳过。`,
      proposalId: null,
      payload: null,
    }),
    toolResult: `工具 ${toolName} 暂时没有实现，请改用其他工具。`,
  };
}

/**
 * 跑一次整理任务，返回可渲染的轨迹。
 *
 * 材料由服务端重新读取；模型只拿到文本，拿不到数据库。
 */
export async function runOrganizeAgent(input: AgentRunInput): Promise<AgentRunTrace> {
  const { material, contextTitle } = await loadContext(input);

  const recorder = createStepRecorder();

  const steps: AgentStep[] = [
    // 第 1 步固定是"加载工作手册"：这一步在宿主侧**真的发生了**——
    // 手册逐字嵌进了系统提示词。写在这里是为了让轨迹完整可读，
    // 而不是等模型想起来调它（模型若真调了 manual_load，executeTool 不会重复记一步）。
    recorder.next({
      tool: "manual_load",
      label: getTool("manual_load")?.label ?? "加载工作手册",
      kind: "auto",
      status: "done",
      detail: "读到本次授权的工具清单与边界：可以读、可以提议，不能直接写入知识网络。",
      proposalId: null,
      payload: { manualVersion: MANUAL_VERSION },
    }),
  ];

  const settings = resolveModelSettings(await readModelSettings()).settings;
  let draft: AgentRunTrace["draft"];
  const result = await runHarness({ settings, schema: AGENT_INSTRUCTION,
    tools: toChatToolDefinitions(), signal: input.signal,
    input: JSON.stringify({ request: input.question, conversationHistory:input.history??[], material, contextId: input.contextId, materialIsData: true }),
    execute: async (name, args) => {
      const outcome = await executeTool({ id: crypto.randomUUID(), type: "function", function: {
        name, arguments: JSON.stringify(args),
      } }, { input, recorder });
      if (outcome.step) steps.push(outcome.step);
      if (outcome.draft) draft = outcome.draft;
      return outcome.toolResult;
    },
  });
  const reply = result.message;

  const pendingProposals = steps.filter((step) => step.kind === "gate" && step.proposalId).length;

  if (pendingProposals > 0) {
    // 收尾步骤把"为什么停在这里"讲清楚——这不是失败，是设计。
    steps.push(
      recorder.next({
        tool: "boundary",
        label: "等待你的最终拍板",
        kind: "boundary",
        status: "done",
        detail: `为了保护你知识库的整洁与思考主权，整理助手不会擅自新建或改动任何知识页。上面 ${pendingProposals} 项建议因此没有自动落库，只有当你点击确认后，对应建议才会生效。`,
        proposalId: null,
        payload: null,
      }),
    );
  }

  return {
    id: `run_${Date.now().toString(36)}`,
    manualVersion: MANUAL_VERSION,
    authorization: authorizationList(),
    contextType: input.contextType,
    contextId: input.contextId ?? null,
    contextTitle,
    steps,
    counters: {
      autoCalls: steps.filter((step) => step.kind === "auto").length,
      pendingProposals,
      blockedAttempts: steps.filter((step) => step.status === "blocked").length,
      unauthorizedWrites: 0,
    },
    message: reply,
    runtime: result.runtime,
    ...(draft ? { draft } : {}),
  };
}
