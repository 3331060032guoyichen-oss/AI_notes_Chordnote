"use client";
import { useEffect, useState } from "react";
export function AgentModelSelect() {
  const [model, setModel] = useState(""), [models, setModels] = useState<string[]>([]), [locked, setLocked] = useState(false), [error, setError] = useState("");
  useEffect(() => { let active = true; const load = () => { void fetch("/api/settings/model").then(r => r.json()).then(async p => {
    if (!active || !p.settings) return; setModel(p.settings.model); setModels([p.settings.model]); setLocked(p.settings.locked.includes("model"));
    const r = await fetch("/api/settings/model/models"); if (r.ok) { const list = await r.json(); if (active) setModels([...new Set([p.settings.model, ...list.models])]); }
  }).catch(() => { if (active) setError("模型配置读取失败"); }); }; load(); window.addEventListener("chordnote-model-changed", load); return () => { active = false; window.removeEventListener("chordnote-model-changed", load); }; }, []);
  return <label className="composer-model"><select aria-label="Agent 模型" disabled={locked || !model} value={model} onChange={async e => {
    const next = e.target.value; const r = await fetch("/api/settings/model", { method: "PATCH", headers: {"content-type":"application/json"}, body: JSON.stringify({ model: next }) });
    if (r.ok) { setModel(next); setError(""); } else setError("模型选择未保存");
  }}>{models.map(id => <option key={id} value={id}>{id}</option>)}</select>{error ? <span role="alert">{error}</span> : null}</label>;
}
