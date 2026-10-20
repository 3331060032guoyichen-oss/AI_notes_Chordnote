"use client";
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "./markdown-editor";
import { patchProperties, readMarkdown, type LinkCandidate, type DocumentProperties } from "../lib/documents/markdown";
import type { Raw } from "../types/raw";
import type { Knowledge } from "../types/knowledge";

export function DocumentSession({ document, kind, candidates, onOpenLink, onSaved }: {
  document: Raw | Knowledge; kind: "raw" | "knowledge"; candidates: readonly LinkCandidate[];
  onOpenLink: (target: string) => void; onSaved: (document: Raw | Knowledge) => void;
}) {
  const storageKey = `chordnote.edit.${kind}.${document.id}`;
  const [value, setValue] = useState(document.markdown ?? "");
  const [status, setStatus] = useState("");
  const [expanded, setExpanded] = useState(false);
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
  let properties: DocumentProperties | null = null;
  try { properties = readMarkdown(value).properties; } catch { /* Save displays YAML validation errors. */ }
  return <section className="document-session">
    {kind === "knowledge" && properties ? <details className="document-properties" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
      <summary>属性</summary>
      <div className="property-fields">{(["title", "source", "created", "description", "tags"] as const).map(key => <label key={key}><span>{key}</span><input type={key === "created" ? "date" : "text"}
        value={key === "tags" ? properties!.tags.join(", ") : properties![key]}
        onChange={event => change(patchProperties(local.current, { [key]: key === "tags" ? event.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean) : event.target.value }))} /></label>)}</div>
    </details> : null}
    <MarkdownEditor value={value} onChange={change} candidates={candidates} sourcePath={document.path} onOpenLink={onOpenLink} />
    <div className="document-status" role="status">{status}</div>
  </section>;
}
