"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  SoundToggle,
  useInterfaceSound,
} from "../components/interface-sound";
import { LandingPage } from "../components/landing-page";

import type { GraphEdge, GraphNode } from "../types/graph";
import type { Knowledge } from "../types/knowledge";
import type { OrganizeDraft } from "../types/organize";
import type { Raw } from "../types/raw";

const MAX_RAW_LENGTH = 50_000;
const AI_SETTINGS_STORAGE_KEY = "ai-notes.deepseek-settings";
const DEFAULT_AI_MODEL = "deepseek-chat";
const AI_MODEL_PRESETS = [
  { value: "deepseek-chat", label: "DeepSeek Chat" },
  { value: "deepseek-reasoner", label: "DeepSeek Reasoner" },
];

type ViewKey = "new-note" | "graph" | "settings";

type GraphData = { nodes: GraphNode[]; edges: GraphEdge[] };
type KnowledgeListPayload = { knowledges?: Knowledge[] };
type GraphPayload = { nodes?: GraphNode[]; edges?: GraphEdge[] };

type MentionItem = { kind: "knowledge"; id: string; label: string };

type StoredAiSettings = {
  model: string;
};

type Tab =
  | { id: string; kind: "view"; viewKey: ViewKey; label: string }
  | { id: string; kind: "knowledge"; knowledgeId: string; label: string }
  | { id: string; kind: "draft"; rawId: string; label: string };

const viewMeta: Record<ViewKey, { label: string; shortLabel: string }> = {
  "new-note": { label: "新建笔记", shortLabel: "新建" },
  graph: { label: "笔记网络", shortLabel: "网络" },
  settings: { label: "设置", shortLabel: "设置" },
};

const directNavViews: ViewKey[] = ["new-note", "graph"];

const NEW_NOTE_TAB: Tab = { id: "view:new-note", kind: "view", viewKey: "new-note", label: "新建笔记" };

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

function getPreview(text: string, length = 140) {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
}

function AppLogo() {
  return <div className="app-logo" aria-label="AI Notes"><span className="logo-mark" aria-hidden="true">AN</span><span>AI Notes</span></div>;
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "accent" | "warning" }) {
  return <span className={`status-pill status-${tone}`}>{children}</span>;
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return <div className="empty-state-block"><span className="empty-index" aria-hidden="true">01</span><div><h3>{title}</h3><p>{body}</p>{action ? <div className="empty-action">{action}</div> : null}</div></div>;
}

