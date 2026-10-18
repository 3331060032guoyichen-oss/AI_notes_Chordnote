"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import { AgentNav } from "../components/agent/agent-nav";
import { GraphView } from "../components/graph-view";
import { RawTree } from "../components/home/raw-tree";
import { useInterfaceSound } from "../components/interface-sound";
import { KnowledgeTree } from "../components/knowledge/knowledge-tree";
import { LandingPage } from "../components/landing-page";
import type { SettingsSection } from "../components/settings/sections";
import { SettingsDialog } from "../components/settings/settings-dialog";
import { AppShell } from "../components/shell/app-shell";
import { InspectorHost } from "../components/shell/inspector-host";
import { PrimaryNav } from "../components/shell/primary-nav";
import { SecondaryNav } from "../components/shell/secondary-nav";
import { SPACE_META, type Space } from "../components/shell/spaces";
import {
  AppLogo,
  IconHarp,
  IconInlink,
  IconMention,
  IconOutlink,
  IconPanelCollapse,
  IconPanelExpand,
  IconSettings,
} from "../components/ui/icons";

import { splitByTitles } from "../lib/inline-refs";
import { getPreview } from "../lib/text-preview";
import { diffLines } from "../lib/text-diff";
import type { AgentRunTrace, AgentStep } from "../types/agent";
import type { GraphEdge, GraphNode } from "../types/graph";
import type { Knowledge } from "../types/knowledge";
import type { OrganizeDraft } from "../types/organize";
import type { Proposal } from "../types/proposal";
import type { Raw } from "../types/raw";

const MAX_RAW_LENGTH = 50_000;
const MAX_RAW_TITLE_LENGTH = 120;
/**
 * 停笔多久就把这段原话收下（毫秒）。
 *
 * 2 秒是"停了一下"的尺度：连续打字时永远不会触发，不至于写到一半被切走；
 * 真停下来（写完一段、切去别的窗口）就自动收下并打开那篇笔记 —— 面板上没有
 * 「创建笔记」按钮了，这是它的替代品。
 */
const AUTO_SAVE_DELAY_MS = 2_000;

type ViewKey = "new-note" | "knowledge-index" | "agent";

type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };
type KnowledgeListPayload = { knowledges?: Knowledge[] };
type GraphPayload = { nodes?: GraphNode[]; edges?: GraphEdge[] };

type MentionItem = { kind: "raw" | "knowledge"; id: string; label: string };

type Tab =
  | { id: string; kind: "view"; viewKey: ViewKey; label: string }
  | { id: string; kind: "raw"; rawId: string; label: string }
  | { id: string; kind: "knowledge"; knowledgeId: string; label: string }
  | { id: string; kind: "draft"; rawId: string; label: string };

const viewMeta: Record<ViewKey, { label: string; shortLabel: string }> = {
  "new-note": { label: "新建笔记", shortLabel: "新建" },
  "knowledge-index": { label: "知识页", shortLabel: "知识" },
  agent: { label: "Agent 调用", shortLabel: "Agent" },
};


/**
 * 「让 agent 整理」的意图词。
 *
 * 命中这些说法、且**明确 @ 引用了材料**时，走 `/api/agent/organize` 的工具循环
 * （会真的检索、通读、生成待确认的提议，一次十几秒）；其余问法仍走单轮问答。
 * 判据刻意保守：不 @ 材料就不触发，否则一句闲聊也可能烧掉一整轮。
 */
const AGENT_INTENT = /整理|收录|归档|存档|留档|建立关联|建个关联|理一遍|梳理/;

const NEW_NOTE_TAB: Tab = { id: "view:new-note", kind: "view", viewKey: "new-note", label: "新建笔记" };
const KNOWLEDGE_INDEX_TAB: Tab = { id: "view:knowledge-index", kind: "view", viewKey: "knowledge-index", label: "知识页" };

type ContentSpace = "home" | "knowledge";

function tabSpace(tab: Tab): ContentSpace | null {
  if (tab.kind === "raw" || tab.kind === "draft") return "home";
  if (tab.kind === "knowledge") return "knowledge";
  if (tab.kind === "view" && tab.viewKey === "new-note") return "home";
  if (tab.kind === "view" && tab.viewKey === "knowledge-index") return "knowledge";
  return null;
}

function defaultTab(space: ContentSpace): Tab {
  return space === "home" ? NEW_NOTE_TAB : KNOWLEDGE_INDEX_TAB;
}

function linesToArray(value: string) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/** 图标右上角的计数角标。只有 >0 才显示 —— 一排"0"比没有角标更吵。 */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="rail-badge" aria-hidden="true">{count}</span>;
}

/**
 * 整理助手的形象 —— Chordnote 的「和弦」，长成一把**会呼吸的竖琴**。
 *
 * 产品名本来就是"和弦"：一条笔记是音符，连起来才是和弦。所以助手不用头像、
 * 也不用发光圆球（那是所有 AI 产品都在用的默认答案，看过就忘），而是一把小竖琴：
 *   - 琴颈是一道弧，顺带像一顶兜帽 —— 它既是器物，也站成一个矮矮的人；
 *   - 三根弦 = 三个音，弦长不同，合起来才是和弦；
 *   - 中弦上挂着一粒"音芯"，那是它的呼吸点。
 * 它是活的，但动静很小：
 *   - 空闲：三根弦各自慢慢摆（相位错开），音芯一起一伏；
 *   - 整理中：三根弦振得快起来，一粒火星顺着中弦往下走；
 *   - 已收录：弦几乎不动 —— 收工了；已归档：整把琴静止。
 * 全部内联 SVG + CSS，不引任何外部图片、字体或脚本；减少动效偏好下动画整体停掉。
 */
type AgentMood = "idle" | "thinking" | "settled" | "resting";

