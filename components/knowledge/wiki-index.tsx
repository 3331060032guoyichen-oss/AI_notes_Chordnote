"use client";

import { useMemo } from "react";

import { WIKI_FOLDER_HINTS, wikiCategory, type WikiCategory } from "../../lib/documents/structure";
import type { Knowledge } from "../../types/knowledge";

const groupMeta: Record<WikiCategory, { label: string }> = {
  entitles: { label: "Entities（实体）" },
  concept: { label: "Concepts（概念）" },
  sources: { label: "Sources（源文档）" },
  synthesis: { label: "Synthesis（综合分析）" },
  questions: { label: "Questions（问题探索）" },
  index: { label: "Index（索引）" },
  overview: { label: "Overview（总览）" },
};

const orderedGroups: WikiCategory[] = ["entitles", "concept", "sources", "synthesis", "questions", "index", "overview"];

function updatedLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric" }).format(date);
}

export function WikiIndexView({ notes, onOpen }: { notes: Knowledge[]; onOpen: (note: Knowledge) => void }) {
  const groups = useMemo(() => {
    const buckets = new Map<WikiCategory, Knowledge[]>();
    for (const note of notes) {
      const category = wikiCategory(note.path);
      buckets.set(category, [...(buckets.get(category) ?? []), note]);
    }
    return orderedGroups
      .map(category => ({ category, notes: (buckets.get(category) ?? []).sort((a, b) => a.title.localeCompare(b.title, "zh-CN")) }))
      .filter(group => group.notes.length > 0);
  }, [notes]);

  return <section className="wiki-index" aria-labelledby="wiki-index-title">
    <header className="wiki-index-head">
      <div>
        <h1 id="wiki-index-title">Wiki Index<span>{notes.length}</span></h1>
        <p>按页面类型组织的只读索引。点击条目打开知识页；索引由当前知识库实时生成，不是单独的文件。</p>
      </div>
    </header>

    <details className="wiki-format">
      <summary>页面格式速览</summary>
      <div className="wiki-format-grid">
        <article className="wiki-format-card" data-tone="frontmatter">
          <h2>Frontmatter</h2>
          <pre>{`---
type: [entity|concept|source|synthesis|question]
created: YYYY-MM-DD
updated: YYYY-MM-DD
tags: []
sources: []   # 引用的原始资料路径
---`}</pre>
        </article>
        <article className="wiki-format-card" data-tone="citation">
          <h2>引用格式</h2>
          <pre>{`> 原文引用内容
>
> — 来源：[[raw/articles/article-name.md]]`}</pre>
        </article>
      </div>
    </details>

    {groups.length ? groups.map(group => <section className="wiki-group" data-category={group.category} key={group.category}>
      <header className="wiki-group-header">
        <h2>{groupMeta[group.category].label}</h2>
        <span>{group.notes.length} 页</span>
        <span>{WIKI_FOLDER_HINTS[group.category]}</span>
      </header>
      <div className="wiki-group-list">
        {group.notes.map(note => <button className="wiki-entry" type="button" key={note.id} onClick={() => onOpen(note)}>
          <span className="wiki-entry-main">
            <strong>{note.title}</strong>
            <span>{note.summary || note.content.slice(0, 90)}</span>
          </span>
          <span className="wiki-entry-meta">{note.sourceRawIds.length} {note.sourceRawIds.length === 1 ? "source" : "sources"} · {updatedLabel(note.updatedAt)}</span>
        </button>)}
      </div>
    </section>) : <div className="library-empty">
      <h2>暂无知识页</h2>
      <p>整理一份原始记录后，Wiki Index 会按类型自动出现。</p>
    </div>}
  </section>;
}