export default function Home() {
  const { play } = useInterfaceSound();
  const [showLanding, setShowLanding] = useState(true);
  const [openTabs, setOpenTabs] = useState<Tab[]>([NEW_NOTE_TAB]);
  const [activeTabId, setActiveTabId] = useState(NEW_NOTE_TAB.id);
  const [text, setText] = useState("");
  const [raws, setRaws] = useState<Raw[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] });
  const [selectedKnowledge, setSelectedKnowledge] = useState<Knowledge | null>(null);
  const [draft, setDraft] = useState<OrganizeDraft | null>(null);
  const [draftRawId, setDraftRawId] = useState<string | null>(null);
  const [selectedRelationIds, setSelectedRelationIds] = useState<string[]>([]);
  const [graphRefresh, setGraphRefresh] = useState(0);
  const [aiMessage, setAiMessage] = useState("");
  const [aiQuestion, setAiQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTarget, setMentionTarget] = useState<MentionItem | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<"knowledge", boolean>>({ knowledge: true });
  const [, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [organizingRawId, setOrganizingRawId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [hasLocalAiSettings, setHasLocalAiSettings] = useState(false);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiModel, setAiModel] = useState(DEFAULT_AI_MODEL);
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [aiModelDraft, setAiModelDraft] = useState(DEFAULT_AI_MODEL);
  const [contextMenu, setContextMenu] = useState<
    | { type: "knowledge-title"; knowledge: Knowledge; x: number; y: number }
    | null
  >(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingField, setEditingField] = useState<{ knowledgeId: string; field: "summary" | "content" | "concepts" } | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
      if (!stored) return;

      const parsed = JSON.parse(stored) as Partial<StoredAiSettings>;
      if (typeof parsed.model !== "string" || !parsed.model.trim()) {
        window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
        return;
      }

      // 清理旧版本曾写入同一 localStorage 项的 API Key，避免继续长期留存。
      window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify({ model: parsed.model.trim() }));
      setHasLocalAiSettings(true);
      setAiModel(parsed.model.trim());
      setAiModelDraft(parsed.model.trim());
    } catch {
      window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
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
      } catch {
        if (active) setError("内容暂时没有载入。你的本地记录没有受到影响，请稍后重试。");
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void loadPageData();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;

    async function loadGraph() {
      try {
        const response = await fetch("/api/graph");
        const payload = (await response.json()) as GraphPayload;
        if (!response.ok) throw new Error("知识网络读取失败");
        if (active) setGraph({ nodes: payload.nodes ?? [], edges: payload.edges ?? [] });
      } catch {
        if (active) setError("笔记网络暂时没有载入。已保存的内容仍然安全，请稍后重试。");
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

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const items: MentionItem[] = knowledges.map((knowledge) => ({
      kind: "knowledge" as const,
      id: knowledge.id,
      label: knowledge.title,
    }));
    return (q ? items.filter((item) => item.label.toLowerCase().includes(q)) : items).slice(0, 8);
  }, [mentionQuery, knowledges]);

  const nodeTitleById = useMemo(() => {
    const map = new Map<string, string>();
    graph.nodes.forEach((node) => map.set(node.id, node.title));
    knowledges.forEach((knowledge) => {
      if (!map.has(knowledge.id)) map.set(knowledge.id, knowledge.title);
    });
    return map;
  }, [graph.nodes, knowledges]);

  function clearFeedback() {
    setError("");
    setNotice("");
  }

  function openTab(tab: Tab) {
    setOpenTabs((current) => current.some((item) => item.id === tab.id) ? current : [...current, tab]);
    setActiveTabId(tab.id);
    setMobileNavOpen(false);
    clearFeedback();
  }

  function closeTab(id: string) {
    setOpenTabs((current) => {
      const next = current.filter((tab) => tab.id !== id);
      if (activeTabId === id) {
        const closedIndex = current.findIndex((tab) => tab.id === id);
        const fallback = next[closedIndex - 1] ?? next[0] ?? NEW_NOTE_TAB;
        setActiveTabId(fallback.id);
      }
      return next.length > 0 ? next : [NEW_NOTE_TAB];
    });
  }

  function navigate(view: ViewKey) {
    openTab({ id: `view:${view}`, kind: "view", viewKey: view, label: viewMeta[view].label });
  }

  function openKnowledgeTab(knowledge: Knowledge) {
    setSelectedKnowledge(knowledge);
    openTab({ id: `knowledge:${knowledge.id}`, kind: "knowledge", knowledgeId: knowledge.id, label: getPreview(knowledge.title, 18) });
  }

  function openDraftTab(rawId: string) {
    openTab({ id: `draft:${rawId}`, kind: "draft", rawId, label: "审阅 AI 建议" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!text.trim()) {
      setError("先写下一段内容，再保存笔记。");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const payload = (await response.json()) as { raw?: Raw; knowledge?: Knowledge; error?: { message?: string } };
      if (!response.ok || !payload.raw || !payload.knowledge) throw new Error(payload.error?.message ?? "这条笔记暂时没有保存。请稍后重试。");
      setRaws((current) => [payload.raw!, ...current]);
      setKnowledges((current) => [payload.knowledge!, ...current]);
      setGraphRefresh((current) => current + 1);
      setText("");
      openKnowledgeTab(payload.knowledge);
      setNotice("笔记已保存。你可以继续编辑，或让编辑助理提出建议。");
      play("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "这条笔记暂时没有保存。内容仍在输入框中，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeleteKnowledge(knowledge: Knowledge) {
    setContextMenu(null);
    if (!window.confirm(`确定删除这条笔记吗？\n\n${getPreview(knowledge.title, 100)}`)) return;

    clearFeedback();
    try {
      const response = await fetch(`/api/knowledge/${knowledge.id}`, { method: "DELETE" });
      const payload = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? "这条笔记暂时无法删除。请稍后重试。");
      setKnowledges((current) => current.filter((item) => item.id !== knowledge.id));
      setSelectedKnowledge((current) => current?.id === knowledge.id ? null : current);
      setGraphRefresh((current) => current + 1);
      closeTab(`knowledge:${knowledge.id}`);
      setNotice("笔记已删除。");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "这条笔记暂时无法删除。原有内容没有改变，请稍后重试。");
    }
  }

  function getAiRequestConfig() {
    return hasLocalAiSettings
      ? { apiKey: aiApiKey || undefined, model: aiModel }
      : undefined;
  }

  function saveAiSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const model = aiModelDraft.trim();
    if (!model) {
      setError("请填写模型名称。保存的设置没有改变。");
      return;
    }

    const nextSettings: StoredAiSettings = {
      model,
    };

    window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
    setHasLocalAiSettings(true);
    setAiApiKey(aiApiKeyDraft.trim());
    setAiModel(nextSettings.model);
    setAiModelDraft(nextSettings.model);
    setNotice("模型设置已保存在这台设备上；API Key 只保留在当前页面，刷新后需要重新填写。");
    setError("");
  }

  function clearAiSettings() {
    window.localStorage.removeItem(AI_SETTINGS_STORAGE_KEY);
    setHasLocalAiSettings(false);
    setAiApiKey("");
    setAiModel(DEFAULT_AI_MODEL);
    setAiApiKeyDraft("");
    setAiModelDraft(DEFAULT_AI_MODEL);
    setNotice("已清除本机 AI 设置，将改用服务器环境变量（如果已配置）。");
    setError("");
  }

  async function handleOrganize(rawId: string) {
    clearFeedback();
    setDraft(null);
    setDraftRawId(rawId);
    setSelectedRelationIds([]);
    setOrganizingRawId(rawId);

    try {
      const aiConfig = getAiRequestConfig();
      const response = await fetch("/api/organize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiConfig ? { rawId, ...aiConfig } : { rawId }),
      });
      const payload = (await response.json()) as { draft?: OrganizeDraft; error?: { message?: string } };
      if (!response.ok || !payload.draft) throw new Error(payload.error?.message ?? "AI 建议暂时没有提出。当前笔记没有改变，请稍后重试。");
      setDraft(payload.draft);
      setAiMessage("AI 建议已经提出。请逐项审阅，再决定是否采用。");
      setNotice("AI 建议已经提出。它仍是一份提议，审阅后再决定是否采用。");
      play("success");
      openDraftTab(rawId);
    } catch (organizeError) {
      setDraftRawId(null);
      setError(organizeError instanceof Error ? organizeError.message : "AI 建议暂时没有提出。当前笔记没有改变，请稍后重试。");
    } finally {
      setOrganizingRawId(null);
    }
  }

  async function handleConfirm() {
    if (!draft || !draftRawId) return;
    clearFeedback();
    setIsConfirming(true);

    try {
      const existingKnowledge = knowledges.find((knowledge) => knowledge.rawId === draftRawId);
      const response = existingKnowledge
        ? await fetch(`/api/knowledge/${existingKnowledge.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: draft.title,
              summary: draft.summary,
              content: draft.content,
              keyPoints: draft.keyPoints,
              concepts: draft.concepts,
              keywords: draft.keywords,
              version: existingKnowledge.version,
            }),
          })
        : await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ rawId: draftRawId, draft }),
          });
      const payload = (await response.json()) as { knowledge?: Knowledge; created?: boolean; error?: { message?: string } };
      if (!response.ok || !payload.knowledge) throw new Error(payload.error?.message ?? "AI 建议暂时无法采用。当前笔记没有改变，请稍后重试。");

      for (const suggestion of draft.relatedKnowledge) {
        if (!selectedRelationIds.includes(suggestion.knowledgeId)) continue;
        const relationResponse = await fetch("/api/relations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId: payload.knowledge.id, targetId: suggestion.knowledgeId, type: "related", reason: suggestion.reason }),
        });
        const relationPayload = (await relationResponse.json()) as { error?: { message?: string } };
        if (!relationResponse.ok) throw new Error(relationPayload.error?.message ?? "笔记已更新，但交叉引用暂时没有保存。请稍后重试。");
      }

      if (draftRawId) closeTab(`draft:${draftRawId}`);
      setKnowledges((current) => existingKnowledge
        ? current.map((item) => item.id === payload.knowledge!.id ? payload.knowledge! : item)
        : [payload.knowledge!, ...current]);
      setNotice(existingKnowledge ? "AI 建议已采用，笔记已更新。" : "AI 建议已采用，笔记已保存。");
      openKnowledgeTab(payload.knowledge);
      setDraft(null);
      setDraftRawId(null);
      setSelectedRelationIds([]);
      setGraphRefresh((current) => current + 1);
      play("success");
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "AI 建议暂时无法采用。当前笔记没有改变，请稍后重试。");
    } finally {
      setIsConfirming(false);
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
       setError(updateError instanceof Error ? updateError.message : "这次修订暂时没有保存。原有笔记没有改变，请稍后重试。");
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
      setError("这条笔记暂时没有载入。已保存的内容仍然安全，请稍后重试。");
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
          : { question, contextType: "none" as const };

    setMentionTarget(null);

    try {
      const aiConfig = getAiRequestConfig();
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiConfig ? { ...body, ...aiConfig } : body),
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
      <div className="section-topline"><span>新建笔记</span><StatusPill>先写下来</StatusPill></div>
      <label htmlFor="note-text">把想法、课堂笔记或阅读摘录写在这里</label>
      <textarea id="note-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_RAW_LENGTH} placeholder="不必一次写完整，保存后仍然可以继续编辑" rows={8} />
      <div className="capture-footer"><span>{text.length.toLocaleString()} / {MAX_RAW_LENGTH.toLocaleString()}</span><button className="button-dark" type="submit" data-sound="press" disabled={isSaving}>{isSaving ? "正在保存" : "保存笔记"}</button></div>
    </form>;
  }

  function renderNewNote() {
    return <>
      <header className="workspace-heading compact-heading"><div><p className="eyebrow">私人知识编辑室</p><h1>先写下你的笔记。</h1><p>现在不必完整。保存后可以继续编辑，也可以让编辑助理提出整理建议。</p></div><StatusPill tone="accent">新笔记</StatusPill></header>
      {renderCaptureForm()}
    </>;
  }

  function renderDraftReview() {
    if (!draft) return null;
    const draftRaw = raws.find((raw) => raw.id === draftRawId);

    return <section className="review-surface" aria-labelledby="draft-title">
      <div className="review-header"><div><p className="eyebrow">等待你的判断</p><h2 id="draft-title">审阅 AI 建议</h2><p>编辑助理提出了一种整理方式。这仍是一份提议，只有采用后才会写入当前笔记。</p></div><StatusPill tone="warning">待采用</StatusPill></div>
      <div className="source-trace"><span>当前笔记</span><strong>{draftRaw ? getPreview(draftRaw.text, 88) : "当前笔记"}</strong></div>
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
      {draft.relatedKnowledge.length > 0 ? <fieldset className="relation-suggestions"><legend>可能相关的笔记</legend>{draft.relatedKnowledge.map((suggestion) => <label className="relation-option" key={suggestion.knowledgeId}><input type="checkbox" checked={selectedRelationIds.includes(suggestion.knowledgeId)} onChange={(event) => setSelectedRelationIds((current) => event.target.checked ? [...current, suggestion.knowledgeId] : current.filter((id) => id !== suggestion.knowledgeId))} /><span><strong>{nodeTitleById.get(suggestion.knowledgeId) ?? "未命名笔记"}</strong><small>{suggestion.reason}</small></span></label>)}</fieldset> : <p className="muted-note">目前没有足够依据提出相关笔记。采用建议后仍可继续补充关联。</p>}
      <div className="review-actions"><button className="button-dark" type="button" data-sound="press" onClick={() => void handleConfirm()} disabled={isConfirming}>{isConfirming ? "正在采用" : "采用建议"}</button><button className="button-secondary" type="button" data-sound="select" onClick={() => { if (draftRawId) closeTab(`draft:${draftRawId}`); setDraft(null); setDraftRawId(null); setSelectedRelationIds([]); setNotice("AI 建议暂未采用，当前笔记没有改变。"); }} disabled={isConfirming}>暂不采用</button></div>
    </section>;
  }

  function renderKnowledgeTab(knowledgeId: string) {
    const detail = knowledges.find((item) => item.id === knowledgeId);
    if (!detail) return <EmptyState title="这条笔记已不存在" body="它可能已经被删除。你可以重新新建一条笔记。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>新建笔记</button>} />;

    const sourceRaw = raws.find((raw) => raw.id === detail.rawId);
    const relatedEdges = graph.edges.filter((edge) => edge.source === detail.id || edge.target === detail.id);
    const isEditingTitle = editingTitleId === detail.id;
    const editing = editingField?.knowledgeId === detail.id ? editingField.field : null;

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

    return <>
      <header className="workspace-heading compact-heading">
        <div>
          <p className="eyebrow">笔记</p>
          {isEditingTitle
            ? <input className="title-edit-input" value={titleDraft} autoFocus onChange={(event) => setTitleDraft(event.target.value)} onBlur={() => void handleUpdateKnowledge(detail.id, { title: titleDraft })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleUpdateKnowledge(detail.id, { title: titleDraft }); } if (event.key === "Escape") setEditingTitleId(null); }} />
            : <h1 onContextMenu={(event) => { event.preventDefault(); setContextMenu({ type: "knowledge-title", knowledge: detail, x: event.clientX, y: event.clientY }); }}>{detail.title}</h1>}
          <p>更新于 {formatDate(detail.updatedAt)}</p>
        </div>
        <div className="heading-actions"><button className="button-secondary" type="button" data-sound="press" onClick={() => void handleOrganize(detail.rawId)} disabled={organizingRawId !== null}>{organizingRawId === detail.rawId ? "正在提出建议" : "让 AI 提建议"}</button><button className="button-secondary" type="button" data-sound="destructive" onClick={() => void handleDeleteKnowledge(detail)}>删除笔记</button><StatusPill tone="accent">已保存</StatusPill></div>
      </header>
      <section className="content-section">
        {editing === "summary"
          ? <textarea className="inline-edit-field" value={fieldDraft} autoFocus rows={3} onChange={(event) => setFieldDraft(event.target.value)} onBlur={saveFieldEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && event.ctrlKey) saveFieldEdit(); }} />
          : <p className="reading-summary editable-field" onClick={() => startFieldEdit("summary")}>{detail.summary}</p>}
        {editing === "content"
          ? <textarea className="inline-edit-field" value={fieldDraft} autoFocus rows={10} onChange={(event) => setFieldDraft(event.target.value)} onBlur={saveFieldEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && event.ctrlKey) saveFieldEdit(); }} />
          : <div className="reading-content editable-field" onClick={() => startFieldEdit("content")}>{detail.content}</div>}
        {editing === "concepts"
          ? <textarea className="inline-edit-field" value={fieldDraft} autoFocus rows={4} placeholder="每行一个概念" onChange={(event) => setFieldDraft(event.target.value)} onBlur={saveFieldEdit} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && event.ctrlKey) saveFieldEdit(); }} />
          : <div className="tag-row editable-field" onClick={() => startFieldEdit("concepts")}>{detail.concepts.length > 0 ? detail.concepts.map((concept) => <span className="tag" key={concept}>{concept}</span>) : <span className="muted-note">点击添加概念</span>}</div>}
        <div className="source-reference"><span className="item-kicker">内容来源</span><strong>{sourceRaw ? getPreview(sourceRaw.text, 150) : "内容来源暂时没有载入"}</strong><span className="muted-note">原始内容由系统保留，用于追溯。</span></div>
        <div className="backlink-section">
          <div className="section-heading-inline"><h3>交叉引用</h3><button className="text-button" type="button" data-sound="select" onClick={() => navigate("graph")}>查看知识网络</button></div>
          {relatedEdges.length > 0 ? <div className="relation-list">{relatedEdges.map((edge) => {
            const otherId = edge.source === detail.id ? edge.target : edge.source;
            const other = knowledges.find((item) => item.id === otherId);
            return <div className="relation-row" key={edge.id}>{other ? <button className="text-button" type="button" data-sound="select" onClick={() => openKnowledgeTab(other)}>{other.title}</button> : <span>{otherId}</span>}<small>{edge.source === detail.id ? "出链" : "入链"} · {edge.reason}</small></div>;
          })}</div> : <p className="muted-note">这条笔记还没有关联。</p>}
        </div>
      </section>
    </>;
  }

  function renderSettings() {
    return <>
      <header className="workspace-heading compact-heading">
        <div>
          <p className="eyebrow">编辑室设置</p>
          <h1>让编辑助理使用你的模型。</h1>
           <p>Key 只保留在当前页面内存，并随 AI 请求发送；刷新页面后需要重新填写。</p>
        </div>
        <StatusPill tone="accent">本机设置</StatusPill>
      </header>
      <section className="settings-surface">
        <form className="settings-form" onSubmit={saveAiSettings}>
          <div className="field-block">
            <label htmlFor="deepseek-api-key">DeepSeek API Key</label>
            <input
              id="deepseek-api-key"
              type="password"
              autoComplete="off"
              value={aiApiKeyDraft}
              onChange={(event) => setAiApiKeyDraft(event.target.value)}
              placeholder="sk-…"
            />
             <p className="settings-help">使用你自己的 Key。它不会写入浏览器持久存储；不要把它写进代码、数据库或共享截图。</p>
          </div>
          <div className="field-block">
            <label htmlFor="deepseek-model">模型</label>
            <select
              id="deepseek-model"
              className="settings-select"
              value={AI_MODEL_PRESETS.some((preset) => preset.value === aiModelDraft) ? aiModelDraft : "__custom__"}
              onChange={(event) => setAiModelDraft(event.target.value === "__custom__" ? "" : event.target.value)}
            >
              {AI_MODEL_PRESETS.map((preset) => <option value={preset.value} key={preset.value}>{preset.label}</option>)}
              <option value="__custom__">自定义模型</option>
            </select>
            {!AI_MODEL_PRESETS.some((preset) => preset.value === aiModelDraft) ? <input
              className="settings-custom-model"
              aria-label="自定义模型名称"
              value={aiModelDraft}
              onChange={(event) => setAiModelDraft(event.target.value)}
              placeholder="填写模型名称"
            /> : null}
            <p className="settings-help">可以直接填写服务商提供的其他兼容模型名。</p>
          </div>
          <div className="settings-actions">
            <button className="button-dark" type="submit" data-sound="press">保存本机设置</button>
            {hasLocalAiSettings ? <button className="button-secondary" type="button" data-sound="select" onClick={clearAiSettings}>清除本机配置</button> : null}
          </div>
        </form>
        <div className="settings-note">
          <span className="item-kicker">使用方式</span>
           <p>保存后，“让 AI 提建议”和右侧编辑助理都会使用这里的 Key 与模型。清除后恢复使用服务器环境变量。</p>
        </div>
      </section>
    </>;
  }

  function renderGraph() {
     return <><header className="workspace-heading compact-heading"><div><p className="eyebrow">笔记网络</p><h1>看见笔记如何相互连接。</h1><p>这里只呈现你已经确认的笔记与有向关联，不添加装饰性内容。</p></div><button className="button-secondary" type="button" data-sound="press" onClick={() => setGraphRefresh((current) => current + 1)}>重新载入</button></header>{graph.nodes.length === 0 ? <EmptyState title="笔记网络还没有内容" body="保存第一条笔记后，它会从这里开始生长。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>新建笔记</button>} /> : <div className="graph-workspace"><section className="network-map" aria-label="笔记网络">{graph.nodes.map((node, index) => <button className={`network-node node-position-${index % 6}`} type="button" data-sound="select" key={node.id} onClick={() => void handleGraphNodeClick(node.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{node.title}</strong><small>打开笔记</small></button>)}</section><section className="edge-list"><div className="section-heading-inline"><h2>笔记关联</h2><span className="section-count">{graph.edges.length}</span></div>{graph.edges.length === 0 ? <p className="muted-note">目前还没有关联。让 AI 提建议或在笔记中继续补充。</p> : graph.edges.map((edge) => <div className="edge-row" key={edge.id}><div><strong>{nodeTitleById.get(edge.source) ?? edge.source}</strong><span>→</span><strong>{nodeTitleById.get(edge.target) ?? edge.target}</strong></div><p>{edge.reason}</p></div>)}</section></div>}</>;
  }

  function renderMainContent() {
    switch (activeTab.kind) {
      case "knowledge": return renderKnowledgeTab(activeTab.knowledgeId);
      case "draft": return renderDraftReview();
      case "view":
        switch (activeTab.viewKey) {
          case "new-note": return renderNewNote();
          case "graph": return renderGraph();
          case "settings": return renderSettings();
        }
    }
  }

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? openTabs[0] ?? NEW_NOTE_TAB;

  if (showLanding) return <LandingPage onEnter={() => setShowLanding(false)} />;

  return <main className="app-shell">
     <div className="mobile-topbar"><button className="mobile-menu-button" type="button" data-sound="select" onClick={() => setMobileNavOpen((current) => !current)} aria-expanded={mobileNavOpen} aria-controls="workspace-nav">目录</button><AppLogo /><button className="mobile-new-button" type="button" data-sound="press" onClick={() => navigate("new-note")}>新建</button></div>
    <aside id="workspace-nav" className={`workspace-sidebar${mobileNavOpen ? " is-open" : ""}`}>
       <div className="sidebar-top"><AppLogo /><button className="workspace-switcher" type="button" data-sound="select" onClick={() => navigate("settings")}><span className="workspace-avatar">G</span><span><strong>私人知识编辑室</strong><small>打开设置</small></span><span aria-hidden="true">⌄</span></button><button className="new-source-button" type="button" data-sound="press" onClick={() => navigate("new-note")}><span aria-hidden="true">+</span> 新建笔记</button></div>
      <nav className="file-tree" aria-label="编辑室目录">
        <div className="tree-section">
          <button className="tree-section-header" type="button" data-sound="select" onClick={() => setExpandedSections((current) => ({ ...current, knowledge: !current.knowledge }))} aria-expanded={expandedSections.knowledge}>
            <span className={`tree-caret${expandedSections.knowledge ? " is-open" : ""}`} aria-hidden="true">▾</span>
             <span>笔记</span>
            <span className="tree-count">{knowledges.length}</span>
          </button>
           {expandedSections.knowledge ? <div className="tree-items">{knowledges.length === 0 ? <p className="tree-empty">还没有笔记</p> : knowledges.map((knowledge) => <button className={`tree-item${activeTabId === `knowledge:${knowledge.id}` ? " is-selected" : ""}`} type="button" data-sound="select" key={knowledge.id} onClick={() => openKnowledgeTab(knowledge)}>{getPreview(knowledge.title, 32)}</button>)}</div> : null}
        </div>
        <div className="tree-tools"><button className={`tree-tool-item${activeTabId === "view:graph" ? " is-active" : ""}`} type="button" data-sound="select" onClick={() => navigate("graph")}>{viewMeta.graph.label}</button><button className={`tree-tool-item${activeTabId === "view:settings" ? " is-active" : ""}`} type="button" data-sound="select" onClick={() => navigate("settings")}>{viewMeta.settings.label}</button></div>
      </nav>
       <div className="sidebar-bottom"><SoundToggle className="sound-toggle-sidebar" /><div className="data-status"><span className="status-dot" aria-hidden="true" /><span><strong>本地笔记可用</strong><small>内容来源可追溯</small></span></div><span className="sidebar-version">AI Notes</span></div>
    </aside>
    <section className="workspace-main">
      <div className="workspace-topbar"><div className="breadcrumb"><span>AI Notes</span><span aria-hidden="true">/</span><strong>{activeTab.label}</strong></div><div className="topbar-actions"><SoundToggle className="sound-toggle-desktop" /><span className="topbar-status"><span className="status-dot" aria-hidden="true" />本地案头</span><button className="avatar-button" type="button" data-sound="select" aria-label="打开设置" onClick={() => navigate("settings")}>G</button></div></div>
      <div className="tab-bar" role="tablist">{openTabs.map((tab) => <div key={tab.id} className={`tab-chip${activeTabId === tab.id ? " is-active" : ""}`} role="tab" tabIndex={activeTabId === tab.id ? 0 : -1} data-sound="select" aria-selected={activeTabId === tab.id} onClick={() => setActiveTabId(tab.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveTabId(tab.id); } }}><span>{tab.label}</span><button type="button" data-sound="select" aria-label="关闭标签" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</button></div>)}</div>
      <div className="workspace-content"><div className="main-column">{error ? <div className="feedback-banner error-message" role="alert">{error}</div> : null}{notice ? <div className="feedback-banner notice-message" aria-live="polite">{notice}</div> : null}{renderMainContent()}</div></div>
    </section>
    <aside className="ai-rail" aria-label="编辑助理面板">
      <div className="ai-rail-header"><div><span className="item-kicker">编辑建议</span><h2>编辑助理</h2></div><span className="ai-signal">只提议</span></div>
      <div className={`ai-result${aiMessage ? " has-result" : ""}`} aria-live="polite">
        <div className="ai-result-label"><span>助理回复</span></div>
         <p>{isAsking ? "正在查阅你选择的材料…" : aiMessage || "提出一个问题，或输入 @ 引用一条笔记。"}</p>
        {aiMessage && !isAsking ? <div className="ai-result-actions"><button className="text-button" type="button" data-sound="select" onClick={() => setAiMessage("")}>收起回复</button></div> : null}
      </div>
      <form className="ai-ask" onSubmit={(event) => { event.preventDefault(); void handleAskAssistant(aiQuestion); }}>
        <label htmlFor="ai-question">向编辑助理提问</label>
        <div className="ai-input-wrap">
           {mentionCandidates.length > 0 ? <div className="mention-popup" role="listbox">{mentionCandidates.map((item) => <button type="button" key={`${item.kind}:${item.id}`} className="mention-row" data-sound="select" onClick={() => pickMention(item)}><span className="mention-kind">笔记</span><span>{item.label}</span></button>)}</div> : null}
           <div className="ai-input-row"><input id="ai-question" value={aiQuestion} onChange={(event) => handleQuestionChange(event.target.value)} placeholder="写下问题，@ 可以引用笔记" disabled={isAsking} /><button type="submit" data-sound="press" aria-label="提交问题" disabled={isAsking}>↗</button></div>
        </div>
      </form>
      <div className="ai-trace"><span className="status-dot" aria-hidden="true" />回复只依据你选择的材料，也不会自动改写笔记</div>
    </aside>
    <nav className="mobile-bottom-nav" aria-label="移动端导航">{directNavViews.map((view) => <button className={activeTab.kind === "view" && activeTab.viewKey === view ? "is-active" : ""} type="button" data-sound="select" key={view} onClick={() => navigate(view)}><span>{viewMeta[view].shortLabel}</span></button>)}<button type="button" data-sound="select" onClick={() => setMobileNavOpen(true)}><span>更多</span></button></nav>
    {contextMenu?.type === "knowledge-title" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">修订标题</div><div className="context-menu-title">{getPreview(contextMenu.knowledge.title, 62)}</div><button type="button" data-sound="press" onClick={() => { setEditingTitleId(contextMenu.knowledge.id); setTitleDraft(contextMenu.knowledge.title); setContextMenu(null); }}>修改标题</button></div> : null}
  </main>;
}
