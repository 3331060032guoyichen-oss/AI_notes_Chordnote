"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LinkCandidate } from "../lib/documents/markdown";
import { getPreview } from "../lib/text-preview";
import { IconClose, IconNote, IconSearch, IconSource } from "./ui/icons";
import { useDialog } from "./ui/use-dialog";

type SearchDocument = LinkCandidate & { markdown?: string; text?: string; content?: string; rawId?: string };
type Reference = { sourceId: string; targetId: string | null; target: string };
type Filter = "all" | "raw" | "knowledge";

export function DocumentSearch({ documents, onOpen, onClose }: {
  documents: SearchDocument[];
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const { dialogRef, dismiss, closing } = useDialog(true, onClose);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [links, setLinks] = useState<Reference[] | null>(null);
  const [target, setTarget] = useState("");
  const [linkError, setLinkError] = useState("");
  const [loadingLinks, setLoadingLinks] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const normalized = query.trim().toLocaleLowerCase();
  const results = useMemo(() => documents.filter(document => {
    const kind = document.rawId ? "knowledge" : "raw";
    return (filter === "all" || filter === kind) &&
      [document.title, document.path, document.markdown, document.text, document.content].join(" ").toLocaleLowerCase().includes(normalized);
  }).sort((a, b) => Number(b.title?.toLocaleLowerCase().startsWith(normalized)) - Number(a.title?.toLocaleLowerCase().startsWith(normalized))), [documents, filter, normalized]);
  const activeIndex = Math.min(selected, Math.max(0, results.length - 1));

  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    dialogRef.current?.querySelector(`#search-result-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, dialogRef]);

  function openDocument(id: string) { onOpen(id); dismiss(); }

  async function showLinks(id: string) {
    requestRef.current?.abort();
    if (target === id) { setTarget(""); setLoadingLinks(false); return; }
    const controller = new AbortController();
    requestRef.current = controller;
    setTarget(id); setLinks(null); setLinkError(""); setLoadingLinks(true);
    try {
      const response = await fetch("/api/documents", { signal: controller.signal });
      if (!response.ok) throw new Error("关联暂时未能载入，请重试。");
      const data = await response.json() as { references?: Reference[] };
      setLinks((data.references ?? []).filter(link => link.sourceId === id || link.targetId === id));
    } catch (error) {
      if (!controller.signal.aborted) setLinkError(error instanceof Error ? error.message : "关联暂时未能载入，请重试。");
    } finally { if (!controller.signal.aborted) setLoadingLinks(false); }
  }

  return <div className="command-backdrop" data-closing={closing || undefined} onMouseDown={event => { if (event.target === event.currentTarget) dismiss(); }}>
    <div ref={dialogRef} className="document-search" role="dialog" aria-modal="true" aria-labelledby="search-title" tabIndex={-1}>
      <div className="search-top">
        <IconSearch />
        <input data-autofocus role="combobox" aria-label="查找笔记" aria-expanded={results.length > 0} aria-controls="search-results" aria-autocomplete="list"
          aria-activedescendant={results.length > 0 ? `search-result-${activeIndex}` : undefined}
          value={query} placeholder="搜索标题、正文或路径…" onChange={event => { setQuery(event.target.value); setSelected(0); }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setSelected(results.length ? (activeIndex + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length : 0);
            }
            if (event.key === "Enter" && results[activeIndex]) { event.preventDefault(); openDocument(results[activeIndex].id); }
          }} />
        {query ? <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => { setQuery(""); setSelected(0); dialogRef.current?.querySelector("input")?.focus(); }}><IconClose /></button> : null}
        <button type="button" className="dialog-close" aria-label="关闭查找" onClick={dismiss}><kbd>Esc</kbd></button>
      </div>
      <div className="search-toolbar">
        <div className="search-filters" role="group" aria-label="笔记类型">
          {([["all", "全部"], ["raw", "原始记录"], ["knowledge", "知识页"]] as const).map(([id, label]) =>
            <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setSelected(0); }}>{label}</button>)}
        </div>
        <span aria-live="polite">{results.length} 条结果</span>
      </div>
      <h2 id="search-title" className="search-section-label">{normalized ? "搜索结果" : "你的笔记"}</h2>
      <div className="search-results" id="search-results" role="listbox" aria-label="笔记搜索结果">
        {results.map((document, index) => <div className={`search-result-row${activeIndex === index ? " is-selected" : ""}`} key={document.id}>
          <button className="search-result-main" type="button" role="option" id={`search-result-${index}`} aria-selected={activeIndex === index}
            onClick={() => openDocument(document.id)}>
            <span className="search-document-icon" aria-hidden="true">{document.rawId ? <IconNote /> : <IconSource />}</span>
            <span className="search-result-copy"><strong>{document.title || "未命名"}</strong><small>{document.path || (document.rawId ? "知识页" : "原始记录")}</small></span>
            <span className="search-result-kind">{document.rawId ? "知识页" : "原始记录"}</span>
          </button>
          <button className="search-link-action" type="button" aria-label={`查看「${document.title || "未命名"}」的关联`} aria-expanded={target === document.id} onClick={() => void showLinks(document.id)}>关联 ↗</button>
        </div>)}
      </div>
      {results.length === 0 ? <div className="search-empty" role="status"><IconSearch /><h3>{documents.length ? "无匹配结果" : "暂无笔记"}</h3></div> : null}
      {target ? <section className="search-link-results" aria-label="笔记关联" aria-busy={loadingLinks}>
        <div className="search-link-heading"><strong>{getPreview(documents.find(document => document.id === target)?.title || "未命名", 28)} · 关联</strong><button type="button" aria-label="收起关联" onClick={() => { requestRef.current?.abort(); setTarget(""); }}><IconClose /></button></div>
        {loadingLinks ? <p role="status">正在查找关联…</p> : linkError ? <p role="alert">{linkError}</p> : links?.length ? links.map((link, index) => {
          const relatedId = link.sourceId === target ? link.targetId : link.sourceId;
          const related = documents.find(document => document.id === relatedId);
          return related ? <button type="button" key={index} onClick={() => openDocument(related.id)}><span aria-hidden="true">{link.sourceId === target ? "↗" : "↙"}</span> {related.title || "未命名"}</button> : <p key={index}>{link.target} <span>· 尚未建立</span></p>;
        }) : <p>这条笔记还没有关联。可在正文用 [[笔记名]] 连接内容。</p>}
      </section> : null}
      <footer className="search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>↵</kbd> 打开笔记</span><span><kbd>Esc</kbd> 关闭</span></footer>
    </div>
  </div>;
}
