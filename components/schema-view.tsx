"use client";
import { useEffect, useState } from "react";
import { MarkdownEditor } from "./markdown-editor";
const EMPTY: [] = [];
export function SchemaView() {
  const [schema, setSchema] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { let active = true; void fetch("/api/agent/schema").then(async r => {
    if (!r.ok) throw new Error("Schema 暂时无法读取");
    const data = await r.json();
    if (active) setSchema(data.schema);
  }).catch(e => { if (active) setError(String(e.message)); }); return () => { active = false; }; }, []);
  return <section className="schema-view">{error ? <p role="alert">{error}</p> : <MarkdownEditor value={schema} candidates={EMPTY} onOpenLink={() => {}} readOnly label="LLM Wiki 工作流（只读）" />}</section>;
}
