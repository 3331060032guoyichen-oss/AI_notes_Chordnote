"use client";
import { useState } from "react";
import type { LinkCandidate } from "../lib/documents/markdown";
export function DocumentSearch({ documents, onOpen, onClose }: {
  documents: (LinkCandidate & { markdown?: string; text?: string; content?: string })[];
  onOpen: (id: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [links, setLinks] = useState<{sourceId:string;targetId:string|null;target:string}[] | null>(null);
  const [target, setTarget] = useState("");
  return <div className="command-backdrop" onClick={onClose}><section className="document-search" role="dialog" aria-modal="true" aria-label="查找笔记" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") onClose(); }}>
    <div className="search-top"><input aria-label="查找笔记" autoFocus value={query} placeholder="查找笔记" onChange={e => setQuery(e.target.value)} /><button onClick={onClose} aria-label="关闭查找">×</button></div>
    <div className="search-results">{documents.filter(d => [d.title, d.path, d.markdown, d.text, d.content].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(d => <div key={d.id}>
      <button onClick={() => { onOpen(d.id); onClose(); }}>{d.title || "未命名"}</button>
      <button className="text-button" onClick={async () => { const response = await fetch("/api/documents"); const data = await response.json(); setLinks(data.references); setTarget(d.id); }}>查询链接</button>
    </div>)}</div>
    {links ? <div className="search-link-results">{links.filter(l => l.sourceId === target || l.targetId === target).map((l, i) => <button key={i} onClick={() => { onOpen(l.sourceId === target ? l.targetId ?? l.sourceId : l.sourceId); onClose(); }}>{l.sourceId === target ? "↗" : "↙"} {documents.find(d => d.id === (l.sourceId === target ? l.targetId : l.sourceId))?.title ?? l.target}</button>)}</div> : null}
  </section></div>;
}
