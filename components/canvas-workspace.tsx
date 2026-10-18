"use client";
import { useEffect, useRef, useState } from "react";
import type { CanvasDocument } from "../lib/services/canvases";
import type { LinkCandidate } from "../lib/documents/markdown";
export function CanvasWorkspace({ candidates, onOpen }: { candidates: readonly LinkCandidate[]; onOpen: (id: string) => void }) {
  const [doc, setDoc] = useState<CanvasDocument>({ cards: [], edges: [] });
  const [ready, setReady] = useState(false), [status, setStatus] = useState("");
  const [linkStart, setLinkStart] = useState<string | null>(null), [showArchive, setShowArchive] = useState(false);
  const version = useRef(0), revision = useRef(0), saved = useRef(0), busy = useRef(false), latest = useRef(doc);
  latest.current = doc;
  const drag = useRef<{id:string;x:number;y:number;left:number;top:number}|null>(null);
  useEffect(() => { let active = true; void fetch("/api/canvas").then(r => {if(!r.ok)throw new Error("白板读取失败");return r.json();}).then(data => {
    if (!active) return;
    if (data.canvas) { setDoc(data.canvas.document); version.current = data.canvas.version; }
    try { const recovery = localStorage.getItem("chordnote.canvas.pending");
    if (recovery) { const parsed=JSON.parse(recovery); if(Array.isArray(parsed.cards)&&Array.isArray(parsed.edges)){setDoc(parsed); revision.current++; setStatus("已恢复未保存白板");} } } catch {setStatus("本机恢复副本不可用");}
    setReady(true);
  }).catch(() => setStatus("白板读取失败")); return () => { active = false; }; }, []);
  function edit(update: (current: CanvasDocument) => CanvasDocument) { revision.current++; setDoc(current => { const next = update(current); try {localStorage.setItem("chordnote.canvas.pending", JSON.stringify(next));} catch { /* Server autosave remains available. */ } return next; }); }
  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = setInterval(async () => {
      if (busy.current || revision.current === saved.current) return;
      busy.current = true; const snap = revision.current;
      try { const r = await fetch("/api/canvas", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ document: latest.current, version: version.current }) }); const p = await r.json(); if (!r.ok) throw new Error(p.error?.message); version.current = p.canvas.version; saved.current = snap; if (snap === revision.current) {try {localStorage.removeItem("chordnote.canvas.pending");} catch { /* Storage unavailable. */ }} if (active) setStatus("已保存"); }
      catch (e) { if (active) setStatus(e instanceof Error ? e.message : "保存失败"); } finally { busy.current = false; }
    }, 900); return () => { active = false; clearInterval(timer); };
  }, [ready]);
  return <section className="canvas-workspace"><div className="canvas-tools"><button disabled={!ready} onClick={() => edit(d => ({ ...d, cards: [...d.cards, { id: crypto.randomUUID(), x: 40 + d.cards.length * 24, y: 40 + d.cards.length * 24, text: "" }] }))}>＋ 卡片</button>
    <select disabled={!ready} aria-label="添加笔记到白板" value="" onChange={e => { const n = candidates.find(n => n.id === e.target.value); if (n) edit(d => ({ ...d, cards: [...d.cards, { id: crypto.randomUUID(), x: 80, y: 80, text: n.title ?? "未命名", noteId: n.id }] })); }}><option value="">添加笔记</option>{candidates.map(n => <option key={n.id} value={n.id}>{n.title}</option>)}</select>
    <button onClick={() => setShowArchive(v => !v)}>卡片归档</button><span role="status">{status}</span></div>
    {showArchive ? <div>{doc.cards.filter(c => c.archived).map(c => <button key={c.id} onClick={() => edit(d => ({ ...d, cards: d.cards.map(n => n.id === c.id ? { ...n, archived: false } : n) }))}>恢复 {c.text || "卡片"}</button>)}</div> : null}
    <div className="canvas-viewport"><div className="canvas-board" onPointerMove={e => { const d = drag.current; if (!d) return; edit(current => ({ ...current, cards: current.cards.map(c => c.id === d.id ? { ...c, x: Math.max(0, d.left + e.clientX - d.x), y: Math.max(0, d.top + e.clientY - d.y) } : c) })); }} onPointerUp={() => { drag.current = null; }}>
      <svg className="canvas-connections" width="2400" height="1600">{doc.edges.map((edge, i) => { const a = doc.cards.find(c => c.id === edge.from && !c.archived), b = doc.cards.find(c => c.id === edge.to && !c.archived); return a && b ? <line key={i} x1={a.x+110} y1={a.y+60} x2={b.x+110} y2={b.y+60} stroke="currentColor" /> : null; })}</svg>
      {doc.cards.filter(c => !c.archived).map(card => <article className="canvas-card" key={card.id} style={{ left:card.x, top:card.y }}><header onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { id:card.id, x:e.clientX,y:e.clientY,left:card.x,top:card.y }; }}><span>⠿</span><button onClick={() => { if (linkStart && linkStart !== card.id) { edit(d => ({ ...d, edges:[...d.edges,{from:linkStart,to:card.id}] })); setLinkStart(null); } else setLinkStart(card.id); }}>{linkStart === card.id ? "选择另一卡片" : "连接"}</button><button onClick={() => edit(d => ({...d,cards:d.cards.map(c => c.id === card.id ? {...c,archived:true}:c)}))}>归档</button></header>
        {card.noteId ? <button onClick={() => onOpen(card.noteId!)}>{card.text}</button> : <textarea aria-label="白板卡片" value={card.text} onChange={e => edit(d => ({...d,cards:d.cards.map(c => c.id === card.id ? {...c,text:e.target.value}:c)}))} />}</article>)}
    </div></div></section>;
}
