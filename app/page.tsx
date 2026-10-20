"use client";

import { useEffect,useMemo,useRef,useState } from "react";

import { AgentModelSelect } from "../components/agent-model-select";
import { AgentMessage } from "../components/agent/agent-message";
import { AgentStage } from "../components/agent/agent-stage";
import { CanvasWorkspace } from "../components/canvas-workspace";
import { DocumentSearch } from "../components/document-search";
import { DocumentSession } from "../components/document-session";
import { GraphView } from "../components/graph-view";
import { useInterfaceSound } from "../components/interface-sound";
import { LandingPage } from "../components/landing-page";
import { MarkdownEditor } from "../components/markdown-editor";
import { SchemaView } from "../components/schema-view";
import type { SettingsSection } from "../components/settings/sections";
import { SettingsDialog } from "../components/settings/settings-dialog";
import { AppShell } from "../components/shell/app-shell";
import { InspectorHost } from "../components/shell/inspector-host";
import { SPACE_META,type Space } from "../components/shell/spaces";
import {
AppLogo,
IconGraph,
IconHarp,
IconPen,IconSearch,
IconSettings
} from "../components/ui/icons";
import { WorkspaceTree } from "../components/workspace-tree";
import { ReadmeView } from "../components/readme-view";
import { makeMarkdown,readMarkdown,resolveReference,type LinkCandidate } from "../lib/documents/markdown";
import { AGENT_PERMISSIONS, type AgentPermission } from "../lib/agent/manual";
import { RAW_FOLDERS } from "../lib/documents/structure";

import { getPreview } from "../lib/text-preview";
import type { AgentRunTrace,AgentStep } from "../types/agent";
import type { GraphEdge,GraphNode } from "../types/graph";
import type { Knowledge } from "../types/knowledge";
import type { OrganizeDraft } from "../types/organize";
import type { Proposal } from "../types/proposal";
import type { Raw } from "../types/raw";

/**
 * 停笔多久就把这段原话收下（毫秒）。
 *
 * 2 秒是"停了一下"的尺度：连续打字时永远不会触发，不至于写到一半被切走；
 * 真停下来（写完一段、切去别的窗口）就自动收下并打开那篇笔记 —— 面板上没有
 * 「创建笔记」按钮了，这是它的替代品。
 */
const AUTO_SAVE_DELAY_MS = 2_000;

type ViewKey = "new-note" | "knowledge-index" | "agent" | "schema" | "readme" | "canvas";

type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };
type BootstrapPayload = { raws?: Raw[]; knowledges?: Knowledge[]; archivedKnowledges?: Knowledge[]; graph?: GraphData; proposals?: Proposal[] };

type MentionItem = { kind: "raw" | "knowledge"; id: string; label: string };

type Tab =
  | { id: string; kind: "view"; viewKey: ViewKey; label: string }
  | { id: string; kind: "raw"; rawId: string; label: string }
  | { id: string; kind: "knowledge"; knowledgeId: string; label: string }
  | { id: string; kind: "draft"; rawId: string; label: string };

const viewMeta: Record<ViewKey, { label: string; shortLabel: string }> = {
  "new-note": { label: "新建笔记", shortLabel: "新建" },
  "knowledge-index": { label: "知识页", shortLabel: "知识" },
  agent: { label: "Agent", shortLabel: "Agent" },
  schema: { label: "Schema", shortLabel: "Schema" },
  readme: { label: "readme", shortLabel: "readme" },
  canvas: { label: "canvas", shortLabel: "canvas" },
};

const NEW_NOTE_TAB: Tab = { id: "view:new-note", kind: "view", viewKey: "new-note", label: "新建笔记" };
const KNOWLEDGE_INDEX_TAB: Tab = { id: "view:knowledge-index", kind: "view", viewKey: "knowledge-index", label: "知识页" };

type ContentSpace = "home" | "knowledge";

function tabSpace(tab: Tab): ContentSpace | null {
  if (tab.kind === "raw" || tab.kind === "draft") return "home";
  if (tab.kind === "knowledge") return "knowledge";
  if (tab.kind === "view" && ["new-note", "schema", "readme", "canvas"].includes(tab.viewKey)) return "home";
  if (tab.kind === "view" && tab.viewKey === "knowledge-index") return "knowledge";
  return null;
}

function defaultTab(space: ContentSpace): Tab {
  return space === "home" ? NEW_NOTE_TAB : KNOWLEDGE_INDEX_TAB;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warning" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state-block"><span className="empty-index" aria-hidden="true">01</span><div><h3>{title}</h3><p>{body}</p>{action ? <div className="empty-action">{action}</div> : null}</div></div>;
}

