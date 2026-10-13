"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import {
  SoundPreferencePrompt,
  SoundToggle,
  useInterfaceSound,
} from "../components/interface-sound";
import { LandingPage } from "../components/landing-page";

import type { GraphEdge, GraphNode } from "../types/graph";
import type { Knowledge } from "../types/knowledge";
import type { OrganizeDraft } from "../types/organize";
import type { Raw } from "../types/raw";

const MAX_RAW_LENGTH = 50_000;
const MAX_RAW_TITLE_LENGTH = 120;

type ViewKey = "new-note" | "graph";

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
  "new-note": { label: "留下原话", shortLabel: "记录" },
  graph: { label: "知识网络", shortLabel: "网络" },
};

const directNavViews: ViewKey[] = ["new-note", "graph"];

const NEW_NOTE_TAB: Tab = { id: "view:new-note", kind: "view", viewKey: "new-note", label: "留下原话" };

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
  return <div className="app-logo" aria-label="Chordnote"><span className="logo-mark" aria-hidden="true">C</span><span>Chordnote</span></div>;
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
  const [noteTitle, setNoteTitle] = useState("");
  const [raws, setRaws] = useState<Raw[]>([]);
  const [knowledges, setKnowledges] = useState<Knowledge[]>([]);
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
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionTarget, setMentionTarget] = useState<MentionItem | null>(null);
  const [expandedSections, setExpandedSections] = useState<Record<"raw" | "knowledge", boolean>>({
    raw: true,
    knowledge: true,
  });
  const [, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [organizingRawId, setOrganizingRawId] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<
    | { type: "raw"; raw: Raw; x: number; y: number }
    | { type: "knowledge-title"; knowledge: Knowledge; x: number; y: number }
    | null
  >(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingField, setEditingField] = useState<{ knowledgeId: string; field: "summary" | "content" | "concepts" } | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");

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

  const selectedRaw = raws.find((raw) => raw.id === selectedRawId) ?? raws[0] ?? null;
  

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const items: MentionItem[] = [
      ...raws.map((r) => ({ kind: "raw" as const, id: r.id, label: getPreview(r.text, 24) })),
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

  function openRawTab(raw: Raw) {
    setSelectedRawId(raw.id);
    openTab({ id: `raw:${raw.id}`, kind: "raw", rawId: raw.id, label: raw.title?.trim() ? getPreview(raw.title, 18) : getPreview(raw.text, 18) });
  }

  function openKnowledgeTab(knowledge: Knowledge) {
    setSelectedKnowledge(knowledge);
    openTab({ id: `knowledge:${knowledge.id}`, kind: "knowledge", knowledgeId: knowledge.id, label: getPreview(knowledge.title, 18) });
  }

  function openDraftTab(rawId: string) {
    openTab({ id: `draft:${rawId}`, kind: "draft", rawId, label: "审阅整理稿" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clearFeedback();
    if (!text.trim()) {
      setError("先写下一段原话，再把它留下。");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/raw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, title: noteTitle.trim() || null }),
      });
      const payload = (await response.json()) as { raw?: Raw; error?: { message?: string } };
      if (!response.ok || !payload.raw) throw new Error(payload.error?.message ?? "这段原话暂时没有留下。请稍后重试。");
      setRaws((current) => [payload.raw!, ...current]);
      setSelectedRawId(payload.raw.id);
      setText("");
      setNoteTitle("");
      setNotice("原始记录已留下。它会保持原样，你可以请编辑助理提出整理稿。");
      play("success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "这段原话暂时没有留下。内容仍在输入框中，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  }

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

    setMentionTarget(null);

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
      <div className="section-topline"><span>留下原话</span><StatusPill>原始记录不改写</StatusPill></div>
      <label htmlFor="raw-title">笔记名<span className="field-hint">可选，方便日后在左侧找到它</span></label>
      <input
        id="raw-title"
        className="raw-title-input"
        type="text"
        value={noteTitle}
        onChange={(event) => setNoteTitle(event.target.value)}
        maxLength={MAX_RAW_TITLE_LENGTH}
        placeholder="例如：第三讲 · 反向传播推导"
      />
      <label htmlFor="raw-text">把尚未整理的内容留在这里</label>
      <textarea id="raw-text" value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_RAW_LENGTH} placeholder="课堂笔记、阅读摘录，或一个还没有答案的问题" rows={8} />
      <div className="capture-footer"><span>{text.length.toLocaleString()} / {MAX_RAW_LENGTH.toLocaleString()}</span><button className="button-dark" type="submit" data-sound="press" disabled={isSaving}>{isSaving ? "正在留下" : "留下原话"}</button></div>
    </form>;
  }

  function renderNewNote() {
    return <>
      <header className="workspace-heading compact-heading"><div><p className="eyebrow">私人知识编辑室</p><h1>先留下原话。</h1><p>现在不必完整。记录会保持原样，之后再由你决定如何理解和收录。</p></div><StatusPill tone="accent">案头 01</StatusPill></header>
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

    return <>
      <header className="workspace-heading compact-heading">
        <div><p className="eyebrow">原始记录 · {formatDate(raw.createdAt)}</p><h1>忠实留下的原话</h1><p>编辑助理不会改写这里的内容。所有整理和修订都能回到这份出处。</p></div>
        {knowledge ? <StatusPill tone="accent">已收录</StatusPill> : <StatusPill>等待整理</StatusPill>}
      </header>
      <section className="content-section">
        <div className="reading-content">{raw.text}</div>
        <div className="review-actions">
          {knowledge
            ? <button className="button-dark" type="button" data-sound="select" onClick={() => openKnowledgeTab(knowledge)}>打开知识页 ↗</button>
            : <button className="button-dark" type="button" data-sound="press" onClick={() => void handleOrganize(raw.id)} disabled={organizingRawId !== null}>{organizingRawId === raw.id ? "正在整理" : "提出整理稿"}</button>}
          {!knowledge ? <button className="button-secondary" type="button" data-sound="destructive" onClick={() => void handleDeleteRaw(raw)}>移除记录</button> : null}
        </div>
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
          <p className="eyebrow">知识页</p>
          {isEditingTitle
            ? <input className="title-edit-input" value={titleDraft} autoFocus onChange={(event) => setTitleDraft(event.target.value)} onBlur={() => void handleUpdateKnowledge(detail.id, { title: titleDraft })} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void handleUpdateKnowledge(detail.id, { title: titleDraft }); } if (event.key === "Escape") setEditingTitleId(null); }} />
            : <h1 onContextMenu={(event) => { event.preventDefault(); setContextMenu({ type: "knowledge-title", knowledge: detail, x: event.clientX, y: event.clientY }); }}>{detail.title}</h1>}
          <p>修订于 {formatDate(detail.updatedAt)}</p>
        </div>
        <StatusPill tone="accent">已收录</StatusPill>
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

  function renderGraph() {
    return <><header className="workspace-heading compact-heading"><div><p className="eyebrow">知识网络</p><h1>看见理解如何相互回应。</h1><p>这里只呈现你已经确认的知识页与交叉引用，不添加装饰性内容。</p></div><button className="button-secondary" type="button" data-sound="press" onClick={() => setGraphRefresh((current) => current + 1)}>重新载入</button></header>{graph.nodes.length === 0 ? <EmptyState title="知识网络还没有内容" body="确认并收录第一张知识页后，它会从这里开始生长。" action={<button className="button-dark" type="button" data-sound="press" onClick={() => navigate("new-note")}>留下原话</button>} /> : <div className="graph-workspace"><section className="network-map" aria-label="知识页网络">{graph.nodes.map((node, index) => <button className={`network-node node-position-${index % 6}`} type="button" data-sound="select" key={node.id} onClick={() => void handleGraphNodeClick(node.id)}><span>{String(index + 1).padStart(2, "0")}</span><strong>{node.title}</strong><small>打开知识页</small></button>)}</section><section className="edge-list"><div className="section-heading-inline"><h2>交叉引用</h2><span className="section-count">{graph.edges.length}</span></div>{graph.edges.length === 0 ? <p className="muted-note">目前还没有交叉引用。审阅整理稿时，你可以选择值得保留的联系。</p> : graph.edges.map((edge) => <div className="edge-row" key={edge.id}><div><strong>{nodeTitleById.get(edge.source) ?? edge.source}</strong><span>↔</span><strong>{nodeTitleById.get(edge.target) ?? edge.target}</strong></div><p>{edge.reason}</p></div>)}</section></div>}</>;
  }

  function renderMainContent() {
    switch (activeTab.kind) {
      case "raw": return renderRawTab(activeTab.rawId);
      case "knowledge": return renderKnowledgeTab(activeTab.knowledgeId);
      case "draft": return renderDraftReview();
      case "view":
        switch (activeTab.viewKey) {
          case "new-note": return renderNewNote();
          case "graph": return renderGraph();
        }
    }
  }

  const activeTab = openTabs.find((tab) => tab.id === activeTabId) ?? openTabs[0] ?? NEW_NOTE_TAB;

  if (showLanding) return <LandingPage onEnter={() => setShowLanding(false)} />;

  return <main className="app-shell">
    <div className="mobile-topbar"><button className="mobile-menu-button" type="button" data-sound="select" onClick={() => setMobileNavOpen((current) => !current)} aria-expanded={mobileNavOpen} aria-controls="workspace-nav">目录</button><AppLogo /><button className="mobile-new-button" type="button" data-sound="press" onClick={() => navigate("new-note")}>记录</button></div>
    <aside id="workspace-nav" className={`workspace-sidebar${mobileNavOpen ? " is-open" : ""}`}>
      <div className="sidebar-top"><AppLogo /><button className="workspace-switcher" type="button"><span className="workspace-avatar">G</span><span><strong>私人知识编辑室</strong><small>本地案头</small></span><span aria-hidden="true">⌄</span></button><button className="new-source-button" type="button" data-sound="press" onClick={() => navigate("new-note")}><span aria-hidden="true">+</span> 留下原话</button></div>
      <nav className="file-tree" aria-label="编辑室目录">
        <div className="tree-section">
          <button className="tree-section-header" type="button" data-sound="select" onClick={() => setExpandedSections((current) => ({ ...current, raw: !current.raw }))} aria-expanded={expandedSections.raw}>
            <span className={`tree-caret${expandedSections.raw ? " is-open" : ""}`} aria-hidden="true">▾</span>
            <span>原始记录</span>
            <span className="tree-count">{raws.length}</span>
          </button>
          {expandedSections.raw ? <div className="tree-items">{raws.length === 0 ? <p className="tree-empty">还没有留下原话</p> : raws.map((raw) => <button className={`tree-item${activeTabId === `raw:${raw.id}` ? " is-selected" : ""}`} type="button" data-sound="select" key={raw.id} onClick={() => openRawTab(raw)}>{raw.title?.trim() ? getPreview(raw.title, 32) : getPreview(raw.text, 32)}</button>)}</div> : null}
        </div>
        <div className="tree-section">
          <button className="tree-section-header" type="button" data-sound="select" onClick={() => setExpandedSections((current) => ({ ...current, knowledge: !current.knowledge }))} aria-expanded={expandedSections.knowledge}>
            <span className={`tree-caret${expandedSections.knowledge ? " is-open" : ""}`} aria-hidden="true">▾</span>
            <span>知识页</span>
            <span className="tree-count">{knowledges.length}</span>
          </button>
          {expandedSections.knowledge ? <div className="tree-items">{knowledges.length === 0 ? <p className="tree-empty">还没有收录知识页</p> : knowledges.map((knowledge) => <button className={`tree-item${activeTabId === `knowledge:${knowledge.id}` ? " is-selected" : ""}`} type="button" data-sound="select" key={knowledge.id} onClick={() => openKnowledgeTab(knowledge)}>{getPreview(knowledge.title, 32)}</button>)}</div> : null}
        </div>
        <div className="tree-tools"><button className={`tree-tool-item${activeTabId === "view:graph" ? " is-active" : ""}`} type="button" data-sound="select" onClick={() => navigate("graph")}>{viewMeta.graph.label}</button></div>
      </nav>
      <div className="sidebar-bottom"><SoundToggle className="sound-toggle-sidebar" /><div className="data-status"><span className="status-dot" aria-hidden="true" /><span><strong>本地记录可用</strong><small>原始记录与知识页可追溯</small></span></div><span className="sidebar-version">Chordnote · 和弦</span></div>
    </aside>
    <section className="workspace-main">
      <div className="workspace-topbar"><div className="breadcrumb"><span>Chordnote</span><span aria-hidden="true">/</span><strong>{activeTab.label}</strong></div><div className="topbar-actions"><SoundToggle className="sound-toggle-desktop" /><span className="topbar-status"><span className="status-dot" aria-hidden="true" />本地案头</span><button className="avatar-button" type="button" aria-label="打开个人菜单">G</button></div></div>
      <div className="tab-bar" role="tablist">{openTabs.map((tab) => <div key={tab.id} className={`tab-chip${activeTabId === tab.id ? " is-active" : ""}`} role="tab" tabIndex={activeTabId === tab.id ? 0 : -1} data-sound="select" aria-selected={activeTabId === tab.id} onClick={() => setActiveTabId(tab.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveTabId(tab.id); } }}><span>{tab.label}</span><button type="button" data-sound="select" aria-label="关闭标签" onClick={(event) => { event.stopPropagation(); closeTab(tab.id); }}>×</button></div>)}</div>
      <div className="workspace-content"><div className="main-column">{error ? <div className="feedback-banner error-message" role="alert">{error}</div> : null}{notice ? <div className="feedback-banner notice-message" aria-live="polite">{notice}</div> : null}{renderMainContent()}</div></div>
    </section>
    <aside className="ai-rail" aria-label="编辑助理面板">
      <div className="ai-rail-header"><div><span className="item-kicker">编辑建议</span><h2>编辑助理</h2></div><span className="ai-signal">只提议</span></div>
      <div className={`ai-result${aiMessage ? " has-result" : ""}`} aria-live="polite">
        <div className="ai-result-label"><span>助理回复</span></div>
        <p>{isAsking ? "正在查阅你选择的材料…" : aiMessage || "提出一个问题，或输入 @ 引用一份原始记录、知识页或参考材料。"}</p>
        {aiMessage && !isAsking ? <div className="ai-result-actions"><button className="text-button" type="button" data-sound="select" onClick={() => setAiMessage("")}>收起回复</button></div> : null}
      </div>
      <form className="ai-ask" onSubmit={(event) => { event.preventDefault(); void handleAskAssistant(aiQuestion); }}>
        <label htmlFor="ai-question">向编辑助理提问</label>
        <div className="ai-input-wrap">
          {mentionCandidates.length > 0 ? <div className="mention-popup" role="listbox">{mentionCandidates.map((item) => <button type="button" key={`${item.kind}:${item.id}`} className="mention-row" data-sound="select" onClick={() => pickMention(item)}><span className="mention-kind">{item.kind === "raw" ? "原始记录" : "知识页"}</span><span>{item.label}</span></button>)}</div> : null}
          <div className="ai-input-row"><input id="ai-question" value={aiQuestion} onChange={(event) => handleQuestionChange(event.target.value)} placeholder="写下问题，@ 可以引用已有材料" disabled={isAsking} /><button type="submit" data-sound="press" aria-label="提交问题" disabled={isAsking}>↗</button></div>
        </div>
      </form>
      <div className="ai-trace"><span className="status-dot" aria-hidden="true" />回复只依据你选择的材料，也不会自动写入知识页</div>
    </aside>
    <nav className="mobile-bottom-nav" aria-label="移动端导航">{directNavViews.map((view) => <button className={activeTab.kind === "view" && activeTab.viewKey === view ? "is-active" : ""} type="button" data-sound="select" key={view} onClick={() => navigate(view)}><span>{viewMeta[view].shortLabel}</span></button>)}<button type="button" data-sound="select" onClick={() => setMobileNavOpen(true)}><span>更多</span></button></nav>
    <SoundPreferencePrompt />
    {contextMenu?.type === "raw" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">原始记录</div><div className="context-menu-title">{getPreview(contextMenu.raw.text, 62)}</div><button type="button" data-sound="destructive" onClick={() => void handleDeleteRaw(contextMenu.raw)}>移除这条记录</button></div> : null}
    {contextMenu?.type === "knowledge-title" ? <div className="raw-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={(event) => event.stopPropagation()}><div className="context-menu-label">修订标题</div><div className="context-menu-title">{getPreview(contextMenu.knowledge.title, 62)}</div><button type="button" data-sound="press" onClick={() => { setEditingTitleId(contextMenu.knowledge.id); setTitleDraft(contextMenu.knowledge.title); setContextMenu(null); }}>修改标题</button></div> : null}
  </main>;
}