function AgentFigure({ mood, size = "row" }: { mood: AgentMood; size?: "row" | "hero" }) {
  return (
    <div className={`agent-figure is-${mood}${size === "hero" ? " is-hero" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeLinecap="round">
        {/* 共鸣箱：左边那根短的，弦都拴在它身上 */}
        <path className="agent-board" d="M24 51.5C23 42 22.4 33 22.6 26.5" strokeWidth="1.25" />
        {/* 琴颈：从共鸣箱顶端斜着挑向右上 —— 竖琴最醒目的那一道弧 */}
        <path className="agent-neck" d="M22.6 26.5C27.5 22.5 38 17.5 46 16.5" strokeWidth="1.4" />
        {/* 支柱：右边一竖，把琴颈撑住 */}
        <path className="agent-pillar" d="M46 16.5V51.5" strokeWidth="1.25" />
        {/* 底座 */}
        <path className="agent-bridge" d="M24 51.5h22" strokeWidth="1.4" />
        {/* 三根弦：越靠右越长，所以是三个不同的音；合起来才是和弦 */}
        <path className="agent-string agent-string-a" d="M28.6 24.2 25.2 44" strokeWidth="1.05" />
        <path className="agent-string agent-string-b" d="M35 20.6 25.7 48" strokeWidth="1.3" />
        <path className="agent-string agent-string-c" d="M41.4 18.4 26.2 51" strokeWidth="1.05" />
        {/* 音芯：挂在中弦上的那一粒呼吸点 */}
        <circle className="agent-core" cx="33.4" cy="24.6" r="1.7" stroke="none" fill="currentColor" />
        {/* 整理中顺着中弦往下走的火星 */}
        <circle className="agent-spark" cx="33.4" cy="24.6" r="1.5" stroke="none" fill="currentColor" />
      </svg>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warning" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state-block"><span className="empty-index" aria-hidden="true">01</span><div><h3>{title}</h3><p>{body}</p>{action ? <div className="empty-action">{action}</div> : null}</div></div>;
}

const LANDING_KEY = "chordnote:entered";

export default function Home() {
  const { play } = useInterfaceSound();
  /** null = 还没读到 localStorage；避免老用户每次刷新先闪一下落地页。 */
  const [entered, setEntered] = useState<boolean | null>(null);
  const [activeSpace, setActiveSpace] = useState<Space>("home");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("models");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openTabs, setOpenTabs] = useState<Tab[]>([NEW_NOTE_TAB, KNOWLEDGE_INDEX_TAB]);
  const [activeTabId, setActiveTabId] = useState(NEW_NOTE_TAB.id);
  const [text, setText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [raws, setRaws] = useState<Raw[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
  /** 已归档的知识页。归档不是删除，所以必须有一条读回来的路径。 */
  const [archivedNotes, setArchivedNotes] = useState<Knowledge[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedRawId, setSelectedRawId] = useState<string | null>(null);
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [draft, setDraft] = useState<OrganizeDraft | null>(null);
  const [draftRawId, setDraftRawId] = useState<string | null>(null);
  const [selectedRelationIds, setSelectedRelationIds] = useState<string[]>([]);
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [aiMessage, setAiMessage] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  /** 当前知识页上待确认的改写提议（`note_update`）。只活在界面上，真正的待办状态在库里。 */
  const [noteRevision, setNoteRevision] = useState<Proposal | null>(null);
  const [isProposingRevision, setIsProposingRevision] = useState(false);
  const [isResolvingRevision, setIsResolvingRevision] = useState(false);
  /** 正文里当前被悬停（或聚焦）的知识点标记，用来决定浮动卡显示哪一个。 */
  const [activeInlineRef, setActiveInlineRef] = useState<string | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTarget, setMentionTarget] = useState<MentionItem | null>(null);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [rawsExpanded, setRawsExpanded] = useState(true);
  const [, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRaw, setIsSavingRaw] = useState(false);
  const [organizingRawId, setOrganizingRawId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /**
   * 侧栏默认**展开**：进来先看见目录（原始记录 / 笔记各几条），要专心写作时再收起。
   * 收起时列宽由 `.app-shell.sidebar-collapsed` 真正收掉（56px 图标条），不是只藏内容。
   */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  /** 右栏（上下文面板）在 ≤860px 放不下，改为可开合的抽屉；这里记它的开合状态。 */
  const [railOpen, setRailOpen] = useState(false);
  /**
   * 宽屏下右栏是常驻列，默认展开；`railHidden` 记它是不是被收起来了。
   *
   * 两个状态而不是一个：窄屏抽屉与宽屏常驻列的可见性由不同规则决定，
   * 一个布尔量表达不了。顶栏与底部导航那颗「上下文」按钮同时翻转两者，
   * 于是两个断点下都是"按一下开、再按一下关"。
   *
   * 初始为收起：Home 的新建页不显示右栏，打开原始记录时再展开整理助手。
   * 进入 Knowledge / Agent 时默认展开（见 openSpace / openTab），
   * 之后由顶栏那颗「上下文」或右栏的 × 决定开合，切换标签不重置。
   */
  const [railHidden, setRailHidden] = useState(true);
  const [graphParams, setGraphParams] = useState({
    nodeSize: 1.0,
    lineWidth: 1.0,
    centerForce: 0.5,
    repelForce: 330,
    linkForce: 0.5,
    linkDist: 104,
  });
  const [graphSearch, setGraphSearch] = useState("");
  const [showOrphans, setShowOrphans] = useState(true);
  const [showArrows, setShowArrows] = useState(false);
  /** 被固定在落点的节点数量（拖动即固定），由 GraphView 回调上来供右栏显示。 */
  const [graphPinnedCount, setGraphPinnedCount] = useState(0);
  /** 自增一次 = 让图谱放开所有固定、回到自动布局。 */
  const [graphResetSignal, setGraphResetSignal] = useState(0);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  /** 最近一次 agent 整理的轨迹。只活在这个会话里——刷新即清，与"轨迹不落库"的约定一致。 */
  const [agentTrace, setAgentTrace] = useState<AgentRunTrace | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  /** 上一次的请求体，「重置并重放」用它重跑一次（真的会再调一次模型）。 */
  const [agentRequest, setAgentRequest] = useState<Record<string, unknown> | null>(null);
  /** 每个提议门禁的本地状态：待定 / 已建立 / 已忽略。 */
  const [gateStates, setGateStates] = useState<Record<string, "pending" | "accepted" | "ignored">>({});
  /** 自增一次就重新拉原始记录与知识页列表（确认提议后左栏需要跟上）。 */
  const [listRefresh, setListRefresh] = useState(0);
  const [contextMenu, setContextMenu] = useState<
    | { type: "raw"; raw: Raw; x: number; y: number }
    | { type: "knowledge-title"; knowledge: Knowledge; x: number; y: number }
    | null
  >(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingField, setEditingField] = useState<{ knowledgeId: string; field: "summary" | "content" | "concepts" } | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  /** 正在改写的原始记录 id 与草稿。Raw 允许用户改，所以这里没有走提议流程。 */
  const [editingRawId, setEditingRawId] = useState<string | null>(null);
  const [rawTextDraft, setRawTextDraft] = useState("");

  useEffect(() => {
    let hasEntered = false;
    try {
      hasEntered = window.localStorage.getItem(LANDING_KEY) === "1";
    } catch {
      /* 隐私模式下读不到：按首次进入处理 */
    }
    setEntered(hasEntered);
  }, []);

  /** 主题在 Settings 之外也要生效：空间卸载后 `<html data-studio>` 已经写在 DOM 上，但启动时需要恢复一次。 */
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("chordnote:studio");
      if (saved && ["darkroom", "editorial", "tactile"].includes(saved)) {
        document.documentElement.setAttribute("data-studio", saved);
      }
    } catch {
      /* 读不到就保持默认主题 */
    }
  }, []);

  useEffect(() => {
    let active = true;

    async function loadPageData() {
      try {
        const [rawResponse, knowledgeResponse] = await Promise.all([
          fetch("/api/raw"),
          fetch("/api/knowledge"),
        ]);
        const rawPayload = (await rawResponse.json()) as { raws?: Raw[] };
        const knowledgePayload = (await knowledgeResponse.json()) as KnowledgeListPayload;

        if (!rawResponse.ok || !knowledgeResponse.ok) throw new Error("读取失败");
        if (!active) return;

        const nextRaws = rawPayload.raws ?? [];
        setRaws(nextRaws);
        setKnowledges(knowledgePayload.knowledges ?? []);
        setSelectedRawId((current) => current ?? nextRaws[0]?.id ?? null);
      } catch {
        if (active) setError("内容暂时没有载入。你的本地记录没有受到影响，请稍后重试。");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPageData();
    return () => { active = false; };
  }, [listRefresh]);

  useEffect(() => {
    let active = true;

    async function loadGraph() {
      try {
        const response = await fetch("/api/graph");
        const payload = (await response.json()) as GraphPayload;
        if (!response.ok) throw new Error("知识网络读取失败");
        if (active) setGraph({ nodes: payload.nodes ?? [], edges: payload.edges ?? [] });
      } catch {
        if (active) setError("知识网络暂时没有载入。已收录的内容仍然安全，请稍后重试。");
      }
    }

    void loadGraph();
    return () => { active = false; };
  }, [graphRefresh]);

  useEffect(() => {
    if (!contextMenu) return;
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener("click", closeContextMenu);
    window.addEventListener("blur", closeContextMenu);
    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("blur", closeContextMenu);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!railOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRailOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [railOpen]);

  /** 读已归档的知识页。跟着 listRefresh 走，归档/恢复后右栏与左栏同步。 */
  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const response = await fetch("/api/knowledge?scope=archived");
        const payload = (await response.json()) as { knowledges?: Knowledge[] };
        if (active) setArchivedNotes(payload.knowledges ?? []);
      } catch {
        if (active) setArchivedNotes([]);
      }
    })();

    return () => {
      active = false;
    };
  }, [listRefresh]);

  /**
   * 打开一张知识页时，把它的待确认改写提议取回来。   *
   * 待办状态本来就存在库里（`proposals.status = 'pending'`），所以刷新页面后
   * Diff 预览卡还在 —— 它不是前端的临时状态，而是"这件事还等你决定"。
   */
  useEffect(() => {
    const tab = openTabs.find((item) => item.id === activeTabId);

    if (!tab || tab.kind !== "knowledge") {
      setNoteRevision(null);
      return;
    }

    let active = true;

    void (async () => {
      try {
        const response = await fetch(
          `/api/proposals?status=pending&targetNoteId=${encodeURIComponent(tab.knowledgeId)}`,
        );
        const payload = (await response.json()) as { proposals?: Proposal[] };
        if (!active) return;
        setNoteRevision(
          (payload.proposals ?? []).find((item) => item.kind === "note_update") ?? null,
        );
      } catch {
        if (active) setNoteRevision(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [activeTabId, openTabs, listRefresh]);

  const selectedRaw = raws.find((raw) => raw.id === selectedRawId) ?? raws[0] ?? null;

  /**
   * 目录里那条原始记录叫什么。
   *
   * 没起名字的按**创建顺序**编号（未命名 1、未命名 2…）：不然目录里显示的是正文前几个字，
   * 一堆「课堂笔记、阅读摘录…」开头的条目分不清谁是谁。编号只在这里算，
   * `raw.title` 仍然是空的 —— 它确实还没有名字。
   */
  const unnamedNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    // 列表按创建时间倒序，翻过来才是"第一个没名字的" = 未命名 1
    [...raws].reverse().forEach((raw) => {
      if (!raw.title?.trim()) numbers.set(raw.id, numbers.size + 1);
    });
    return numbers;
  }, [raws]);

  const rawLabel = (raw: Raw) => raw.title?.trim() || `未命名 ${unnamedNumbers.get(raw.id) ?? 1}`;

  /**
   * 当前知识页的 入链 / 出链 / 未链接提及。
   *
   * 右栏那三块与右边缘那条图标条**共用这一份**：两处各算一遍，迟早会出现
   * "图标上写着 2、点开只有 1"。非知识页时是 null（那几个图标就不显示）。
   */
  const railContext = useMemo(() => {
    // 这里不用 activeTab：它声明在下面（靠近 return），在这里引用会被 TS 判成"用得太早"。
    // 直接从 openTabs + activeTabId 取同一个东西，语义不变。
    const tab = openTabs.find((item) => item.id === activeTabId);
    const detail = tab?.kind === "knowledge"
      ? knowledges.find((item) => item.id === tab.knowledgeId)
      : undefined;
    if (!detail) return null;

    const inlinks = graph.edges.filter((edge) => edge.target === detail.id);
    const outlinks = graph.edges.filter((edge) => edge.source === detail.id);
    const linkedIds = new Set([
      ...inlinks.map((edge) => edge.source),
      ...outlinks.map((edge) => edge.target),
    ]);
    const mentions = knowledges.filter(
      (item) =>
        item.id !== detail.id &&
        !linkedIds.has(item.id) &&
        item.title &&
        detail.content.includes(item.title),
    );

    return { detail, inlinks, outlinks, mentions };
  }, [openTabs, activeTabId, knowledges, graph.edges]);

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const items: MentionItem[] = [
      // 用户给原始记录起过名字时优先用名字：不然按自己写的「错题」去找会搜不到，
      // 因为正文预览里根本没有这两个字。
      ...raws.map((r) => ({ kind: "raw" as const, id: r.id, label: getPreview(rawLabel(r), 24) })),
      ...knowledges.map((k) => ({ kind: "knowledge" as const, id: k.id, label: k.title })),
    ];
    return (q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items).slice(0, 8);
  }, [mentionQuery, raws, knowledges]);

  const nodeTitleById = useMemo(() => {
    const map = new Map<string, string>();
    graph.nodes.forEach((node) => map.set(node.id, node.title));
    knowledges.forEach((knowledge) => {
      if (!map.has(knowledge.id)) map.set(knowledge.id, knowledge.title);
    });
    return map;
  }, [graph.nodes, knowledges]);

  // 搜索 + 孤立节点开关，在传给图谱前过滤（客户端即可，不涉及后端）
  const filteredGraph = useMemo(() => {
    const query = graphSearch.trim().toLowerCase();
    let nodes = graph.nodes;
    if (query) nodes = nodes.filter((node) => node.title.toLowerCase().includes(query));
    if (!showOrphans) {
      const linked = new Set<string>();
      graph.edges.forEach((edge) => { linked.add(edge.source); linked.add(edge.target); });
      nodes = nodes.filter((node) => linked.has(node.id));
    }
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { nodes, edges };
  }, [graph.nodes, graph.edges, graphSearch, showOrphans]);

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  /** 顶栏 / 底部导航的「上下文」按钮：窄屏开合抽屉，宽屏显示或收起右栏。 */
  function toggleRail() {
    setRailOpen((current) => !current);
    setRailHidden((current) => !current);
  }

  /** 右栏自己的收起按钮：两种断点下都是"把它收掉"这一个意思。 */
  function hideRail() {
    setRailOpen(false);
    setRailHidden(true);
  }

  /**
   * 点右边缘图标条：先展开面板，再滚到对应的那一块。
   *
   * 先等一帧：面板是刚渲染出来的，元素还不存在，scrollIntoView 会落空。
   */
  function openRailAt(blockId: string) {
    setRailHidden(false);
    setRailOpen(true);
    window.setTimeout(() => {
      document.getElementById(blockId)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 90);
  }

  /**
   * 切换一级空间。
   *
   * Home 保留原始记录相关标签，Knowledge 保留知识页与图谱标签。
   * 两边使用同一套标签组件，但不会把另一空间的内容带进来。
   */
  function openSpace(space: Space) {
    if (space === "settings") {
      setSettingsOpen(true);
      setMobileNavOpen(false);
      setRailOpen(false);
      clearFeedback();
      return;
    }

    let nextTab: Tab | null = null;
    if (space === "home" || space === "knowledge") {
      const current = openTabs.find((tab) => tab.id === activeTabId);
      nextTab = current && tabSpace(current) === space
        ? current
        : [...openTabs].reverse().find((tab) => tabSpace(tab) === space) ?? defaultTab(space);

      setOpenTabs((tabs) => tabs.some((tab) => tab.id === nextTab?.id) ? tabs : [...tabs, nextTab as Tab]);
      setActiveTabId(nextTab.id);
    }

    const nextHasInspector =
      space === "agent" ||
      space === "graph" ||
      space === "knowledge" ||
      (space === "home" && nextTab?.kind === "raw");

    if (!nextHasInspector) {
      setRailOpen(false);
      setRailHidden(true);
    } else if (space !== activeSpace) {
      /*
       * 进入 Knowledge / Graph / Agent：右栏默认展开。
       * 只改宽屏常驻列（railHidden），不碰窄屏抽屉（railOpen）——
       * ≤860px 上强行拉开抽屉会盖住正文，那里仍然由「上下文」按钮开合。
       */
      setRailHidden(false);
    }

    setActiveSpace(space);
    setMobileNavOpen(false);
    setRailOpen(false);
    clearFeedback();
  }

  function openTab(tab: Tab) {
    const owner = tabSpace(tab);
    if (!owner) return;

    const hasInspector = owner === "knowledge" || tab.kind === "raw";
    setRailHidden(!hasInspector);
    setActiveSpace(owner);
    setOpenTabs((current) => current.some((item) => item.id === tab.id) ? current : [...current, tab]);
    setActiveTabId(tab.id);
    setMobileNavOpen(false);
    // 打开任何标签都收起上下文抽屉，否则窄屏上刚打开的内容会被它盖住。
    setRailOpen(false);
    clearFeedback();
  }

  function closeTab(id: string) {
    setOpenTabs((current) => {
      const closing = current.find((tab) => tab.id === id);
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabId === id) {
        const owner = closing ? tabSpace(closing) : null;
        const sameSpace = owner ? next.filter((tab) => tabSpace(tab) === owner) : next;
        const fallback = sameSpace.at(-1) ?? (owner ? defaultTab(owner) : NEW_NOTE_TAB);
        if (!next.some((tab) => tab.id === fallback.id)) next.push(fallback);
        setActiveTabId(fallback.id);
      }
      return next.length > 0 ? next : [NEW_NOTE_TAB, KNOWLEDGE_INDEX_TAB];
    });
  }

  function navigate(view: ViewKey) {
    if (view === "agent") {
      openSpace("agent");
      return;
    }

    openTab({ id: `view:${view}`, kind: "view", viewKey: view, label: viewMeta[view].label });
  }

  function openRawTab(raw: Raw) {
    setSelectedRawId(raw.id);
    // 标签名与左栏用同一个口径：没起名字的显示「未命名 N」，而不是正文前几个字
    openTab({ id: `raw:${raw.id}`, kind: "raw", rawId: raw.id, label: getPreview(rawLabel(raw), 18) });
  }

  function openKnowledgeTab(knowledge: Knowledge) {
    setSelectedKnowledge(knowledge);
    openTab({ id: `knowledge:${knowledge.id}`, kind: "knowledge", knowledgeId: knowledge.id, label: getPreview(knowledge.title, 18) });
  }

  function openDraftTab(rawId: string) {
    openTab({ id: `draft:${rawId}`, kind: "draft", rawId, label: "审阅整理稿" });
  }

  /**
   * 把当前输入收下：新建原始记录 + 收录成知识页，然后打开那篇笔记。
   *
   * 两个入口共用这一段 —— 表单提交（在笔记名里按回车）与停笔后的自动保存，
   * 走的路径完全一样，所以"自动"与"手点"的结果不会有第二种行为。
   */
  async function submitNote() {
    clearFeedback();
    if (!text.trim()) {
      setError("先写下一段原话，再把它留下。");
      return;
    }

    setIsSaving(true);
    try {
      /**
       * 只写**原始记录**，不碰知识页。
       *
       * 知识页必须由「整理助手提议 → 用户确认」产生（AGENTS.md「核心链路」）。
       * 这里以前走的是 `/api/notes`，它会顺手把这一页直接塞进「笔记」栏 ——
       * 等于把整条链路里最重要的那一下"拍板"绕过去了。那条路径已下线。
       */
      const response = await fetch("/api/raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title: noteTitle.trim() || null }),
      });
      const payload = (await response.json()) as { raw?: Raw; error?: { message?: string } };
      if (!response.ok || !payload.raw) throw new Error(payload.error?.message ?? "这条原话暂时没有留下。请稍后重试。");

      const created = payload.raw;
      setRaws((current) => [created, ...current]);
      setSelectedRawId(created.id);
      setText("");
      setNoteTitle("");
      openRawTab(created);
      setNotice("已收进「原始记录」。要让它成为知识页，点右侧「提出整理稿」——整理助手先提一版，你点头才入库。");
      play("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "这条笔记暂时没有保存。内容仍在输入框中，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submitNote();
  }

  /**
   * 停笔就收下 —— 「新建笔记」面板上没有创建按钮了。
   *
   * 只在停在这一页时才计时：切去别的标签页就不该在背后偷偷建东西，
   * 回来接着写会重新计时。用 ref 取最新的 submitNote，避免把函数写进依赖里
   * 导致计时器被无关渲染反复重置。
   */
  const submitNoteRef = useRef<() => void>(() => {});
  useEffect(() => {
    submitNoteRef.current = () => {
      void submitNote();
    };
  });
  useEffect(() => {
    const current = openTabs.find((tab) => tab.id === activeTabId);
    const onNewNoteView = current?.kind === "view" && current.viewKey === "new-note";
    if (!onNewNoteView || !text.trim() || isSaving) return;

    const timer = window.setTimeout(() => submitNoteRef.current(), AUTO_SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [openTabs, activeTabId, text, noteTitle, isSaving]);

  async function handleDeleteRaw(raw: Raw) {
    setContextMenu(null);
    if (!window.confirm(`确定移除这条原始记录吗？\n\n${getPreview(raw.text, 100)}`)) return;

    clearFeedback();
    try {
      const response = await fetch("/api/raw", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId: raw.id }),
      });
      const payload = (await response.json()) as { deleted?: Raw; error?: { message?: string } };
      if (!response.ok || !payload.deleted) throw new Error(payload.error?.message ?? "这条原始记录暂时无法移除。请稍后重试。");
      setRaws((current) => current.filter((item) => item.id !== raw.id));
      setSelectedRawId((current) => current === raw.id ? null : current);
      setNotice("这条原始记录已移除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "这条原始记录暂时无法移除。其他内容没有受到影响，请稍后重试。");
    }
  }

  /**
   * 改写原始记录的正文。
   *
   * Raw 是「用户可改、AI 不可改」的对象，所以这条路径不需要提议、也不需要自审批；
   * 服务端会在同一事务里写一条审计修订记录。内容没变化时不写库（响应 `changed: false`）。
   */
  async function handleUpdateRaw(raw: Raw) {
    const nextText = rawTextDraft.trim();
    if (!nextText || nextText === raw.text) {
      setEditingRawId(null);
      return;
    }

    clearFeedback();
    setIsSavingRaw(true);
    try {
      const response = await fetch(`/api/raw/${raw.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: nextText }),
      });
      const payload = (await response.json()) as { raw?: Raw; changed?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.raw) throw new Error(payload.error?.message ?? "这次修订暂时没有保存。请稍后重试。");

      const updated = payload.raw;
      setRaws((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingRawId(null);
      setNotice(payload.changed ? "原话已修订，并留下了修订记录。" : "内容和原来一样，没有写入修订记录。");
      play("success");
    } catch (updateRawError) {
      setError(updateRawError instanceof Error ? updateRawError.message : "这次修订暂时没有保存。原有内容没有改变，请稍后重试。");
    } finally {
      setIsSavingRaw(false);
    }
  }

  async function handleOrganize(rawId: string) {
    clearFeedback();
    setSelectedRawId(rawId);
    setDraft(null);
    setDraftRawId(rawId);
    setSelectedRelationIds([]);
    setOrganizingRawId(rawId);

    try {
      const response = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId }),
      });
      const payload = (await response.json()) as { draft?: OrganizeDraft; error?: { message?: string } };
      if (!response.ok || !payload.draft) throw new Error(payload.error?.message ?? "整理稿暂时没有提出。原始记录仍然安全，请稍后重试。");
      setDraft(payload.draft);
      setAiMessage("整理稿已经提出。请逐项审阅，再决定是否收录。");
      setNotice("整理稿已经提出。它仍是一份提议，审阅后再决定是否收录。");
      play("success");
      openDraftTab(rawId);
    } catch (organizeError) {
      setDraftRawId(null);
      setError(organizeError instanceof Error ? organizeError.message : "整理稿暂时没有提出。原始记录仍然安全，请稍后重试。");
    } finally {
      setOrganizingRawId(null);
    }
  }

  async function handleConfirm() {
    if (!draft || !draftRawId) return;
    clearFeedback();
    setIsConfirming(true);

    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId: draftRawId, draft }),
      });
      const payload = (await response.json()) as { knowledge?: Knowledge; created?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.knowledge) throw new Error(payload.error?.message ?? "整理稿暂时无法收录。它仍保留在当前页面，请稍后重试。");

      for (const suggestion of draft.relatedKnowledge) {
        if (!selectedRelationIds.includes(suggestion.knowledgeId)) continue;
        const relationResponse = await fetch("/api/relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: payload.knowledge.id, targetId: suggestion.knowledgeId, type: "related", reason: suggestion.reason }),
        });
        const relationPayload = (await relationResponse.json()) as { error?: { message?: string } };
        if (!relationResponse.ok) throw new Error(relationPayload.error?.message ?? "知识页已收录，但交叉引用暂时没有保存。请稍后重试。");
      }

      if (draftRawId) closeTab(`draft:${draftRawId}`);
      if (payload.created) {
        setKnowledges((current) => [payload.knowledge!, ...current]);
        setNotice("整理稿已确认并收录为知识页。你可以继续修订，或查看它的交叉引用。");
        openKnowledgeTab(payload.knowledge);
      } else {
        setNotice("这条原始记录已经收录，没有重复创建知识页。");
      }
      setDraft(null);
      setDraftRawId(null);
      setSelectedRelationIds([]);
      setGraphRefresh((current) => current + 1);
      play("success");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "整理稿暂时无法收录。原始记录仍然安全，请稍后重试。");
    } finally {
      setIsConfirming(false);
    }
  }

  /**
   * 请编辑助理针对当前知识页起草一份改写提议。
   *
   * 它**不改正文**：服务端把结果落成一条 `status = 'pending'` 的 `note_update` 提议，
   * 正文要等用户在正文底部的 Diff 卡上确认才会变。这就是产品主张里那句
   * 「AI 提议、你确认」的具体形态。
   */
  async function handleProposeRevision(knowledgeId: string, question: string) {
    const detail = knowledges.find((item) => item.id === knowledgeId);
    if (!detail) return;

    const prompt = question.trim() || "在保持原意的前提下，把这张知识页的正文补充得更完整一些。";

    clearFeedback();
    setIsProposingRevision(true);
    try {
      const response = await fetch("/api/assistant/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledgeId, question: prompt }),
      });
      const payload = (await response.json()) as {
        proposal?: Proposal;
        error?: { message?: string };
      };

      if (!response.ok || !payload.proposal) {
        throw new Error(payload.error?.message ?? "改写提议暂时没有生成。你的正文没有改变，请稍后重试。");
      }

      setNoteRevision(payload.proposal);
      setAiQuestion("");
      setMentionTarget(null);
      setNotice("编辑助理已生成改写提议。请拉到正文底部确认或忽略。");
      play("success");
    } catch (proposeError) {
      setError(proposeError instanceof Error ? proposeError.message : "改写提议暂时没有生成。你的正文没有改变，请稍后重试。");
    } finally {
      setIsProposingRevision(false);
    }
  }

  /**
   * 确认写入。两步都走既有接口：先 approve 再 apply。
   *
   * 服务端在事务里比对提议生成时记下的版本，若这一页中途被改过，提议会判为过期
   * （`approved → stale`）而不是覆盖掉用户的手改。
   */
  async function handleApplyRevision(proposal: Proposal) {
    clearFeedback();
    setIsResolvingRevision(true);
    try {
      const approved = await fetch(`/api/proposals/${proposal.id}/approve`, { method: "POST" });
      const approvedPayload = (await approved.json()) as { error?: { message?: string } };
      if (!approved.ok) {
        throw new Error(approvedPayload.error?.message ?? "这条提议暂时无法确认。请稍后重试。");
      }

      const applied = await fetch(`/api/proposals/${proposal.id}/apply`, {
        method: "POST",
        // 与 proposals.status 的检查构成双保险，重复点也不会写两次
        headers: { "Idempotency-Key": `${proposal.id}-apply` },
      });
      const appliedPayload = (await applied.json()) as {
        effect?: { version?: number };
        error?: { message?: string };
      };
      if (!applied.ok) {
        throw new Error(appliedPayload.error?.message ?? "改写暂时没有写入。你的正文没有改变，请稍后重试。");
      }

      setNoteRevision(null);
      // 重新拉列表：正文、版本号、修订时间都要跟着更新
      setListRefresh((current) => current + 1);
      setNotice(
        typeof appliedPayload.effect?.version === "number"
          ? `已写入正文（第 ${appliedPayload.effect.version} 版），这次改动留下了修订记录。`
          : "已写入正文，这次改动留下了修订记录。",
      );
      play("success");
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "改写暂时没有写入。你的正文没有改变，请稍后重试。");
    } finally {
      setIsResolvingRevision(false);
    }
  }

  /** 忽略提议。正文一个字都不动，提议本身留档为 rejected。 */
  async function handleIgnoreRevision(proposal: Proposal) {
    clearFeedback();
    setIsResolvingRevision(true);
    try {
      const response = await fetch(`/api/proposals/${proposal.id}/reject`, { method: "POST" });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) {
        throw new Error(payload.error?.message ?? "这条提议暂时无法忽略。请稍后重试。");
      }

      setNoteRevision(null);
      setNotice("已忽略这次改写提议，正文没有改变。");
    } catch (ignoreError) {
      setError(ignoreError instanceof Error ? ignoreError.message : "这条提议暂时无法忽略。请稍后重试。");
    } finally {
      setIsResolvingRevision(false);
    }
  }

  /** 归档 / 恢复一张知识页。归档不删数据，只是让它从日常列表里退场。 */
  async function handleArchiveNote(knowledge: Knowledge, archived: boolean) {
    clearFeedback();
    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      const payload = (await response.json()) as { knowledge?: Knowledge; error?: { message?: string } };
      if (!response.ok || !payload.knowledge) {
        throw new Error(payload.error?.message ?? "归档状态暂时没有保存。原有知识页没有改变。");
      }

      const updated = payload.knowledge;

      if (archived) {
        setKnowledges((current) => current.filter((item) => item.id !== knowledge.id));
        setArchivedNotes((current) => [updated, ...current.filter((item) => item.id !== knowledge.id)]);
        setNotice("已归档。它不再出现在 Knowledge，需要时可从 Settings 的「归档」恢复。");
      } else {
        setArchivedNotes((current) => current.filter((item) => item.id !== knowledge.id));
        setKnowledges((current) => [updated, ...current.filter((item) => item.id !== knowledge.id)]);
        setNotice("已恢复，重新回到 Knowledge 的知识页列表。");
      }

      setListRefresh((current) => current + 1);
      play("success");
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "归档状态暂时没有保存。原有知识页没有改变。");
    }
  }

  async function handleCreateLink(sourceId: string, targetId: string) {
    clearFeedback();
    setLinkingId(targetId);
    try {
      const response = await fetch("/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId, targetId, type: "related", reason: "从正文提及建立关联" }),
      });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "关联没有保存。请稍后重试。");
      setGraphRefresh((current) => current + 1);
      setNotice("已建立关联。知识网络里现在多了一条连线。");
      play("success");
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "关联没有保存。请稍后重试。");
    } finally {
      setLinkingId(null);
    }
  }

  async function handleUpdateKnowledge(id: string, patch: Partial<Pick<Knowledge, "title" | "summary" | "content" | "concepts">>) {
    try {
      const response = await fetch(`/api/knowledge/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const payload = (await response.json()) as { knowledge?: Knowledge; error?: { message?: string } };
      if (!response.ok || !payload.knowledge) throw new Error(payload.error?.message ?? "这次修订暂时没有保存。请稍后重试。");
      const updated = payload.knowledge;
      setKnowledges((current) => current.map((item) => item.id === id ? updated : item));
      if (patch.title) {
        setOpenTabs((current) => current.map((tab) => tab.id === `knowledge:${id}` ? { ...tab, label: getPreview(updated.title, 18) } : tab));
      }
      setNotice("修订已保存。");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "这次修订暂时没有保存。原有知识页没有改变，请稍后重试。");
    } finally {
      setEditingTitleId(null);
      setEditingField(null);
    }
  }

  async function handleGraphNodeClick(nodeId: string) {
    clearFeedback();
    try {
      const response = await fetch(`/api/knowledge/${nodeId}`);
      const payload = (await response.json()) as { knowledge?: Knowledge };
      if (!response.ok || !payload.knowledge) throw new Error("读取失败");
      openKnowledgeTab(payload.knowledge);
    } catch {
      setError("这张知识页暂时没有载入。已收录的内容仍然安全，请稍后重试。");
    }
  }

  /**
   * 跑一次 agent 整理，把轨迹放进状态并切到 Agent 标签。
   *
   * 抽成独立函数是为了让「重置并重放」能复用同一段逻辑——
   * 轨迹不落库，所以"重放"就是重跑一次（会真的再调一次模型）。
   */
  async function runAgentOrganize(body: Record<string, unknown>) {
    setIsAgentRunning(true);
    setAiMessage("");

    try {
      const response = await fetch("/api/agent/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        trace?: AgentRunTrace;
        error?: { message?: string };
      };

      if (!response.ok || !payload.trace) {
        throw new Error(payload.error?.message ?? "这次整理暂时没有完成。你的内容仍然安全，请稍后重试。");
      }

      setAgentTrace(payload.trace);
      setAgentRequest(body);
      setGateStates({});
      setAiQuestion("");
      navigate("agent");
    } catch (agentError) {
      setAiMessage(
        agentError instanceof Error
          ? agentError.message
          : "这次整理暂时没有完成。你的内容仍然安全，请稍后重试。",
      );
    } finally {
      setIsAgentRunning(false);
    }
  }

  /** 确认一条提议：先批准、再执行。两步都是用户主体发起的写入。 */
  async function handleGateAccept(step: AgentStep) {
    const proposalId = step.proposalId;

    if (!proposalId) return;

    setGateStates((current) => ({ ...current, [proposalId]: "accepted" }));

    try {
      const approved = await fetch(`/api/proposals/${proposalId}/approve`, { method: "POST" });

      if (!approved.ok) {
        const payload = (await approved.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "这条提议暂时无法批准。");
      }

      const applied = await fetch(`/api/proposals/${proposalId}/apply`, {
        method: "POST",
        // 与 proposals.status 的状态检查构成双保险，重复点也不会执行两次
        headers: { "Idempotency-Key": `${proposalId}-apply` },
      });

      if (!applied.ok) {
        const payload = (await applied.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "这条提议暂时无法执行。");
      }

      setNotice(step.tool === "propose_link" ? "关联已建立，知识网络已更新。" : "已存为原始记录。");
      // 目标是知识网络/原始记录，两个列表都刷新一次让左栏与图谱跟上
      setGraphRefresh((current) => current + 1);
      setListRefresh((current) => current + 1);
    } catch (gateError) {
      setGateStates((current) => ({ ...current, [proposalId]: "pending" }));
      setError(gateError instanceof Error ? gateError.message : "这条提议暂时无法执行。");
    }
  }

  async function handleGateIgnore(step: AgentStep) {
    const proposalId = step.proposalId;

    if (!proposalId) return;

    setGateStates((current) => ({ ...current, [proposalId]: "ignored" }));

    try {
      const response = await fetch(`/api/proposals/${proposalId}/reject`, { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "这条提议暂时无法忽略。");
      }
    } catch (gateError) {
      setGateStates((current) => ({ ...current, [proposalId]: "pending" }));
      setError(gateError instanceof Error ? gateError.message : "这条提议暂时无法忽略。");
    }
  }

  async function handleAskAssistant(question: string) {
    if (!question.trim()) {
      setAiMessage("先写下问题，我会依据你选择的材料提出看法。");
      return;
    }

    setIsAsking(true);
    setAiMessage("");

    const body = mentionTarget
      ? { question, contextType: mentionTarget.kind, contextId: mentionTarget.id }
      : selectedKnowledge
        ? { question, contextType: "knowledge" as const, contextId: selectedKnowledge.id }
        : draft
          ? { question, contextType: "draft" as const, draftContext: `${draft.title}\n\n${draft.summary}\n\n${draft.content}` }
          : selectedRaw
            ? { question, contextType: "raw" as const, contextId: selectedRaw.id }
            : { question, contextType: "none" as const };

    const shouldRunAgent = mentionTarget !== null && AGENT_INTENT.test(question);

    setMentionTarget(null);

    // 「@ 一条原始记录 + 让它整理」走 agent 循环：真的检索、通读，然后生成待确认的提议。
    // 其余问法仍然走单轮问答——不该为了一个功能把每次对话都变慢变贵。
    if (shouldRunAgent) {
      setIsAsking(false);
      setIsAgentRunning(true);
      setAiMessage("");

      try {
        const response = await fetch("/api/agent/organize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = (await response.json()) as {
          trace?: AgentRunTrace;
          error?: { message?: string };
        };

        if (!response.ok || !payload.trace) {
          throw new Error(payload.error?.message ?? "这次整理暂时没有完成。你的内容仍然安全，请稍后重试。");
        }

        setAgentTrace(payload.trace);
        setAiQuestion("");
        // 轨迹在主区展示：切过去，右栏只留着"已经跑完了"的线索
        navigate("agent");
      } catch (agentError) {
        setAiMessage(
          agentError instanceof Error
            ? agentError.message
            : "这次整理暂时没有完成。你的内容仍然安全，请稍后重试。",
        );
      } finally {
        setIsAgentRunning(false);
      }

      return;
    }

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as { answer?: string; error?: { message?: string } };
      if (!response.ok || typeof payload.answer !== "string") throw new Error(payload.error?.message ?? "编辑助理暂时无法回应。你的内容仍然安全，请稍后重试。");
      setAiMessage(payload.answer);
    } catch (askError) {
      setAiMessage(askError instanceof Error ? askError.message : "编辑助理暂时无法回应。你的内容仍然安全，请稍后重试。");
    } finally {
      setIsAsking(false);
    }
  }

  function handleQuestionChange(value: string) {
    setAiQuestion(value);
    const match = value.match(/@([^@\s]*)$/);
    setMentionQuery(match ? match[1] : null);
  }

  function pickMention(item: MentionItem) {
    setAiQuestion((current) => current.replace(/@([^@\s]*)$/, `@${item.label} `));
    setMentionTarget(item);
    setMentionQuery(null);
  }

  function renderCaptureForm() {
    return <form className="capture-panel" onSubmit={handleSubmit}>
      <div className="section-topline"><span>新建笔记</span><StatusPill>原始出处会自动保留</StatusPill></div>
        <label htmlFor="raw-title">笔记名<span className="field-hint">可选，方便日后在左侧找到它</span></label>
        <input
          id="raw-title"
          className="raw-title-input"
          type="text"
          value={noteTitle}
          onChange={(event) => setNoteTitle(event.target.value)}
          maxLength={MAX_RAW_TITLE_LENGTH}
          placeholder="未命名"
        />
      <label htmlFor="raw-text">写下你现在想保存的内容</label>
      <textarea id="raw-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_RAW_LENGTH} placeholder="课堂笔记、阅读摘录，或一个还没有答案的问题" rows={8} />
      <div className="capture-footer">
        <span>{text.length.toLocaleString()} / {MAX_RAW_LENGTH.toLocaleString()}</span>
        {/*
          没有「创建笔记」按钮：停笔两秒自动收下并打开那篇笔记。
          这句话得写出来 —— 否则用户会一直等一个不存在的按钮。
        */}
        <span className="capture-autosave" role="status">
          {isSaving ? "正在收下…" : text.trim() ? "停下两秒会自动收下并打开" : "写下就会自动收下，不需要点按钮"}
        </span>
      </div>
    </form>;
  }

  function renderNewNote() {
    return <>
      <header className="workspace-heading compact-heading"><div><p className="eyebrow">私人知识编辑室</p><h1>新增一条笔记。</h1><p>每次保存都会生成一条独立笔记，原始内容会作为出处保留。</p></div><StatusPill tone="accent">可继续添加</StatusPill></header>
      {renderCaptureForm()}
    </>;
  }

  function renderDraftReview() {
    if (!draft) return null;
    const draftRaw = raws.find((raw) => raw.id === draftRawId);

    return <section className="review-surface" aria-labelledby="draft-title">
      <div className="review-header"><div><p className="eyebrow">等待你的判断</p><h2 id="draft-title">审阅整理稿</h2><p>编辑助理提出了一种整理方式。这仍是一份提议，只有确认后才会成为知识页。</p></div><StatusPill tone="warning">尚未收录</StatusPill></div>
      <div className="source-trace"><span>原始出处</span><strong>{draftRaw ? getPreview(draftRaw.text, 88) : "当前原始记录"}</strong></div>
      <div className="review-fields">
        <div className="field-block"><label htmlFor="draft-heading">标题</label><input id="draft-heading" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></div>
        <div className="field-block"><label htmlFor="draft-summary">摘要</label><textarea id="draft-summary" value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} rows={3} /></div>
        <div className="field-block"><label htmlFor="draft-content">正文</label><textarea id="draft-content" value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} rows={8} /></div>
      </div>
      <div className="review-columns">
        <div className="field-block"><label htmlFor="draft-key-points">关键点，每行一项</label><textarea id="draft-key-points" value={draft.keyPoints.join("\n")} onChange={(event) => setDraft({ ...draft, keyPoints: linesToArray(event.target.value) })} rows={5} /></div>
        <div className="field-block"><label htmlFor="draft-concepts">概念，每行一项</label><textarea id="draft-concepts" value={draft.concepts.join("\n")} onChange={(event) => setDraft({ ...draft, concepts: linesToArray(event.target.value) })} rows={5} /></div>
        <div className="field-block"><label htmlFor="draft-keywords">关键词，每行一项</label><textarea id="draft-keywords" value={draft.keywords.join("\n")} onChange={(event) => setDraft({ ...draft, keywords: linesToArray(event.target.value) })} rows={5} /></div>
      </div>
      {draft.relatedKnowledge.length > 0 ? <fieldset className="relation-suggestions"><legend>可能的交叉引用</legend>{draft.relatedKnowledge.map((suggestion) => <label className="relation-option" key={suggestion.knowledgeId}><input type="checkbox" checked={selectedRelationIds.includes(suggestion.knowledgeId)} onChange={(event) => setSelectedRelationIds((current) => event.target.checked ? [...current, suggestion.knowledgeId] : current.filter((id) => id !== suggestion.knowledgeId))} /><span><strong>{suggestion.knowledgeId}</strong><small>{suggestion.reason}</small></span></label>)}</fieldset> : <p className="muted-note">目前没有足够依据提出交叉引用。收录后仍可继续检查和补充。</p>}
      <div className="review-actions"><button className="button-dark" type="button" data-sound="press" onClick={() => void handleConfirm()} disabled={isConfirming}>{isConfirming ? "正在收录" : "确认并收录"}</button><button className="button-secondary" type="button" data-sound="select" onClick={() => { if (draftRawId) closeTab(`draft:${draftRawId}`); setDraft(null); setDraftRawId(null); setSelectedRelationIds([]); setNotice("整理稿暂未采用，没有创建知识页。"); }} disabled={isConfirming}>暂不采用</button></div>
    </section>;
  }

  function renderRawTab(rawId: string) {
    const raw = raws.find((item) => item.id === rawId);
    if (!raw) return <EmptyState title="这条原始记录已不存在" body="它可能已经被移除。请从一段新原话重新开始。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>留下原话</button>} />;

    const knowledge = knowledges.find((item) => item.rawId === raw.id);
    // 那一页可能只是被归档了（归档不进 `knowledges`）。要说实话：
    // 显示"等待整理"会让人以为还没整理过，从而想再整理一遍。
    const archivedKnowledge = archivedNotes.find((item) => item.rawId === raw.id);

    return <>
      <header className="workspace-heading compact-heading reading-head">
        <div><p className="eyebrow">原始记录 · {formatDate(raw.createdAt)}</p><h1>忠实留下的原话</h1><p>你可以随时修订原话，编辑助理不会改写它。每次修订都会留下记录，所有整理都能回到这份出处。</p></div>
        {knowledge ? <StatusPill tone="accent">已收录</StatusPill> : archivedKnowledge ? <StatusPill>知识页已归档</StatusPill> : <StatusPill>等待整理</StatusPill>}
      </header>
      <section className="content-section">
        {editingRawId === raw.id
          ? <>
            <textarea className="inline-edit-field" value={rawTextDraft} autoFocus rows={10} maxLength={MAX_RAW_LENGTH} onChange={(event) => setRawTextDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingRawId(null); if (event.key === "Enter" && event.ctrlKey) void handleUpdateRaw(raw); }} />
            <div className="review-actions">
              <button className="button-dark" type="button" data-sound="press" disabled={isSavingRaw} onClick={() => void handleUpdateRaw(raw)}>{isSavingRaw ? "正在保存" : "保存原话"}</button>
              <button className="button-secondary" type="button" data-sound="select" onClick={() => setEditingRawId(null)} disabled={isSavingRaw}>取消</button>
              <span className="muted-note">{rawTextDraft.length.toLocaleString()} / {MAX_RAW_LENGTH.toLocaleString()}</span>
            </div>
          </>
          : <>
            {/*
              原始记录页只剩"读"与"改原文"两件事：
                · 改原文 —— 点正文即可（与知识页同一套手感），不再有「编辑原话」按钮；
                · 整理    —— 挪到右栏当快捷词（整理助手本来就负责这一步）；
                · 移除    —— 左栏右键那条记录，不在页面里再摆一颗按钮。
            */}
            <div className="reading-content editable-field" title="点击即可修改这条原话" onClick={() => { setEditingRawId(raw.id); setRawTextDraft(raw.text); }}>{raw.text}</div>
            {knowledge ? <div className="review-actions">
              <button className="button-secondary" type="button" data-sound="select" onClick={() => openKnowledgeTab(knowledge)}>打开知识页 ↗</button>
            </div> : null}
          </>}
      </section>
    </>;
  }

  function renderKnowledgeTab(knowledgeId: string) {
    const detail = knowledges.find((item) => item.id === knowledgeId);
    if (!detail) return <EmptyState title="这张知识页已不存在" body="它可能已经被移除。你仍可以从新的原始记录开始。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>留下原话</button>} />;

    const sourceRaw = raws.find((raw) => raw.id === detail.rawId);
    const relatedEdges = graph.edges.filter((edge) => edge.source === detail.id || edge.target === detail.id);
    const isEditingTitle = editingTitleId === detail.id;
    const editing = editingField?.knowledgeId === detail.id ? editingField.field : null;
    const revisionContent = typeof noteRevision?.payload.content === "string" ? noteRevision.payload.content : null;
    const revisionReason = typeof noteRevision?.payload.reason === "string" ? noteRevision.payload.reason : "";
    const revisionDiff = revisionContent ? diffLines(detail.content, revisionContent) : [];

    function startFieldEdit(field: "summary" | "content" | "concepts") {
      setEditingField({ knowledgeId: detail!.id, field });
      setFieldDraft(field === "concepts" ? detail!.concepts.join("\n") : detail![field]);
    }

    function saveFieldEdit() {
      if (!editing) return;
      if (editing === "concepts") {
        void handleUpdateKnowledge(detail!.id, { concepts: linesToArray(fieldDraft) });
      } else {
        void handleUpdateKnowledge(detail!.id, { [editing]: fieldDraft });
      }
    }

    /** 与这一页已经建立正式关联的知识页标题 —— 用来区分正文里的实线标记与虚线标记。 */
    const linkedTitles = new Set(
      relatedEdges.flatMap((edge) => {
        const otherId = edge.source === detail.id ? edge.target : edge.source;
        const other = knowledges.find((item) => item.id === otherId);
        return other ? [other.title] : [];
      }),
    );

    /**
     * 正文内联渲染：把出现在正文里的知识页标题变成可交互标记。
     *
     * 已连接的画实线、未连接的画虚线 —— 与右栏「未链接提及」同一套判断。
     * 标记上的点击必须 `stopPropagation`：这块正文本身是"点一下就编辑"的区域，
     * 不拦住的话，用户想打开概念反而进了编辑态。
     */
    function renderNoteBody() {
      const otherTitles = knowledges.filter((item) => item.id !== detail!.id).map((item) => item.title);

      return splitByTitles(detail!.content, otherTitles).map((segment, index) => {
        if (segment.type === "text") return <span key={`text-${index}`}>{segment.text}</span>;

        const target = knowledges.find((item) => item.title === segment.title);
        const linked = linkedTitles.has(segment.title);
        const mentionedElsewhere = knowledges.filter((item) => item.id !== detail!.id && item.title !== segment.title && item.content.includes(segment.title)).length;

        return <span
          className="inline-ref-wrap"
          key={`ref-${index}-${segment.title}`}
          onMouseEnter={() => setActiveInlineRef(segment.title)}
          onMouseLeave={() => setActiveInlineRef((current) => (current === segment.title ? null : current))}
        >
          <button
            className={`inline-ref${linked ? " is-linked" : ""}`}
            type="button"
            data-sound="select"
            title={linked ? "已建立关联" : "正文提到了它，但还没建立关联"}
            onClick={(event) => { event.stopPropagation(); if (target) openKnowledgeTab(target); }}
            onFocus={() => setActiveInlineRef(segment.title)}
          >{segment.title}</button>
          {activeInlineRef === segment.title ? <span className="inline-ref-card" onClick={(event) => event.stopPropagation()}>
            <span className="inline-ref-card-head">{segment.title}</span>
            <span className="inline-ref-card-state">{linked ? "已经建立关联" : "正文提到了它，但还没建立关联"}</span>
            <span className="inline-ref-card-note">{mentionedElsewhere > 0 ? `另外 ${mentionedElsewhere} 篇知识页也提到它` : "目前只有这一页提到它"}</span>
            <span className="inline-ref-card-actions">
              {target ? <button type="button" data-sound="select" onClick={() => openKnowledgeTab(target)}>打开知识页</button> : null}
              {!linked && target ? <button type="button" data-sound="press" disabled={linkingId === target.id} onClick={() => void handleCreateLink(detail!.id, target.id)}>{linkingId === target.id ? "建立中…" : "＋ 建立关联"}</button> : null}
            </span>
          </span> : null}
        </span>;
      });
    }

    return <>
      <header className="workspace-heading compact-heading reading-head">
        <div>
          <p className="eyebrow">知识页</p>
          {isEditingTitle
            ? <input className="title-edit-input" value={titleDraft} autoFocus onChange={(event) => setTitleDraft(event.target.value)} onBlur={() => void handleUpdateKnowledge(detail.id, { title: titleDraft })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleUpdateKnowledge(detail.id, { title: titleDraft }); } if (event.key === "Escape") setEditingTitleId(null); }} />
            : <h1 onContextMenu={(event) => { event.preventDefault(); setContextMenu({ type: "knowledge-title", knowledge: detail, x: event.clientX, y: event.clientY }); }}>{detail.title}</h1>}
          <p className="reading-meta">修订于 {formatDate(detail.updatedAt)} · 点击正文即可编辑</p>
        </div>
          <div className="heading-actions">
            <StatusPill tone="accent">已收录</StatusPill>
            <button className="button-secondary" type="button" data-sound="select" onClick={() => void handleArchiveNote(detail, true)}>归档这一页</button>
          </div>
      </header>
      <section className="content-section">
        {editing === "summary"
          ? <textarea className="inline-edit-field" value={fieldDraft} autoFocus rows={3} onChange={(event) => setFieldDraft(event.target.value)} onBlur={saveFieldEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && event.ctrlKey) saveFieldEdit(); }} />
          : <p className="reading-summary editable-field" onClick={() => startFieldEdit("summary")}>{detail.summary}</p>}
        {editing === "content"
          ? <textarea className="inline-edit-field" value={fieldDraft} autoFocus rows={10} onChange={(event) => setFieldDraft(event.target.value)} onBlur={saveFieldEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && event.ctrlKey) saveFieldEdit(); }} />
          : <div className="reading-content editable-field" onClick={() => startFieldEdit("content")}>{renderNoteBody()}</div>}
        {editing === "concepts"
          ? <textarea className="inline-edit-field" value={fieldDraft} autoFocus rows={4} placeholder="每行一个概念" onChange={(event) => setFieldDraft(event.target.value)} onBlur={saveFieldEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && event.ctrlKey) saveFieldEdit(); }} />
          : <div className="tag-row editable-field" onClick={() => startFieldEdit("concepts")}>{detail.concepts.length > 0 ? detail.concepts.map((concept) => <span className="tag" key={concept}>{concept}</span>) : <span className="muted-note">点击添加概念</span>}</div>}
        {noteRevision && revisionContent ? <div className="diff-card">
          <div className="diff-head"><b>编辑助理的改写提议</b><em>等待你确认</em></div>
          {revisionReason ? <p className="diff-reason">{revisionReason}</p> : null}
          <div className="diff-body" role="group" aria-label="改写前后逐行对比">{revisionDiff.map((line, index) => <div className={`diff-line is-${line.kind}`} key={`${index}-${line.kind}`}><span className="diff-sign" aria-hidden="true">{line.kind === "added" ? "+" : line.kind === "removed" ? "−" : " "}</span><span>{line.text || "\u00a0"}</span></div>)}</div>
          <div className="review-actions">
            <button className="button-dark" type="button" data-sound="press" disabled={isResolvingRevision} onClick={() => void handleApplyRevision(noteRevision)}>{isResolvingRevision ? "正在写入" : "确认写入正文"}</button>
            <button className="button-secondary" type="button" data-sound="select" disabled={isResolvingRevision} onClick={() => void handleIgnoreRevision(noteRevision)}>忽略</button>
            <span className="muted-note">这一页现在是第 {detail.version ?? 1} 版，写入会留下一条修订记录。</span>
          </div>
        </div> : null}
        <div className="source-reference"><span className="item-kicker">原始出处</span><strong>{sourceRaw ? getPreview(sourceRaw.text, 150) : "原始出处暂时没有载入"}</strong>{sourceRaw ? <button className="text-button" type="button" data-sound="select" onClick={() => openRawTab(sourceRaw)}>查看原始记录 ↗</button> : null}</div>
        <div className="backlink-section">
          <div className="section-heading-inline"><h3>交叉引用</h3><button className="text-button" type="button" data-sound="select" onClick={() => navigate("graph")}>查看知识网络</button></div>
          {relatedEdges.length > 0 ? <div className="relation-list">{relatedEdges.map((edge) => {
            const otherId = edge.source === detail.id ? edge.target : edge.source;
            const other = knowledges.find((item) => item.id === otherId);
            return <div className="relation-row" key={edge.id}>{other ? <button className="text-button" type="button" data-sound="select" onClick={() => openKnowledgeTab(other)}>{other.title}</button> : <span>{otherId}</span>}<small>{edge.reason}</small></div>;
          })}</div> : <p className="muted-note">这张知识页还没有交叉引用。</p>}
        </div>
      </section>
    </>;
  }

  function renderAssistantBlock(knowledgeId: string) {
    /*
     * 编辑助理 = 同一把琴的另一种状态。
     *
     * 它和原始记录页的「整理助手」是同一个助手，所以形象也是同一把竖琴 ——
     * 一处是"整理"，一处是"对话"，用户看久了会认得它。三种状态：
     *   准备就绪（琴在呼吸）→ 正在查阅（弦振得快、火星顺着中弦走）→ 已回答（安静下来）。
     * 空的回复区不再是"一片空白"：形象 + 一句状态 + 一行提示，先把这格填满。
     */
    const mood: AgentMood = isAsking ? "thinking" : aiMessage ? "settled" : "idle";
    const stateLabel = isAsking ? "正在查阅你选的材料…" : aiMessage ? "已回答" : "准备就绪";

    return <div className="blk agent-panel" id="rail-assistant">
      <div className="blk-head"><b>编辑助理</b><em className="zero">只提议</em></div>

      <div className="agent-row">
        <AgentFigure mood={mood} />
        <p className="agent-state">{stateLabel}</p>
      </div>

      <div className={`ai-result${aiMessage ? " has-result" : ""}`} aria-live="polite">
        <div className="ai-result-label"><span>助理回复</span></div>
        <p>{isAsking ? "正在读你 @ 的那份材料，结论会落在这里。" : aiMessage || "问它点什么，或输入 @ 引用一份原始记录 / 知识页 —— 它只依据你选的材料回答。"}</p>
        {aiMessage && !isAsking ? <div className="ai-result-actions"><button className="text-button" type="button" data-sound="select" onClick={() => setAiMessage("")}>收起回复</button></div> : null}
      </div>
      <form className="ai-ask" onSubmit={(event) => { event.preventDefault(); void handleAskAssistant(aiQuestion); }}>
        <div className="ai-input-wrap">
          {mentionCandidates.length > 0 ? <div className="mention-popup" role="listbox">{mentionCandidates.map((item) => <button type="button" key={`${item.kind}:${item.id}`} className="mention-row" data-sound="select" onClick={() => pickMention(item)}><span className="mention-kind">{item.kind === "raw" ? "原始记录" : "知识页"}</span><span>{item.label}</span></button>)}</div> : null}
          <div className="ai-input-row"><input id="ai-question" aria-label="向编辑助理提问" value={aiQuestion} onChange={(event) => handleQuestionChange(event.target.value)} placeholder="写下问题，@ 可以引用已有材料" disabled={isAsking} /><button type="submit" data-sound="press" aria-label="提交问题" disabled={isAsking}>↗</button></div>
        </div>
      </form>
      {/* 与「提出整理稿」同一套快捷词：都是"对助手说的一句话"，不是一个必须按的按钮 */}
      <div className="quick-words">
        <button className="quick-word" type="button" data-sound="press" disabled={isProposingRevision || isAsking} onClick={() => void handleProposeRevision(knowledgeId, aiQuestion)}>
          {isProposingRevision ? "正在起草改写…" : "提议改写正文"}
        </button>
      </div>
      <p className="agent-hint">它只提议，不落库：改写的建议会附在正文底部，你点「确认写入正文」才合入。</p>
    </div>;
  }

  function renderKnowledgeRail() {
    // 与右边缘图标条同一份数据（见 railContext）：三块的数字必须对得上。
    const context = railContext;
    if (!context) {
      return <div className="rail-inner"><div className="rail-head"><h4>上下文</h4></div><div className="rail-body"><p className="muted-note">这张知识页暂时不可用。</p></div></div>;
    }
    const { detail, inlinks, outlinks, mentions } = context;

    const renderEdgeList = (edges: GraphEdge[], pickOther: (edge: GraphEdge) => string, emptyText: string) => edges.length > 0
      ? <div className="blk-list">{edges.map((edge) => {
        const otherId = pickOther(edge);
        const other = knowledges.find((item) => item.id === otherId);
        return <button type="button" className="blk-row" key={edge.id} data-sound="select" onClick={() => { if (other) openKnowledgeTab(other); }}><span>{other ? other.title : otherId}</span><small>{edge.reason}</small></button>;
      })}</div>
      : <p className="muted-note">{emptyText}</p>;

    return <div className="rail-inner">
      <div className="rail-head"><h4>上下文 · 跟随当前标签</h4></div>
      <div className="rail-body">
        <div className="blk" id="rail-inlinks">
          <div className="blk-head"><b>入链</b><em>{inlinks.length}</em></div>
          {renderEdgeList(inlinks, (edge) => edge.source, "还没有页面链接到这里。")}
        </div>
        <div className="blk" id="rail-outlinks">
          <div className="blk-head"><b>出链</b><em>{outlinks.length}</em></div>
          {renderEdgeList(outlinks, (edge) => edge.target, "本页还没有引用其他知识页。")}
        </div>
        <div className="blk" id="rail-mentions">
          <div className="blk-head"><b>未链接提及</b><em>{mentions.length}</em></div>
          {mentions.length > 0
            ? <div className="blk-list">{mentions.map((item) => (
              <div className="blk-row" key={item.id}>
                <button type="button" className="blk-row-title" data-sound="select" onClick={() => openKnowledgeTab(item)}>{item.title}</button>
                <small>正文里提到了它，但还没建立关联</small>
                <button type="button" className="blk-link-btn" data-sound="press" disabled={linkingId === item.id} onClick={() => void handleCreateLink(detail.id, item.id)}>{linkingId === item.id ? "建立中…" : "＋ 建立关联"}</button>
              </div>
            ))}</div>
            : <p className="muted-note">正文里没有出现其他知识页的标题。</p>}
        </div>
        {renderAssistantBlock(detail.id)}
      </div>
    </div>;
  }

  function renderKnowledgeIndex() {
    return <>
      <header className="workspace-heading compact-heading">
        <div>
          <p className="eyebrow">Knowledge</p>
          <h1>沉淀后的知识页。</h1>
          <p>这里保存经过你确认的整理结果。请从左侧选择一篇知识页继续阅读或编辑。</p>
        </div>
        <StatusPill tone="accent">{knowledges.length} 篇</StatusPill>
      </header>
      <section className="content-section">
        <EmptyState
          title={knowledges.length > 0 ? "从左侧打开一篇知识页" : "还没有知识页"}
          body={knowledges.length > 0 ? "知识页会在标签中打开，方便你在多篇内容之间切换。" : "先在 Home 留下一条原始记录，再确认整理稿，它就会出现在这里。"}
          action={knowledges.length === 0 ? <button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>留下原话</button> : undefined}
        />
      </section>
    </>;
  }

  function renderGraph() {
    return <>
      <header className="workspace-heading compact-heading">
        <div>
          <p className="eyebrow">全景知识网络</p>
          <h1>看见知识点如何彼此呼应。</h1>
          <p>每一个圆点都是你亲自沉淀的一篇知识页，被引用得越多就越醒目。拖动或缩放画布探索关联，双击圆点即可打开对应知识页。</p>
        </div>
        <button className="button-secondary" type="button" data-sound="press" onClick={() => setGraphRefresh((current) => current + 1)}>重新载入</button>
      </header>
      {graph.nodes.length === 0
        ? <EmptyState title="知识网络还没有内容" body="确认并收录第一张知识页后，它会从这里开始生长。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>留下原话</button>} />
        : <>
          {filteredGraph.nodes.length === 0 ? <p className="muted-note" style={{ marginBottom: 10 }}>没有匹配「{graphSearch}」的知识页。</p> : null}
      <GraphView nodes={filteredGraph.nodes} edges={filteredGraph.edges} params={graphParams} showArrows={showArrows} onOpenNote={(nodeId) => void handleGraphNodeClick(nodeId)} onPinnedChange={setGraphPinnedCount} resetPinnedSignal={graphResetSignal} />
        </>}
    </>;
  }

  function renderAgentStep(step: AgentStep) {
    const payload = step.payload ?? {};
    const gateState = step.proposalId ? gateStates[step.proposalId] ?? "pending" : null;
    const statusLabel =
      step.kind === "boundary"
        ? "由你做主"
        : step.kind === "gate"
          ? gateState === "accepted"
            ? "已建立"
            : gateState === "ignored"
              ? "已忽略"
              : step.status === "failed"
                ? "未生成"
                : "等待你确认"
          : step.status === "failed"
            ? "跳过"
            : "已完成";

    return <li className={`agent-step agent-step-${step.kind}`} key={`${step.index}-${step.tool}`}>
      <span className="agent-step-marker" aria-hidden="true" />
      <div className="agent-step-body">
        <div className="agent-step-head">
          {/* 用户看到的是「查找笔记」这类步骤名；机器名只留在 title 里，排查用。 */}
          <span className="agent-step-tool" title={step.tool}>{step.label}</span>
          {step.hint ? <span className="agent-step-hint">{step.hint}</span> : null}
          <em className={`agent-step-status status-${step.kind}`}>{statusLabel}</em>
        </div>
        <p className="agent-step-detail">{step.detail}</p>

        {step.kind === "gate" && step.tool === "propose_link" ? <div className="agent-gate-card">
          <div className="agent-gate-pair">
            <span className="agent-chip">{String(payload.sourceTitle ?? payload.sourceId ?? "")}</span>
            <span className="agent-gate-join" aria-hidden="true">↔</span>
            <span className="agent-chip">{String(payload.targetTitle ?? payload.targetId ?? "")}</span>
          </div>
          <p className="agent-step-detail"><b>理由：</b>{String(payload.reason ?? "")}</p>
          {gateState === "pending" && step.status !== "failed" ? <div className="agent-gate-actions">
            <button className="button-primary" type="button" data-sound="press" disabled={isAgentRunning} onClick={() => void handleGateAccept(step)}>建立关联</button>
            <button className="button-secondary" type="button" data-sound="press" disabled={isAgentRunning} onClick={() => void handleGateIgnore(step)}>忽略</button>
          </div> : <p className="muted-note">{gateState === "accepted" ? "已建立关联，知识网络已更新。" : gateState === "ignored" ? "已忽略这条提议。" : "这条提议没有生成。"}</p>}
        </div> : null}

        {step.kind === "gate" && step.tool === "propose_source" ? <div className="agent-gate-card">
          <p className="muted-note">来源标注：{agentTrace?.contextTitle ?? "未标注"}</p>
          {gateState === "pending" && step.status !== "failed" ? <div className="agent-gate-actions">
            <button className="button-primary" type="button" data-sound="press" disabled={isAgentRunning} onClick={() => void handleGateAccept(step)}>保存这道错题</button>
            <button className="button-secondary" type="button" data-sound="press" disabled={isAgentRunning} onClick={() => void handleGateIgnore(step)}>忽略</button>
          </div> : <p className="muted-note">{gateState === "accepted" ? "已存为原始记录。" : gateState === "ignored" ? "已忽略这条提议。" : "这条提议没有生成。"}</p>}
        </div> : null}
      </div>
    </li>;
  }

  function renderAgentTab() {
    const trace = agentTrace;
    const approved = Object.values(gateStates).filter((state) => state === "accepted").length;
    /*
     * 这把琴在这里当主角：点进来时它先"展开"一次（一次 620ms 的缩放淡入），
     * 状态与右栏那两处共用同一套词 —— 空闲 / 整理中 / 已出结果。
     * 左栏图标条上的那个入口用的也是它，用户顺着点过来不会觉得换了个东西。
     */
    const heroMood: AgentMood = isAgentRunning ? "thinking" : trace ? "settled" : "idle";

    return <>
      <header className="workspace-heading compact-heading agent-heading">
        <AgentFigure mood={heroMood} size="hero" />
        <div><p className="eyebrow">智能整理助手</p><h1>AI 帮你找线索，去留由你拍板。</h1><p>把一道错题或一段随手记交给它，它会先翻阅你已有的知识页、找出知识点之间的断层，再把串联建议与归档方案列在下面等你确认。不经你点头，它不会改动你的任何一篇笔记。</p></div>
        <div className="agent-head-actions">
          {trace ? <button className="button-secondary" type="button" data-sound="press" disabled={isAgentRunning || !agentRequest} onClick={() => { if (agentRequest) void runAgentOrganize(agentRequest); }}>↻ 重置并重放任务轨迹</button> : null}
          <StatusPill tone={isAgentRunning ? "warning" : trace ? "accent" : "neutral"}>
            {isAgentRunning ? "正在整理" : trace ? `已完成 · ${approved} 项已落库` : "尚未运行"}
          </StatusPill>
        </div>
      </header>

      {trace ? <section className="content-section agent-run">
        <div className="agent-run-head">
          <p className="eyebrow">本次任务</p>
          <b>{trace.contextTitle ?? "未命名材料"}</b>
          <small>
            类型：{trace.contextType === "raw" ? "原始记录" : trace.contextType === "knowledge" ? "知识页" : trace.contextType === "draft" ? "整理稿" : "无引用材料"}
            {" · "}依据 · 工作手册 {trace.manualVersion}
          </small>
        </div>

        {trace.message ? <p className="agent-run-message">{trace.message}</p> : null}

        <ol className="agent-step-list">{trace.steps.map(renderAgentStep)}</ol>
      </section> : null}

      {!trace && isAgentRunning ? <section className="content-section">
        <p className="muted-note">正在整理：agent 会先读工作手册，再检索命中的知识页、逐条通读，最后把关联与留档作为待确认的提议提出来。这一步会真的调用模型，通常需要十几秒。</p>
      </section> : null}

      {!trace && !isAgentRunning ? <section className="content-section">
        <EmptyState
          title="还没有跑过整理"
          body="在右栏的编辑助理里 @ 一条原始记录（比如一道错题），写下「把这道错题整理进知识库」，这里就会出现它的完整轨迹：读了什么、为什么这么判断、以及它停下来等你确认的两项。"
        />
      </section> : null}
    </>;
  }

  function renderRail() {
    if (activeSpace === "graph") {
      return <div className="rail-inner">
        <div className="rail-head"><h4>图谱设置</h4></div>
        <div className="rail-body">
          <div className="ctl">
            <b>筛选</b>
            <input className="text-input" type="text" value={graphSearch} placeholder="搜索节点关键词…" onChange={(event) => setGraphSearch(event.target.value)} />
            <div className="toggle-row"><span>显示孤立节点</span><button type="button" className={`sw${showOrphans ? " on" : ""}`} aria-label="显示孤立节点" onClick={() => setShowOrphans((current) => !current)}><i /></button></div>
            <div className="toggle-row"><span>显示连线方向箭头</span><button type="button" className={`sw${showArrows ? " on" : ""}`} aria-label="显示连线方向" onClick={() => setShowArrows((current) => !current)}><i /></button></div>
          </div>
          <div className="ctl"><b>显示</b>
            <label htmlFor="rng-node-size"><span>节点大小</span></label>
            <div className="row"><input id="rng-node-size" className="range-input" type="range" min="0.6" max="1.6" step="0.05" value={graphParams.nodeSize} onChange={(event) => setGraphParams((current) => ({ ...current, nodeSize: Number(event.target.value) }))} /><span>{graphParams.nodeSize.toFixed(2)}×</span></div>
            <label htmlFor="rng-line-width"><span>连线粗细</span></label>
            <div className="row"><input id="rng-line-width" className="range-input" type="range" min="0.6" max="2.2" step="0.05" value={graphParams.lineWidth} onChange={(event) => setGraphParams((current) => ({ ...current, lineWidth: Number(event.target.value) }))} /><span>{graphParams.lineWidth.toFixed(2)}×</span></div>
          </div>
          <div className="ctl"><b>视图松紧调节</b>
            <label htmlFor="rng-center"><span>向心聚拢度</span></label>
            <div className="row"><input id="rng-center" className="range-input" type="range" min="0.1" max="1.2" step="0.02" value={graphParams.centerForce} onChange={(event) => setGraphParams((current) => ({ ...current, centerForce: Number(event.target.value) }))} /><span>{graphParams.centerForce.toFixed(2)}</span></div>
            <label htmlFor="rng-repel"><span>节点排斥间距</span></label>
            <div className="row"><input id="rng-repel" className="range-input" type="range" min="150" max="700" step="10" value={graphParams.repelForce} onChange={(event) => setGraphParams((current) => ({ ...current, repelForce: Number(event.target.value) }))} /><span>{graphParams.repelForce}</span></div>
            <label htmlFor="rng-link-force"><span>关联牵引强度</span></label>
            <div className="row"><input id="rng-link-force" className="range-input" type="range" min="0.2" max="1.0" step="0.02" value={graphParams.linkForce} onChange={(event) => setGraphParams((current) => ({ ...current, linkForce: Number(event.target.value) }))} /><span>{graphParams.linkForce.toFixed(2)}</span></div>
            <label htmlFor="rng-link-dist"><span>连线舒展长度</span></label>
            <div className="row"><input id="rng-link-dist" className="range-input" type="range" min="70" max="180" step="5" value={graphParams.linkDist} onChange={(event) => setGraphParams((current) => ({ ...current, linkDist: Number(event.target.value) }))} /><span>{graphParams.linkDist}</span></div>
          </div>
          <div className="ctl"><b>布局</b>
            <p className="muted-note">{graphPinnedCount > 0 ? `已固定 ${graphPinnedCount} 个节点：拖动过的节点会留在落点。` : "拖动节点会把它固定在落点，不再被力场拉回原处。"}</p>
            <button className="button-secondary" type="button" data-sound="press" disabled={graphPinnedCount === 0} onClick={() => setGraphResetSignal((current) => current + 1)}>重新布局（放开固定的节点）</button>
          </div>
        </div>
      </div>;
    }

    if (activeSpace === "agent") {
      const trace = agentTrace;
      const approved = Object.values(gateStates).filter((state) => state === "accepted").length;

      // 右栏的数字与名单全部从真实轨迹里推出来，不写死：
      // 「关联到的知识页」= 轨迹里出现过的知识页标题；「知识断层」= 提了多少条串联建议。
      // 要归档的那条原始记录不算「关联到的知识页」——它不在这份名单的语义里。
      const archivedSourceTitles = new Set(
        trace
          ? trace.steps
            .filter((step) => step.kind === "gate" && step.tool === "propose_source")
            .map((step) => (step.payload ?? {}).title)
            .filter((value): value is string => typeof value === "string")
          : new Set<string>(),
      );
      const relatedTitles = trace
        ? Array.from(new Set(trace.steps.flatMap((step) => {
          const payload = step.payload ?? {};
          return [payload.title, payload.sourceTitle, payload.targetTitle]
            .filter((value): value is string => typeof value === "string" && value.length > 0);
        }))).filter((title) => !archivedSourceTitles.has(title) && knowledges.some((item) => item.title === title))
        : [];
      const proposedLinkTitles = new Set(
        trace
          ? trace.steps
            .filter((step) => step.kind === "gate" && step.tool === "propose_link")
            .flatMap((step) => {
              const payload = step.payload ?? {};
              return [payload.sourceTitle, payload.targetTitle]
                .filter((value): value is string => typeof value === "string");
            })
          : [],
      );
      const brokenLinks = trace
        ? trace.steps.filter((step) => step.kind === "gate" && step.tool === "propose_link" && step.status !== "failed").length
        : 0;
      const pending = trace ? Math.max(0, trace.counters.pendingProposals - approved) : 0;

      return <div className="rail-inner">
        <div className="rail-head"><h4>整理摘要与复习提示</h4></div>
        <div className="rail-body">
          {trace ? <>
            <div className="run-sum">
              <div className="big">{relatedTitles.length} 篇</div>
              <div className="cap">这次整理关联到的已有知识页</div>
              <div className="run-counters">
                <div><b>{brokenLinks}</b><span>发现知识断层</span></div>
                <div><b>{pending}</b><span>待你确认建议</span></div>
                <div><b>{approved}</b><span>你已采纳建议</span></div>
              </div>
            </div>

            {relatedTitles.length > 0 ? <div className="tool-list">
              <b>这次整理关联到的知识页</b>
              {relatedTitles.map((title) => {
                const note = knowledges.find((item) => item.title === title);
                const suggested = proposedLinkTitles.has(title);
                return <div className="tool-row" key={title}>
                  <button className="text-button" type="button" data-sound="select" onClick={() => { if (note) openKnowledgeTab(note); }}>{title}</button>
                  <em className={suggested ? "mid" : "ok"}>{suggested ? "建议串联" : "已读过"}</em>
                </div>;
              })}
            </div> : null}

            <div className="tool-list">
              <b>整理助手守则</b>
              <div className="tool-row"><span>查阅你已有的笔记与摘录</span><em className="ok">自动为你完成</em></div>
              <div className="tool-row"><span>串联知识点 / 归档错题</span><em className="mid">先给建议 · 由你确认</em></div>
              <div className="tool-row"><span>擅自改写你的知识页正文</span><em className="no">永不自动执行</em></div>
            </div>

            <p className="muted-note">第一手「原始记录」与提炼后的「知识页」始终分开。整理助手只负责帮你找线索、递建议，你的知识库永远只反映你自己的理解。</p>
          </> : <p className="muted-note">还没有跑过整理。在编辑助理里 @ 一条原始记录（比如一道错题）并写下「把这道错题整理进知识库」，这里会显示这次整理关联到的知识页、发现的知识断层与你需要复习的线索。</p>}
        </div>
      </div>;
    }

    if (activeSpace === "knowledge" && activeTab.kind === "knowledge") {
      return renderKnowledgeRail();
    }

    /*
     * 原始记录页的右栏：给整理助手留一个入口。
     *
     * 「提出整理稿」原来是原始记录页上的一颗按钮。拿掉它之后，这个词必须有个新家 ——
     * 放在这里当**快捷词**：整理助手本来就负责这一步（提一版草稿、用户确认才入库），
     * 页面上的按钮只是它的一个快捷键。这样原始记录页也就只剩"读"和"改原文"两件事。
     */
    if (activeSpace === "home" && activeTab.kind === "raw") {
      const raw = raws.find((item) => item.id === activeTab.rawId);
      const collected = raw ? knowledges.find((item) => item.rawId === raw.id) : undefined;
      const archivedNote = raw ? archivedNotes.find((item) => item.rawId === raw.id) : undefined;

      const mood: AgentMood =
        raw && organizingRawId === raw.id ? "thinking" : collected ? "settled" : archivedNote ? "resting" : "idle";
      const stateLabel =
        mood === "thinking" ? "正在读你已有的知识页…" : mood === "settled" ? "已收录" : mood === "resting" ? "知识页已归档" : "还没整理";
      const stateHint =
        mood === "thinking"
          ? "它会先检索、再通读，然后把串联建议与归档方案列出来等你拍板。"
          : mood === "settled"
            ? "这条原话已经长成一张知识页。要继续打磨，打开那一页，用它的编辑助理。"
            : mood === "resting"
              ? "它对应的知识页已归档。要接着整理，先到 Settings 的「归档」里恢复那一页。"
              : "交给它读一遍，再提一版草稿：它只提议，你确认之后才会成为知识页。";

      return <div className="rail-inner">
        <div className="rail-head"><h4>整理助手</h4></div>
        <div className="rail-body">
          <div className="blk agent-panel">
            {/* 形象 + 状态：这是这块最想让人记住的一眼 */}
            <div className="agent-row">
              <AgentFigure mood={mood} />
              <p className="agent-state">{stateLabel}</p>
            </div>
            <p className="agent-hint">{stateHint}</p>
            {!collected && !archivedNote && raw ? <div className="quick-words">
              <button className="quick-word" type="button" data-sound="press" disabled={organizingRawId !== null} onClick={() => void handleOrganize(raw.id)}>
                {organizingRawId === raw.id ? "正在整理…" : "提出整理稿"}
              </button>
            </div> : null}
          </div>
        </div>
      </div>;
    }

    return <div className="rail-inner">
      <div className="rail-head"><h4>编辑助理</h4></div>
      <div className="rail-body">
        <p className="muted-note">打开一张知识页，右栏会显示它的入链、出链、未链接提及与编辑助理。</p>
      </div>
    </div>;
  }

  function renderMainContent() {
    switch (activeTab.kind) {
      case "raw": return renderRawTab(activeTab.rawId);
      case "knowledge": return renderKnowledgeTab(activeTab.knowledgeId);
      case "draft": return renderDraftReview();
      case "view":
        switch (activeTab.viewKey) {
          case "new-note": return renderNewNote();
          case "knowledge-index": return renderKnowledgeIndex();
          case "agent": return renderAgentTab();
        }
    }
  }

  function renderSecondaryNav() {
    return (
      <SecondaryNav space={activeSpace}>
        {activeSpace === "home" ? (
          <RawTree
            raws={raws}
            activeTabId={activeTabId}
            rawsExpanded={rawsExpanded}
            onToggleRaws={() => setRawsExpanded((current) => !current)}
            rawLabel={rawLabel}
            onOpenRaw={openRawTab}
            onRawContextMenu={(raw, x, y) => setContextMenu({ type: "raw", raw, x, y })}
            onNewNote={() => navigate("new-note")}
          />
        ) : null}

        {activeSpace === "knowledge" ? (
          <KnowledgeTree
            knowledges={knowledges}
            activeTabId={activeTabId}
            notesExpanded={notesExpanded}
            onToggleNotes={() => setNotesExpanded((current) => !current)}
            onOpenKnowledge={openKnowledgeTab}
          />
        ) : null}

        {activeSpace === "agent" ? (
          <AgentNav trace={agentTrace} onOpenAgent={() => openSpace("agent")} />
        ) : null}

      </SecondaryNav>
    );
  }

  function renderInspectorIcons() {
    return (
      <>
        <button className="rail-icon-btn" type="button" data-sound="select" title="展开上下文面板" aria-label="展开上下文面板" aria-controls="context-rail" onClick={toggleRail}>
          <IconPanelExpand />
        </button>
        <span className="rail-divider" aria-hidden="true" />
        {activeSpace === "knowledge" && railContext ? (
          <>
            <button className="rail-icon-btn" type="button" data-sound="select" title={`入链 ${railContext.inlinks.length}`} aria-label={`入链 ${railContext.inlinks.length}`} onClick={() => openRailAt("rail-inlinks")}><IconInlink /><CountBadge count={railContext.inlinks.length} /></button>
            <button className="rail-icon-btn" type="button" data-sound="select" title={`出链 ${railContext.outlinks.length}`} aria-label={`出链 ${railContext.outlinks.length}`} onClick={() => openRailAt("rail-outlinks")}><IconOutlink /><CountBadge count={railContext.outlinks.length} /></button>
            <button className="rail-icon-btn" type="button" data-sound="select" title={`未链接提及 ${railContext.mentions.length}`} aria-label={`未链接提及 ${railContext.mentions.length}`} onClick={() => openRailAt("rail-mentions")}><IconMention /><CountBadge count={railContext.mentions.length} /></button>
            <button className="rail-icon-btn" type="button" data-sound="select" title="编辑助理" aria-label="编辑助理" onClick={() => openRailAt("rail-assistant")}><IconHarp /></button>
          </>
        ) : null}
      </>
    );
  }

  function renderSpaceContent() {
    if (activeSpace === "graph") return renderGraph();
    if (activeSpace === "agent") return renderAgentTab();
    return renderMainContent();
  }

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? openTabs[0] ?? NEW_NOTE_TAB;
  const visibleTabs = activeSpace === "home" || activeSpace === "knowledge"
    ? openTabs.filter((tab) => tabSpace(tab) === activeSpace)
    : [];

  /**
   * 右栏此刻是否可见：宽屏看「有没有被收起来」，窄屏看抽屉状态。
   */
  const railShow = railOpen || !railHidden;
  const showInspector =
    activeSpace === "knowledge" ||
    activeSpace === "graph" ||
    activeSpace === "agent" ||
    (activeSpace === "home" && activeTab.kind === "raw");
  const breadcrumbLabel =
    activeSpace === "home" || activeSpace === "knowledge"
      ? activeTab.label
      : SPACE_META[activeSpace].label;

  if (entered === null) return null;

  if (!entered) {
    return (
      <LandingPage
        onEnter={() => {
          try {
            window.localStorage.setItem(LANDING_KEY, "1");
          } catch {
            /* 存不下也让他进；下次仍会看到落地页 */
          }
          setEntered(true);
        }}
      />
    );
  }

  return (
    <AppShell
      sidebarOpen={sidebarOpen}
      railHidden={railHidden}
      showInspector={showInspector}
      mobileTopbar={
        <div className="mobile-topbar">
          <button className="mobile-menu-button" type="button" data-sound="select" onClick={() => { setRailOpen(false); setMobileNavOpen((current) => !current); }} aria-expanded={mobileNavOpen} aria-controls="workspace-nav">目录</button>
          <AppLogo />
          <button className="mobile-new-button" type="button" data-sound="press" onClick={() => navigate("new-note")}>新建</button>
        </div>
      }
      sidebar={
        <aside id="workspace-nav" className={`workspace-sidebar${mobileNavOpen ? " is-open" : ""}${sidebarOpen ? "" : " is-collapsed"}`}>
          <div className="sidebar-top">
            <div className="sidebar-top-row">
              <AppLogo />
              <button className="sidebar-collapse-btn" type="button" data-sound="select" aria-label="收起侧栏" aria-controls="workspace-nav" onClick={() => setSidebarOpen(false)}><IconPanelCollapse /></button>
            </div>
            <button className="workspace-switcher" type="button" data-sound="select" onClick={() => openSpace("home")}>
              <span className="workspace-avatar">G</span>
              <span><strong>私人知识编辑室</strong><small>Home</small></span>
            </button>
            <button className="new-source-button" type="button" data-sound="press" onClick={() => navigate("new-note")}><span aria-hidden="true">+</span> 新建笔记</button>
          </div>

          <PrimaryNav activeSpace={activeSpace} onSelect={openSpace} onExpandSidebar={() => setSidebarOpen(true)} />
          {renderSecondaryNav()}

          <div className="sidebar-bottom">
            <div className="data-status"><span className="status-dot" aria-hidden="true" /><span><strong>记录已保存</strong><small>原始记录与知识页可追溯</small></span></div>
            <div className="sidebar-bottom-row">
              <span className="sidebar-version">Chordnote · 和弦</span>
              <button className={`sidebar-settings-btn${settingsOpen ? " is-active" : ""}`} type="button" data-sound="select" aria-label="打开设置" aria-expanded={settingsOpen} aria-controls="settings-window" onClick={() => openSpace("settings")}><IconSettings /></button>
            </div>
          </div>
        </aside>
      }
      main={
        <section className="workspace-main">
          <div className="workspace-topbar">
            <div className="breadcrumb"><span>Chordnote</span><span aria-hidden="true">/</span><strong>{breadcrumbLabel}</strong></div>
            <div className="topbar-actions">
              {showInspector ? (
                <button className={`rail-toggle${railShow ? " is-active" : ""}`} type="button" data-sound="select" aria-expanded={railShow} aria-controls="context-rail" onClick={toggleRail}>上下文</button>
              ) : null}
              <button className="avatar-button" type="button" aria-label="打开个人菜单">G</button>
            </div>
          </div>

          {activeSpace === "home" || activeSpace === "knowledge" ? (
            <div className="tab-bar" role="tablist">
              {visibleTabs.map((tab) => (
                <div key={tab.id} className={`tab-chip${activeTabId === tab.id ? " is-active" : ""}`} role="tab" tabIndex={activeTabId === tab.id ? 0 : -1} data-sound="select" aria-selected={activeTabId === tab.id} onClick={() => setActiveTabId(tab.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveTabId(tab.id); } }}>
                  <span>{tab.label}</span>
                  <button type="button" data-sound="select" aria-label="关闭标签" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</button>
                </div>
              ))}
            </div>
          ) : null}

          <div className="workspace-content">
            <div className="main-column">
              {error ? <div className="feedback-banner error-message" role="alert">{error}</div> : null}
              {notice ? <div className="feedback-banner notice-message" aria-live="polite">{notice}</div> : null}
              {renderSpaceContent()}
            </div>
          </div>
        </section>
      }
      inspector={
        <InspectorHost
          visible={showInspector}
          hidden={railHidden}
          open={railOpen}
          onClose={hideRail}
          icons={renderInspectorIcons()}
        >
          {renderRail()}
        </InspectorHost>
      }
      mobileBottomNav={
        <nav className="mobile-bottom-nav" aria-label="移动端导航">
          {(["home", "knowledge", "graph", "agent", "settings"] as Space[]).map((space) => (
            <button key={space} className={space === "settings" ? (settingsOpen ? "is-active" : "") : (activeSpace === space ? "is-active" : "")} type="button" data-sound="select" onClick={() => openSpace(space)}>
              <span>{SPACE_META[space].shortLabel}</span>
            </button>
          ))}
          {showInspector ? (
            <button className={railOpen ? "is-active" : ""} type="button" data-sound="select" aria-expanded={railOpen} aria-controls="context-rail" onClick={toggleRail}><span>上下文</span></button>
          ) : null}
        </nav>
      }
      overlays={
        <>
          <SettingsDialog
            open={settingsOpen}
            section={settingsSection}
            archivedNotes={archivedNotes}
            onSelect={(next) => {
              setSettingsSection(next);
              clearFeedback();
            }}
            onRestoreNote={(note) => void handleArchiveNote(note, false)}
            onClose={() => setSettingsOpen(false)}
          />
          {contextMenu?.type === "raw" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">原始记录</div><div className="context-menu-title">{getPreview(contextMenu.raw.text, 62)}</div><button type="button" data-sound="press" onClick={() => { openRawTab(contextMenu.raw); setEditingRawId(contextMenu.raw.id); setRawTextDraft(contextMenu.raw.text); setContextMenu(null); }}>编辑原话</button><button type="button" data-sound="destructive" onClick={() => void handleDeleteRaw(contextMenu.raw)}>移除这条记录</button></div> : null}
          {contextMenu?.type === "knowledge-title" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">修订标题</div><div className="context-menu-title">{getPreview(contextMenu.knowledge.title, 62)}</div><button type="button" data-sound="press" onClick={() => { setEditingTitleId(contextMenu.knowledge.id); setTitleDraft(contextMenu.knowledge.title); setContextMenu(null); }}>修改标题</button></div> : null}
        </>
      }
    />
  );
}