export default function Home() {
  const { play } = useInterfaceSound();
  /** 每次载入都从产品介绍开始，用户选择后才进入工作区。 */
  const [entered, setEntered] = useState(false);
  const [activeSpace, setActiveSpace] = useState<Space>("home");
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("models");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openTabs, setOpenTabs] = useState<Tab[]>([NEW_NOTE_TAB, KNOWLEDGE_INDEX_TAB]);
  const [activeTabId, setActiveTabId] = useState(NEW_NOTE_TAB.id);
  const [text, setText] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const [raws, setRaws] = useState<Raw[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
  const documentCandidates: LinkCandidate[] = useMemo(() => [...raws.map(r => ({ id: r.id, title: r.title, path: r.path })), ...knowledges.map(n => ({ id: n.id, title: n.title, path: n.path }))], [raws, knowledges]);
  /** 已归档的知识页。归档不是删除，所以必须有一条读回来的路径。 */
  const [archivedNotes, setArchivedNotes] = useState<Knowledge[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [draft, setDraft] = useState<OrganizeDraft | null>(null);
  const [draftRawId, setDraftRawId] = useState<string | null>(null);
  const [selectedRelationIds, setSelectedRelationIds] = useState<string[]>([]);
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [aiMessage, setAiMessage] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [agentPermission, setAgentPermission] = useState<AgentPermission>("propose");
  /** 当前知识页上待确认的改写提议（`note_update`）。只活在界面上，真正的待办状态在库里。 */
  const [pendingProposals, setPendingProposals] = useState<Proposal[]>([]);
  const [conversation,setConversation]=useState<{role:"user"|"assistant";text:string}[]>([]);
  const [agentSessionId, setAgentSessionId] = useState<string>();
  const agentHistoryRef = useRef<HTMLDivElement>(null);
  const [proposalCards, setProposalCards] = useState<AgentStep[]>([]);
  const [sessionEnding, setSessionEnding] = useState(false);
  const gateLock = useRef(false);
  const runLock = useRef(false);
  const [gateBusy,setGateBusy]=useState<string|null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTarget, setMentionTarget] = useState<MentionItem | null>(null);
  const [, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingRaw, setIsCreatingRaw] = useState(false);
  const [organizingRawId, setOrganizingRawId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  /**
   * 侧栏默认**收起**：进来先看见正文，点顶栏的 C 再打开目录。
   * 收起时列宽由 `.app-shell.sidebar-collapsed` 真正收掉（56px 图标条），不是只藏内容。
   */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  /** 右栏（上下文面板）在 ≤860px 放不下，改为可开合的抽屉；这里记它的开合状态。 */
  const [railOpen, setRailOpen] = useState(false);
  const [railDrawer, setRailDrawer] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 860px)");
    const update = () => setRailDrawer(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  /**
   * 宽屏下右栏是常驻列，默认展开；`railHidden` 记它是不是被收起来了。
   *
   * 两个状态而不是一个：窄屏抽屉与宽屏常驻列的可见性由不同规则决定，
   * 按钮只翻转当前断点对应的状态，缩放窗口不会混用两种开合规则。
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

  useEffect(() => {
    const currentQuestion = agentHistoryRef.current?.querySelector<HTMLElement>('[data-current-agent-question="true"]');
    currentQuestion?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [conversation]);


  /** 被固定在落点的节点数量（拖动即固定），由 GraphView 回调上来供右栏显示。 */
  const [graphPinnedCount, setGraphPinnedCount] = useState(0);
  /** 最近一次 agent 整理的轨迹。只活在这个会话里——刷新即清，与"轨迹不落库"的约定一致。 */
  const [agentTrace, setAgentTrace] = useState<AgentRunTrace | null>(null);
  const [isAgentRunning, setIsAgentRunning] = useState(false);
  /** 每个提议门禁的本地状态：待定 / 已建立 / 已忽略。 */
  const [gateStates, setGateStates] = useState<Record<string, "pending" | "accepted" | "ignored" | "stale" | "failed">>({});
  const [gateErrors, setGateErrors] = useState<Record<string, string>>({});
  /** 自增一次就重新拉原始记录与知识页列表（确认提议后左栏需要跟上）。 */
  const [listRefresh, setListRefresh] = useState(0);
  const [contextMenu, setContextMenu] = useState<
    | { type: "raw"; raw: Raw; x: number; y: number }
    | { type: "knowledge-title"; knowledge: Knowledge; x: number; y: number }
    | null
  >(null);

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
        const response = await fetch("/api/bootstrap");
        const payload = (await response.json()) as BootstrapPayload;
        if (!response.ok) throw new Error("读取失败");
        if (!active) return;

        const nextRaws = payload.raws ?? [];
        setRaws(nextRaws);
        setKnowledges(payload.knowledges ?? []);
        setArchivedNotes(payload.archivedKnowledges ?? []);
        setGraph(payload.graph ?? { nodes: [], edges: [] });
        setPendingProposals(payload.proposals ?? []);
      } catch {
        if (active) setError("内容暂时没有载入。你的本地记录没有受到影响，请稍后重试。");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPageData();
    return () => { active = false; };
  }, [listRefresh, graphRefresh, agentTrace]);

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

  /**
   * 目录里那条原始记录叫什么。
   *
   * 旧数据没起名字时按**创建顺序**编号（未命名1、未命名2…）：不然目录里显示的是正文前几个字，
   * 一堆「课堂笔记、阅读摘录…」开头的条目分不清谁是谁。编号只在这里算，
   * `raw.title` 仍然是空的 —— 它确实还没有名字。
   */
  const unnamedNumbers = useMemo(() => {
    const numbers = new Map<string, number>();
    // 列表按创建时间倒序，翻过来才是"第一个没名字的" = 未命名1
    [...raws].reverse().forEach((raw) => {
      if (!raw.title?.trim()) numbers.set(raw.id, numbers.size + 1);
    });
    return numbers;
  }, [raws]);

  const rawLabel = (raw: Raw) => raw.title?.trim() || `未命名${unnamedNumbers.get(raw.id) ?? 1}`;

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const items: MentionItem[] = [
      // 用户给原始记录起过名字时优先用名字：不然按自己写的「错题」去找会搜不到，
      // 因为正文预览里根本没有这两个字。
      ...raws.map((r) => ({ kind: "raw" as const, id: r.id, label: getPreview(r.title || `未命名${unnamedNumbers.get(r.id) ?? 1}`, 24) })),
      ...knowledges.map((k) => ({ kind: "knowledge" as const, id: k.id, label: k.title })),
    ];
    return (q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items).slice(0, 8);
  }, [mentionQuery, raws, knowledges, unnamedNumbers]);

  // 搜索 + 孤立节点开关，在传给图谱前过滤（客户端即可，不涉及后端）
  const filteredGraph = useMemo(() => {
    const query = graphSearch.trim().toLowerCase();
    let nodes = graph.nodes;
    if (query) nodes = nodes.filter((node) => node.title.toLowerCase().includes(query));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
    return { nodes, edges };
  }, [graph.nodes, graph.edges, graphSearch]);

  useEffect(() => { const refresh = () => { setListRefresh(v => v + 1); setGraphRefresh(v => v + 1); }; window.addEventListener("chordnote-documents-changed",refresh); return () => window.removeEventListener("chordnote-documents-changed",refresh); }, []);
  useEffect(() => { const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && (e.key === "p" || e.key === "k")) { e.preventDefault(); setSearchOpen(v => !v); } }; window.addEventListener("keydown", key); return () => window.removeEventListener("keydown",key); }, []);
  function clearFeedback() {
    setError("");
    setNotice("");
  }

  /** 顶栏 / 底部导航的「上下文」按钮：窄屏开合抽屉，宽屏显示或收起右栏。 */
  function toggleRail() {
    if (railDrawer) setRailOpen((current) => !current);
    else setRailHidden((current) => !current);
  }

  /** 右栏自己的收起按钮：两种断点下都是"把它收掉"这一个意思。 */
  function hideRail() {
    setRailOpen(false);
    setRailHidden(true);
  }

  /**
   * 切换一级空间。
   *
   * Home 保留原始记录相关标签，Knowledge 保留知识页与图谱标签。
   * 两边使用同一套标签组件，但不会把另一空间的内容带进来。
   */
  function openSpace(space: Space) {
    if (space === "agent") { toggleRail(); return; }
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
    if (view === "new-note") {
      void createNewRaw();
      return;
    }
    if (view === "agent") {
      openSpace("agent");
      return;
    }

    openTab({ id: `view:${view}`, kind: "view", viewKey: view, label: viewMeta[view].label });
  }

  /** A click on New Note must create a server-backed Raw document before opening it. */
  async function createNewRaw() {
    if (isCreatingRaw) return;
    clearFeedback();
    setIsCreatingRaw(true);
    try {
      const response = await fetch("/api/raw/new", { method: "POST" });
      const payload = (await response.json()) as { raw?: Raw; error?: { message?: string } };
      if (!response.ok || !payload.raw) throw new Error(payload.error?.message ?? "新笔记暂时无法建立。请稍后重试。");
      setRaws((current) => [payload.raw as Raw, ...current]);
      openRawTab(payload.raw);
      play("success");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "新笔记暂时无法建立。请稍后重试。");
    } finally {
      setIsCreatingRaw(false);
    }
  }

  function openRawTab(raw: Raw) {
    // 标签名与左栏用同一个口径：旧数据没起名字时显示「未命名N」。
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
      setText("");
      setNoteTitle("");
      openRawTab(created);
      setNotice("");
      play("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "这条笔记暂时没有保存。内容仍在输入框中，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
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
    if (!onNewNoteView || !text.replace(/^#\s*/, "").trim() || isSaving) return;

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
      setNotice("这条原始记录已移除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "这条原始记录暂时无法移除。其他内容没有受到影响，请稍后重试。");
    }
  }

  async function handleOrganize(rawId: string) {
    clearFeedback();
    setDraft(null);
    setDraftRawId(rawId);
    setSelectedRelationIds([]);
    setOrganizingRawId(rawId);

    try { await runAgentOrganize({ question: agentPermission === "full" ? "请检索现有知识后整理这条原始记录，用 draft_knowledge 直接收录知识页并分类来源；保留 wikilink。" : "请检索现有知识后整理这条原始记录，用 draft_knowledge 提出待确认整理稿；保留 wikilink。",contextType:"raw",contextId:rawId }); }
    finally { setOrganizingRawId(null); }
  }

  async function handleConfirm() {
    if (!draft || !draftRawId) return;
    clearFeedback();
    setIsConfirming(true);

    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawId: draftRawId, draft, origin: "ai" }),
      });
      const payload = (await response.json()) as { knowledge?: Knowledge; raw?: Raw; created?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.knowledge) throw new Error(payload.error?.message ?? "整理稿暂时无法收录。它仍保留在当前页面，请稍后重试。");
      if (payload.raw) setRaws(current => current.map(raw => raw.id === payload.raw!.id ? payload.raw! : raw));

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
    if(runLock.current || sessionEnding)return;
    runLock.current = true;
    setIsAgentRunning(true);
    setAiQuestion("");
    setConversation(current=>[...current,{role:"user" as const,text:String(body.question ?? "整理笔记")}].slice(-40));
    setAiMessage("");

    try {
      const response = await fetch("/api/agent/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({...body,sessionId:agentSessionId,permission:agentPermission}),
      });
      const payload = (await response.json()) as {
        trace?: AgentRunTrace;
        error?: { message?: string };
      };

      if (!response.ok || !payload.trace) {
        throw new Error(payload.error?.message ?? "这次整理暂时没有完成。你的内容仍然安全，请稍后重试。");
      }

      setAgentTrace(payload.trace);
      setProposalCards(current => [...new Map([...current, ...payload.trace!.steps.filter(s => s.kind === "gate" && s.proposalId)].map(s => [s.proposalId, s])).values()]);
      setAgentSessionId(payload.trace.sessionId);
      setConversation(current=>[...current,{role:"assistant" as const,text:payload.trace!.message}].slice(-40));
      if (payload.trace.draft) { setDraft(payload.trace.draft.value); setDraftRawId(payload.trace.draft.rawId); openDraftTab(payload.trace.draft.rawId); }
      const savedKnowledge = payload.trace.steps.findLast(step => step.tool === "draft_knowledge" && step.status === "done")?.payload?.knowledge as Knowledge | undefined;
      if (savedKnowledge) {
        setKnowledges(current => [savedKnowledge, ...current.filter(note => note.id !== savedKnowledge.id)]);
        openKnowledgeTab(savedKnowledge);
      }
      setGraphRefresh(current => current + 1);
      setRailHidden(false);
    } catch (agentError) {
      setAiMessage(
        agentError instanceof Error
          ? agentError.message
          : "这次整理暂时没有完成。你的内容仍然安全，请稍后重试。",
      );
    } finally {
      runLock.current = false;
      setIsAgentRunning(false);
      setListRefresh(current => current + 1);
    }
  }

  async function endAgentSession() {
    if (runLock.current || sessionEnding) return;
    setSessionEnding(true);
    try {
      if (agentSessionId) {
        const response = await fetch("/api/agent/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: agentSessionId }) });
        if (!response.ok && response.status !== 404) throw new Error("会话暂时无法结束，请稍后重试。");
      }
      setAgentSessionId(undefined);
      setConversation([]);
      setAgentTrace(null);
      setProposalCards([]);
      setGateStates({});
      setGateErrors({});
      setAiQuestion("");
      setMentionQuery(null);
      setMentionTarget(null);
      setAiMessage("新对话已开始。");
    } catch (error) { setAiMessage(error instanceof Error ? error.message : "会话暂时无法结束。"); }
    finally { setSessionEnding(false); }
  }

  /** 确认一条提议：先批准、再执行。两步都是用户主体发起的写入。 */
  async function handleGateAccept(step: AgentStep, batch = false) {
    const proposalId = step.proposalId;

    if (!proposalId || (gateLock.current && !batch)) return false;
    setProposalCards(cards => cards.some(card => card.proposalId === proposalId) ? cards : [...cards, step]);
    if (!batch) gateLock.current = true;
    setGateBusy(proposalId);
    setGateErrors(errors => { const next = { ...errors }; delete next[proposalId]; return next; });
    try {
      const currentResponse = await fetch(`/api/proposals/${proposalId}`);
      const current = await currentResponse.json() as { proposal?: Proposal };
      if (!currentResponse.ok || !current.proposal) throw new Error("提议已不存在，请刷新。");
      if (current.proposal.status === "applied") { setGateStates(states => ({ ...states, [proposalId]: "accepted" })); return true; }
      const approved = current.proposal.status === "approved" ? null : await fetch(`/api/proposals/${proposalId}/approve`, { method: "POST" });

      if (approved && !approved.ok) {
        const payload = (await approved.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "这条提议暂时无法批准。");
      }

      const applied = await fetch(`/api/proposals/${proposalId}/apply`, {
        method: "POST",
        // 与 proposals.status 的状态检查构成双保险，重复点也不会执行两次
        headers: { "Idempotency-Key": `${proposalId}-apply` },
      });

      if (!applied.ok) {
        const payload = (await applied.json()) as { error?: { message?: string; code?: string } };
        if (payload.error?.code === "PROPOSAL_TARGET_STALE") setGateStates(current => ({ ...current, [proposalId]: "stale" }));
        throw new Error(payload.error?.message ?? "这条提议暂时无法执行。");
      }

      setGateStates(current => ({...current,[proposalId]:"accepted"}));
      setNotice("提议已应用。");
      // 目标是知识网络/原始记录，两个列表都刷新一次让左栏与图谱跟上
      setGraphRefresh((current) => current + 1);
      setListRefresh((current) => current + 1);
      return true;
    } catch (gateError) {
      const current = await fetch(`/api/proposals/${proposalId}`).then(r => r.json()).catch(() => null);
      const status = current?.proposal?.status;
      if (["stale", "failed", "applied", "rejected"].includes(status)) setGateStates(states => ({ ...states, [proposalId]: status === "applied" ? "accepted" : status === "rejected" ? "ignored" : status }));
      setGateErrors(errors => ({ ...errors, [proposalId]: gateError instanceof Error ? gateError.message : "暂时无法执行" }));
      setError(gateError instanceof Error ? gateError.message : "这条提议暂时无法执行。");
      return false;
    } finally { if (!batch) { gateLock.current = false; setGateBusy(null); } setListRefresh(current=>current+1); }
  }

  async function acceptAll(steps: AgentStep[]) {
    if (gateLock.current) return;
    gateLock.current = true;
    let count = 0;
    try { for (const step of steps) if (await handleGateAccept(step, true)) count++; }
    finally { gateLock.current = false; setGateBusy(null); setNotice(`已应用 ${count} 项；${steps.length - count} 项未应用，请查看对应卡片。`); }
  }

  async function handleGateIgnore(step: AgentStep) {
    const proposalId = step.proposalId;

    if (!proposalId || gateLock.current) return;
    setProposalCards(cards => cards.some(card => card.proposalId === proposalId) ? cards : [...cards, step]);
    gateLock.current = true;
    setGateBusy(proposalId);
    setGateErrors(errors => { const next = { ...errors }; delete next[proposalId]; return next; });

    try {
      const response = await fetch(`/api/proposals/${proposalId}/reject`, { method: "POST" });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: { message?: string } };
        throw new Error(payload.error?.message ?? "这条提议暂时无法忽略。");
      }
      setGateStates(current => ({...current,[proposalId]:"ignored"}));
      setListRefresh(current=>current+1);
    } catch (gateError) {
      setGateStates((current) => ({ ...current, [proposalId]: "pending" }));
      setError(gateError instanceof Error ? gateError.message : "这条提议暂时无法忽略。");
    } finally { gateLock.current = false; setGateBusy(null); setListRefresh(current=>current+1); }
  }

  async function handleAskAssistant(question: string) {
    if (!question.trim()) {
      setAiMessage("先写下问题，我会依据你选择的材料提出看法。");
      return;
    }
    setAiMessage("");

    const body = mentionTarget
      ? { question, contextType: mentionTarget.kind, contextId: mentionTarget.id }
      : activeTab?.kind === "knowledge" && selectedKnowledge
        ? { question, contextType: "knowledge" as const, contextId: selectedKnowledge.id }
        : activeTab?.kind === "draft" && draft
          ? { question, contextType: "draft" as const, draftContext: `${draft.title}\n\n${draft.summary}\n\n${draft.content}` }
          : activeTab?.kind === "raw"
            ? { question, contextType: "raw" as const, contextId: activeTab.rawId }
            : { question, contextType: "none" as const };

    setMentionTarget(null);
    setRailHidden(false);
    await runAgentOrganize(body);
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
    return <section className="document-session"><MarkdownEditor value={text || "# \n\n"} candidates={documentCandidates}
      onOpenLink={target => void openDocumentLink(target)} onChange={next => { setText(next); setNoteTitle(readMarkdown(next).properties.title); }} />
      <div className="document-status" role="status">{isSaving ? "保存中" : ""}</div></section>;
  }
  function renderNewNote() { return renderCaptureForm(); }

  function renderDraftReview() {
    if (!draft) return null;
    return <section className="document-session">
      <div className="review-header"><StatusPill tone="warning">待确认</StatusPill><label className="review-source-category">来源分类<select aria-label="来源分类" value={draft.rawCategory ?? "articles"} onChange={event => setDraft({ ...draft, rawCategory: event.target.value as OrganizeDraft["rawCategory"] })}>{RAW_FOLDERS.map(folder => <option key={folder} value={folder}>{folder}</option>)}</select></label></div>
      <MarkdownEditor value={makeMarkdown(draft.title, draft.content, { description: draft.summary, tags: draft.keywords })} candidates={documentCandidates}
        onOpenLink={target => void openDocumentLink(target)} onChange={next => {
          const parsed = readMarkdown(next);
          setDraft({ ...draft, title: parsed.properties.title, content: next, summary: parsed.properties.description, keywords: parsed.properties.tags });
        }} />
      {draft.relatedKnowledge.length > 0 ? <fieldset className="relation-suggestions"><legend>建议关联</legend>{draft.relatedKnowledge.map((suggestion) => <label className="relation-option" key={suggestion.knowledgeId}><input type="checkbox" checked={selectedRelationIds.includes(suggestion.knowledgeId)} onChange={(event) => setSelectedRelationIds((current) => event.target.checked ? [...current, suggestion.knowledgeId] : current.filter((id) => id !== suggestion.knowledgeId))} /><span><strong>{suggestion.knowledgeId}</strong><small>{suggestion.reason}</small></span></label>)}</fieldset> : null}
      <div className="review-actions"><button className="button-dark" type="button" data-sound="press" onClick={() => void handleConfirm()} disabled={isConfirming}>{isConfirming ? "正在收录" : "确认并收录"}</button><button className="button-secondary" type="button" data-sound="select" onClick={() => { if (draftRawId) closeTab(`draft:${draftRawId}`); setDraft(null); setDraftRawId(null); setSelectedRelationIds([]); setNotice("整理稿暂未采用，没有创建知识页。"); }} disabled={isConfirming}>暂不采用</button></div>
    </section>;
  }

  function documentSaved(updated: Raw | Knowledge) {
    if ("rawId" in updated) setKnowledges(current => current.map(item => item.id === updated.id ? updated : item));
    else setRaws(current => current.map(item => item.id === updated.id ? updated : item));
    setOpenTabs(current => current.map(tab => tab.id === `raw:${updated.id}` || tab.id === `knowledge:${updated.id}` ? { ...tab, label: updated.title || "未命名" } : tab));
    setGraphRefresh(current => current + 1);
  }
  async function openDocumentLink(target: string) {
    try {
    const found = resolveReference(target, documentCandidates);
    if (!found) {
      const response = await fetch("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target }) });
      const payload = await response.json();
      if (!response.ok) { setError(payload.error?.message ?? "无法创建链接目标"); return; }
      const doc = payload.document;
      setListRefresh(current => current + 1);
      if (doc.kind === "knowledge") { const note = knowledges.find(n => n.id === doc.id); if (note) openKnowledgeTab(note); }
      else { setRaws(current => current.some(r => r.id === doc.id) ? current : [doc, ...current]); openRawTab(doc); }
      return;
    }
    const note = knowledges.find(n => n.id === found!.id);
    if (note) openKnowledgeTab(note);
    else { const raw = raws.find(r => r.id === found!.id); if (raw) openRawTab(raw); }
    } catch (e) { setError(e instanceof Error ? e.message : "链接暂时无法打开"); }
  }
  function renderRawTab(rawId: string) {
    const raw = raws.find(r => r.id === rawId);
    return raw ? <DocumentSession key={raw.id} document={raw} kind="raw" candidates={documentCandidates} onOpenLink={target => void openDocumentLink(target)} onSaved={documentSaved} /> : null;
  }
  function renderKnowledgeTab(knowledgeId: string) {
    const note = knowledges.find(n => n.id === knowledgeId);
    return note ? <DocumentSession key={note.id} document={note} kind="knowledge" candidates={documentCandidates} onOpenLink={target => void openDocumentLink(target)} onSaved={documentSaved} /> : null;
  }

  function renderKnowledgeIndex() {
    return <>
      <header className="workspace-heading compact-heading">
        <div>
          <h1>wiki</h1>
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
          <h1>知识图谱</h1>
        </div>
        <input aria-label="搜索图谱" placeholder="搜索" value={graphSearch} onChange={e=>setGraphSearch(e.target.value)} />
        <details className="graph-options"><summary>图谱设置</summary>{([
          ["nodeSize","节点大小",0.5,2,0.1],["lineWidth","连线粗细",0.5,3,0.1],["centerForce","中心引力",0,1,0.05],
          ["repelForce","节点斥力",50,800,10],["linkForce","连线引力",0,1,0.05],["linkDist","连线长度",40,240,4]
        ] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input type="range" min={min} max={max} step={step} value={graphParams[key]} onChange={e=>setGraphParams(p=>({...p,[key]:Number(e.target.value)}))}/></label>)}<span>已固定 {graphPinnedCount}</span></details>
      </header>
      {graph.nodes.length === 0
        ? <EmptyState title="知识网络还没有内容" body="确认并收录第一张知识页后，它会从这里开始生长。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>留下原话</button>} />
        : <>
          {filteredGraph.nodes.length === 0 ? <p className="muted-note" style={{ marginBottom: 10 }}>没有匹配「{graphSearch}」的知识页。</p> : null}
      <GraphView nodes={filteredGraph.nodes} edges={filteredGraph.edges} params={graphParams} onOpenNote={(nodeId) => void handleGraphNodeClick(nodeId)} onPinnedChange={setGraphPinnedCount} />
        </>}
    </>;
  }

  function renderAgentStep(step: AgentStep) {
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


      </div>
    </li>;
  }
  function renderRail() {
    const currentRaw = activeTab.kind === "raw" ? raws.find(r => r.id === activeTab.rawId) : null;
    const cards: AgentStep[] = [...new Map([...proposalCards, ...pendingProposals.map(p => ({
      index: 0, tool: p.kind === "schema_preferences" ? "propose_preferences" : p.kind === "note_update" ? "propose_update" : p.kind === "link_create" ? "propose_link" : "propose_source",
      label: p.kind === "schema_preferences" ? "更新用户偏好" : p.kind === "note_update" ? "更新笔记" : p.kind === "link_create" ? "建立关联" : "保存原始记录",
      hint: null, kind: "gate" as const, status: "pending" as const, detail: p.reason ?? "", proposalId: p.id, payload: p.payload,
    }))].map(step => [step.proposalId, step])).values()];
    const actionable = cards.filter(step => !gateStates[step.proposalId!] || gateStates[step.proposalId!] === "pending");
    const gateLabels = { pending: "待确认", accepted: "已应用", ignored: "已拒绝", stale: "内容已变化，请重新生成提议", failed: "应用失败，请重新生成提议" };
    const currentQuestionIndex = conversation.reduce((last, message, index) => message.role === "user" ? index : last, -1);
    return <div className="agent-chat">
      <header className="agent-chat-head"><IconHarp /><span>Agent</span><button className="agent-new-session" disabled={isAgentRunning || sessionEnding} onClick={() => void endAgentSession()}>新会话</button><button onClick={hideRail} aria-label="关闭 Agent">×</button></header>
      <div className="agent-chat-history" aria-live="polite" ref={agentHistoryRef}>
        <AgentStage mode={isAgentRunning ? "work" : "rest"} />
        {isAgentRunning ? <p role="status">正在处理…</p> : null}
        {aiMessage ? <p>{aiMessage}</p> : null}
        {conversation.map((message,i)=><div className="agent-conversation-message" data-current-agent-question={i === currentQuestionIndex ? "true" : undefined} key={i}><AgentMessage role={message.role} text={message.text} candidates={documentCandidates} onOpenLink={target => void openDocumentLink(target)} /></div>)}
        {agentTrace ? <details><summary>运行过程</summary><ol className="agent-step-list">{agentTrace.steps.map(renderAgentStep)}</ol></details> : null}
        {actionable.length > 0 ? <p className="muted-note agent-proposal-heading">待确认提议</p> : null}
        {actionable.length > 1 ? <button className="text-button" disabled={gateBusy !== null} onClick={() => void acceptAll(actionable)}>确认应用全部 {actionable.length} 项</button> : null}
        {cards.map(step => <article className="agent-proposal" key={step.proposalId}>
          <b>{step.label} · {String(step.payload?.targetTitle ?? step.payload?.noteId ?? step.payload?.title ?? (step.tool === "propose_preferences" ? "Schema · 用户偏好" : "知识库"))}</b><p>{step.detail}</p>
          {typeof step.payload?.evidence === "string" ? <blockquote>你的原话：{step.payload.evidence}</blockquote> : null}
          {typeof step.payload?.content === "string" ? <details><summary>查看修改内容</summary><pre>{step.payload.content}</pre></details> : null}
          {gateErrors[step.proposalId!] ? <p role="status">{gateErrors[step.proposalId!]}</p> : null}
          {gateStates[step.proposalId!] && gateStates[step.proposalId!] !== "pending" ? <span>{gateLabels[gateStates[step.proposalId!]]}</span> : <div className="review-actions"><button disabled={gateBusy !== null} onClick={() => void handleGateAccept(step)}>确认应用</button>{pendingProposals.some(p=>p.id===step.proposalId && p.status==="approved") ? null : <button disabled={gateBusy !== null} onClick={() => void handleGateIgnore(step)}>拒绝</button>}</div>}
        </article>)}
        {currentRaw && agentPermission !== "read" ? <button className="text-button" disabled={organizingRawId !== null} onClick={() => void handleOrganize(currentRaw.id)}>{organizingRawId ? "整理中…" : agentPermission === "full" ? "整理并收录" : "提出整理稿"}</button> : null}
      </div>
      <form className="agent-composer" onSubmit={e => { e.preventDefault(); void handleAskAssistant(aiQuestion); }}>
        {mentionQuery !== null ? <div className="mention-menu">{mentionCandidates.map(item => <button key={item.id} type="button" onClick={() => pickMention(item)}>{item.label}</button>)}</div> : null}
        <textarea
          aria-label="与 Agent 对话"
          placeholder="输入问题，@ 提及笔记"
          value={aiQuestion}
          onChange={e => handleQuestionChange(e.target.value)}
          onKeyDown={event => {
            // Enter 发送，Shift+Enter 保留换行；中文输入法确认候选时不抢 Enter。
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (!isAgentRunning && !sessionEnding && aiQuestion.trim()) void handleAskAssistant(aiQuestion);
            }
          }}
          rows={3}
        />
        <div className="composer-actions">
          <details className="composer-permission">
            <summary aria-label="AI 权限" title={`AI 权限：${AGENT_PERMISSIONS.find(item => item.id === agentPermission)?.label}`}>＋</summary>
            <div className="permission-menu" role="menu">
              {AGENT_PERMISSIONS.map(item => (
                <button key={item.id} type="button" role="menuitemradio" aria-checked={agentPermission === item.id} className={agentPermission === item.id ? "is-active" : ""} onClick={event => { setAgentPermission(item.id); event.currentTarget.closest("details")?.removeAttribute("open"); }}>
                  <b>{item.label}</b><small>{item.hint}</small>
                </button>
              ))}
            </div>
          </details>
          <div className="composer-send"><AgentModelSelect /><button type="submit" disabled={isAgentRunning || sessionEnding || !aiQuestion.trim()}>发送</button></div>
        </div>
      </form>
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
          case "agent": return null;
          case "schema": return <SchemaView />;
          case "readme": return <ReadmeView />;
          case "canvas": return <CanvasWorkspace onOpen={id => { const n = knowledges.find(n => n.id === id); if (n) openKnowledgeTab(n); else { const r = raws.find(r => r.id === id); if (r) openRawTab(r); } }} />;
        }
    }
  }

  function renderSpaceContent() {
    if (activeSpace === "graph") return renderGraph();

    return renderMainContent();
  }

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? openTabs[0] ?? NEW_NOTE_TAB;
  const visibleTabs = activeSpace === "home" || activeSpace === "knowledge"
    ? openTabs.filter((tab) => tabSpace(tab) === activeSpace)
    : [];

  /**
   * 右栏此刻是否可见：宽屏看「有没有被收起来」，窄屏看抽屉状态。
   */
  const railShow = railDrawer ? railOpen : !railHidden;
  const showInspector = true;
  const breadcrumbLabel =
    activeSpace === "home" || activeSpace === "knowledge"
      ? activeTab.label
      : SPACE_META[activeSpace].label;

  if (!entered) {
    return (
      <LandingPage
        onEnter={() => {
          setEntered(true);
        }}
      />
    );
  }

  return (
    <AppShell
      ribbon={<nav className="workspace-ribbon" aria-label="工作区入口">
        <button className="ribbon-logo" aria-label="打开或关闭左侧栏" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(v => !v)}>C</button>
        <button aria-label="查找笔记" title="查找笔记" onClick={() => setSearchOpen(true)}><IconSearch /></button>
        <button aria-label="知识图谱" title="知识图谱" onClick={() => openSpace("graph")}><IconGraph /></button>
        <button aria-label="白板 canvas" title="白板 canvas" onClick={() => navigate("canvas")}><IconPen /></button>
        <button aria-label="Agent" title="Agent" onClick={toggleRail}><IconHarp /></button>
        <button className="ribbon-settings" aria-label="打开设置" title="设置" onClick={() => openSpace("settings")}><IconSettings /></button>
      </nav>}
      sidebarOpen={sidebarOpen}
      railHidden={!railShow}
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
          <WorkspaceTree raws={raws} notes={knowledges} archivedNotes={archivedNotes} rawLabel={rawLabel} onRaw={openRawTab} onNote={openKnowledgeTab} onView={navigate}
            onRawMenu={(raw,x,y) => setContextMenu({ type:"raw", raw,x,y })} onNoteMenu={(knowledge,x,y) => setContextMenu({ type:"knowledge-title", knowledge,x,y })} />
        </aside>
      }
      main={
        <section className="workspace-main">
          <div className="workspace-topbar">
            <div className="breadcrumb"><span>Chordnote</span><span aria-hidden="true">/</span><strong>{breadcrumbLabel}</strong></div>
            <div className="topbar-actions">
              {showInspector ? (
                <button className={`rail-toggle${railShow ? " is-active" : ""}`} type="button" data-sound="select" aria-expanded={railShow} aria-controls="context-rail" onClick={toggleRail} aria-label="打开或关闭 Agent"><IconHarp /></button>
              ) : null}

            </div>
          </div>

          {activeSpace === "home" || activeSpace === "knowledge" ? (
            <div className="tab-bar" role="tablist">
              {visibleTabs.map((tab) => (
                <div key={tab.id} className={`tab-chip${activeTabId === tab.id ? " is-active" : ""}`} role="tab" tabIndex={activeTabId === tab.id ? 0 : -1} data-sound="select" aria-selected={activeTabId === tab.id} onClick={() => { setActiveTabId(tab.id); setRailOpen(false); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveTabId(tab.id); setRailOpen(false); } }}>
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
          hidden={!railShow}
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
        </nav>
      }
      overlays={
        <>
          {searchOpen ? <DocumentSearch documents={[...raws, ...knowledges]} onClose={() => setSearchOpen(false)} onOpen={id => { const n = knowledges.find(n => n.id === id); if (n) openKnowledgeTab(n); else { const r = raws.find(r => r.id === id); if (r) openRawTab(r); } }} /> : null}
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
          {contextMenu?.type === "raw" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">原始记录</div><div className="context-menu-title">{getPreview(contextMenu.raw.text, 62)}</div><button type="button" data-sound="press" onClick={() => { openRawTab(contextMenu.raw); setContextMenu(null); }}>编辑原话</button><button type="button" data-sound="destructive" onClick={() => void handleDeleteRaw(contextMenu.raw)}>移除这条记录</button></div> : null}
          {contextMenu?.type === "knowledge-title" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">修订标题</div><div className="context-menu-title">{getPreview(contextMenu.knowledge.title, 62)}</div><button type="button" data-sound="press" onClick={() => { openKnowledgeTab(contextMenu.knowledge); setContextMenu(null); }}>打开</button><button type="button" onClick={() => { void handleArchiveNote(contextMenu.knowledge,true); setContextMenu(null); }}>归档</button></div> : null}
        </>
      }
    />
  );
}
