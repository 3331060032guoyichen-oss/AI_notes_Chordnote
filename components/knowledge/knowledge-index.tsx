"use client";

import { useMemo, useState } from "react";
import type { Knowledge } from "../../types/knowledge";
import { getPreview } from "../../lib/text-preview";
import { IconClose, IconNote, IconPlus, IconSearch } from "../ui/icons";

export function KnowledgeIndex({ notes, onOpen, onNewNote }: {
  notes: Knowledge[];
  onOpen: (note: Knowledge) => void;
  onNewNote: () => void;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return notes.filter(note => [note.title, note.summary, ...note.keywords].join(" ").toLocaleLowerCase().includes(needle))
      .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title, "zh-CN") : Date.parse(sort === "created" ? b.createdAt : b.updatedAt) - Date.parse(sort === "created" ? a.createdAt : a.updatedAt));
  }, [notes, query, sort]);

  return <section className="knowledge-library" aria-labelledby="knowledge-library-title">
    <header className="library-heading"><h1 id="knowledge-library-title">知识页<span>{notes.length}</span></h1><button type="button" className="button-secondary" onClick={onNewNote}><IconPlus />新建笔记</button></header>
    {notes.length ? <>
      <div className="library-toolbar"><label className="library-search"><IconSearch /><input aria-label="筛选知识页" placeholder="搜索标题、摘要或标签" value={query} onChange={event => setQuery(event.target.value)} />{query ? <button type="button" aria-label="清空筛选" onClick={() => setQuery("")}><IconClose /></button> : null}</label><select aria-label="知识页排序" value={sort} onChange={event => setSort(event.target.value)}><option value="updated">最近更新</option><option value="created">最近创建</option><option value="title">按标题排序</option></select></div>
      <div className="library-list-heading"><span>笔记 · {visibleNotes.length}</span><span>更新时间</span></div>
      <div className="library-list">{visibleNotes.map(note => <button className="library-row" type="button" key={note.id} onClick={() => onOpen(note)}>
        <span className="library-note-icon"><IconNote /></span><span className="library-note-copy"><strong>{note.title}</strong><span>{getPreview(note.summary || note.content, 110)}</span>{note.keywords.length ? <span className="library-note-tags">{note.keywords.slice(0, 3).map(tag => <small key={tag}>#{tag}</small>)}</span> : null}</span><time dateTime={note.updatedAt}>{new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(new Date(note.updatedAt))}</time><span className="library-row-arrow" aria-hidden="true">↗</span>
      </button>)}</div>
      {visibleNotes.length === 0 ? <div className="library-empty"><h2>无匹配结果</h2><button type="button" className="text-button" onClick={() => setQuery("")}>清空筛选</button></div> : null}
    </> : <div className="library-empty"><IconNote /><h2>暂无知识页</h2><button type="button" className="button-secondary" onClick={onNewNote}><IconPlus />新建笔记</button></div>}
  </section>;
}
