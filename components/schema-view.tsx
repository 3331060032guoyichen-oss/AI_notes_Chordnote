"use client";
import { useEffect, useState } from "react";
import { MarkdownEditor } from "./markdown-editor";
const EMPTY: [] = [];
export function SchemaView() {
  const [schema, setSchema] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [hash, setHash] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { let active = true; void fetch("/api/agent/schema").then(async r => {
    if (!r.ok) throw new Error("Schema 暂时无法读取");
    const data = await r.json();
    if (active) { setSchema(data.schema); setSaved(data.schema); setHash(data.hash); }
  }).catch(e => { if (active) setError(String(e.message)); }); return () => { active = false; }; }, []);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (schema !== saved) event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [schema, saved]);
  async function save() {
    const content = schema;
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/agent/schema", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ schema: content, hash }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Schema 保存失败");
      setSaved(content); setHash(data.hash);
    } catch (error) { setError(error instanceof Error ? error.message : "Schema 保存失败"); }
    finally { setSaving(false); }
  }
  return <section className="schema-view">
    <div className="schema-toolbar">
      <span role="status">{!hash ? "正在读取…" : saving ? "正在保存…" : schema !== saved ? "有未保存修改，离开前请保存" : "已保存 · 下次 Agent 运行生效"}</span>
      <button type="button" disabled={!hash || saving || schema === saved} onClick={() => void save()}>保存 Schema</button>
    </div>
    {error && <p role="alert">{error}</p>}
    {hash && <MarkdownEditor value={schema} onChange={setSchema} candidates={EMPTY} onOpenLink={() => {}} label="LLM Wiki Schema（Markdown 编辑）" />}
  </section>;
}
