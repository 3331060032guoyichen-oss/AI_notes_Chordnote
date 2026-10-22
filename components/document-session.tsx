"use client";
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "./markdown-editor";
import { patchProperties, readMarkdown, type LinkCandidate, type DocumentProperties } from "../lib/documents/markdown";
import type { Raw } from "../types/raw";
import type { Knowledge } from "../types/knowledge";

function PropertyGlyph({ kind }: { kind: "type" | "date" | "tag" | "source" | "text" }) {
  return <span className={`property-glyph property-glyph-${kind}`} aria-hidden="true">{
    kind === "date" ? "□" : kind === "tag" ? "◇" : kind === "source" ? "≡" : kind === "type" ? "☰" : "—"
  }</span>;
}

export function DocumentPropertiesPanel({ markdown, onChange, category, createdAt, updatedAt, sources = [] }: {
  markdown: string;
  onChange?: (markdown: string) => void;
  category?: string;
  createdAt?: string;
  updatedAt?: string;
  sources?: string[];
}) {
  let properties: DocumentProperties;
  try { properties = readMarkdown(markdown).properties; }
  catch { return null; }
  const edit = (patch: Partial<DocumentProperties>) => onChange?.(patchProperties(markdown, patch));
  const removeTag = (tag: string) => edit({ tags: properties.tags.filter(item => item !== tag) });
  const appendTags = (value: string) => {
    const additions = value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
    if (additions.length) edit({ tags: [...new Set([...properties.tags, ...additions])] });
  };
  const sourceList = sources.length ? sources : properties.source ? [properties.source] : [];
  const dateValue = (value?: string) => value ? value.slice(0, 10) : "";
  return <section className="document-properties" aria-label="笔记属性">
    <h2>笔记属性</h2>
    <div className="property-fields">
      {category ? <div className="property-row"><span className="property-name"><PropertyGlyph kind="type" />type</span><span className="property-value">{category}</span></div> : null}
      {properties.source ? <label className="property-row"><span className="property-name"><PropertyGlyph kind="source" />source</span><input value={properties.source} onChange={event => edit({ source: event.target.value })} readOnly={!onChange} /></label> : null}
      {properties.created || createdAt ? <label className="property-row"><span className="property-name"><PropertyGlyph kind="date" />created</span><input type="date" value={dateValue(properties.created || createdAt)} onChange={event => edit({ created: event.target.value })} readOnly={!onChange} /></label> : null}
      {updatedAt ? <div className="property-row"><span className="property-name"><PropertyGlyph kind="date" />updated</span><span className="property-value">{dateValue(updatedAt)}</span></div> : null}
      <div className="property-row property-tags-row"><span className="property-name"><PropertyGlyph kind="tag" />tags</span><div className="property-tags">
        {properties.tags.map(tag => <span className="property-tag" key={tag}>{tag}{onChange ? <button type="button" aria-label={`移除标签 ${tag}`} onClick={() => removeTag(tag)}>×</button> : null}</span>)}
        {onChange ? <input aria-label="添加标签" placeholder={properties.tags.length ? "+" : "添加标签"} onKeyDown={event => {
          if (event.key !== "Enter" && event.key !== "," && event.key !== "，") return;
          event.preventDefault(); appendTags(event.currentTarget.value); event.currentTarget.value = "";
        }} onBlur={event => { appendTags(event.currentTarget.value); event.currentTarget.value = ""; }} /> : null}
      </div></div>
      {sourceList.length ? <div className="property-row"><span className="property-name"><PropertyGlyph kind="source" />sources</span><span className="property-value property-sources">{sourceList.join("\n")}</span></div> : null}
      {properties.description ? <label className="property-row"><span className="property-name"><PropertyGlyph kind="text" />description</span><textarea value={properties.description} onChange={event => edit({ description: event.target.value })} readOnly={!onChange} rows={2} /></label> : null}
    </div>
  </section>;
}

export function DocumentSession({ document, kind, candidates, onOpenLink, onSaved }: {
  document: Raw | Knowledge; kind: "raw" | "knowledge"; candidates: readonly LinkCandidate[];
  onOpenLink: (target: string) => void; onSaved: (document: Raw | Knowledge) => void;
}) {
  const storageKey = `chordnote.edit.${kind}.${document.id}`;
  const [value, setValue] = useState(document.markdown ?? "");
  const [status, setStatus] = useState("");
  const local = useRef(value), saved = useRef(value), version = useRef(document.version), busy = useRef(false);
  const callback = useRef(onSaved); callback.current = onSaved;
  const external = document.markdown ?? "";
  useEffect(() => {
    let recovered: string | null = null;
    try { recovered = localStorage.getItem(storageKey); } catch { /* Autosave still works when browser storage is unavailable. */ }
    if (recovered && recovered !== external) { setValue(recovered); local.current = recovered; setStatus("已恢复未保存内容"); }
  // Each document has a keyed session; this effect only restores on entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  useEffect(() => {
    if (local.current === saved.current && !busy.current && external !== saved.current) {
      local.current = external; saved.current = external; version.current = document.version; setValue(external);
    }
  }, [external, document.version]);
  function change(next: string) {
    local.current = next; setValue(next);
    try { localStorage.setItem(storageKey, next); } catch { /* The server save remains authoritative. */ }
    setStatus("未保存");
  }
  useEffect(() => {
    if (value === saved.current) return;
    let disposed = false;
    const timer = setTimeout(async function save() {
      if (busy.current) { if (!disposed) setTimeout(save, 300); return; }
      const snapshot = local.current;
      if (snapshot === saved.current || disposed) return;
      busy.current = true; setStatus("保存中");
      try {
        readMarkdown(snapshot);
        const response = await fetch(`/api/${kind === "raw" ? "raw" : "knowledge"}/${document.id}`, {
          method: "PATCH", headers: { "content-type": "application/json" },
          body: JSON.stringify({ markdown: snapshot, ...(kind === "raw" ? { text: snapshot } : {}), version: version.current }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "保存失败");
        const updated = (kind === "raw" ? payload.raw : payload.knowledge) as Raw | Knowledge;
        saved.current = snapshot; version.current = updated.version; callback.current(updated);
        if (local.current === snapshot) {
          try { localStorage.removeItem(storageKey); } catch { /* Optional recovery storage. */ }
          setStatus("已保存");
        }
        else if (!disposed) setTimeout(save, 200);
      } catch (error) { setStatus(error instanceof Error ? error.message : "保存失败，编辑已保留"); }
      finally { busy.current = false; }
    }, 700);
    return () => { disposed = true; clearTimeout(timer); };
  }, [value, kind, document.id, storageKey]);
  return <section className="document-session">
    <DocumentPropertiesPanel markdown={value} onChange={change}
      category={document.path?.replace(/\\/g, "/").split("/")[1]}
      createdAt={(document as Knowledge).createdAt ?? (document as Raw).createdAt}
      updatedAt={kind === "knowledge" ? (document as Knowledge).updatedAt : undefined}
      sources={kind === "knowledge" ? (document as Knowledge).sourceRawIds : []} />
    <MarkdownEditor value={value} onChange={change} candidates={candidates} sourcePath={document.path} onOpenLink={onOpenLink} />
    <div className="document-status" role="status">{status}</div>
  </section>;
}
