"use client";

import { useEffect, useRef, useState } from "react";

import type { CanvasDocument, CanvasImage, CanvasPoint } from "../lib/services/canvases";

type Selection = { kind: "card" | "image"; id: string } | null;
type DragState = { kind: "card" | "image"; id: string; clientX: number; clientY: number; x: number; y: number };
type LinkDraft = { from: string; x: number; y: number } | null;

const EMPTY_CANVAS: CanvasDocument = { cards: [], edges: [], images: [], strokes: [] };

function normalizeDocument(document: CanvasDocument): CanvasDocument {
  return { cards: document.cards, edges: document.edges, images: document.images ?? [], strokes: document.strokes ?? [] };
}

function strokePath(points: CanvasPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("图片无法读取"));
    reader.onerror = () => reject(new Error("图片无法读取"));
    reader.readAsDataURL(file);
  });
}

function imageSize(src: string) {
  return new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 360 / Math.max(image.naturalWidth, 1), 300 / Math.max(image.naturalHeight, 1));
      resolve({ width: Math.max(120, Math.round(image.naturalWidth * scale)), height: Math.max(80, Math.round(image.naturalHeight * scale)) });
    };
    image.onerror = () => resolve({ width: 300, height: 220 });
    image.src = src;
  });
}

export function CanvasWorkspace({ onOpen }: { onOpen: (id: string) => void }) {
  const [doc, setDoc] = useState<CanvasDocument>(EMPTY_CANVAS);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("");
  const [selection, setSelection] = useState<Selection>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const version = useRef(0), revision = useRef(0), saved = useRef(0), busy = useRef(false), latest = useRef(doc);
  const drag = useRef<DragState | null>(null), drawing = useRef<string | null>(null);
  latest.current = doc;

  useEffect(() => {
    let active = true;
    void fetch("/api/canvas").then(response => {
      if (!response.ok) throw new Error("白板读取失败");
      return response.json();
    }).then(data => {
      if (!active) return;
      if (data.canvas) { setDoc(normalizeDocument(data.canvas.document)); version.current = data.canvas.version; }
      try {
        const recovery = localStorage.getItem("chordnote.canvas.pending");
        if (recovery) {
          const parsed = JSON.parse(recovery) as CanvasDocument;
          if (Array.isArray(parsed.cards) && Array.isArray(parsed.edges)) {
            setDoc(normalizeDocument(parsed)); revision.current += 1; setStatus("已恢复未保存白板");
          }
        }
      } catch { setStatus("本机恢复副本不可用"); }
      setReady(true);
    }).catch(() => setStatus("白板读取失败"));
    return () => { active = false; };
  }, []);

  function edit(update: (current: CanvasDocument) => CanvasDocument) {
    revision.current += 1;
    setDoc(current => {
      const next = normalizeDocument(update(current));
      try { localStorage.setItem("chordnote.canvas.pending", JSON.stringify(next)); }
      catch { setStatus("本机恢复副本空间不足，仍会保存到后端"); }
      return next;
    });
  }

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const timer = window.setInterval(async () => {
      if (busy.current || revision.current === saved.current) return;
      busy.current = true;
      const snapshot = revision.current;
      try {
        const response = await fetch("/api/canvas", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ document: latest.current, version: version.current }) });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "白板保存失败");
        version.current = payload.canvas.version; saved.current = snapshot;
        if (snapshot === revision.current) try { localStorage.removeItem("chordnote.canvas.pending"); } catch { /* Server copy is authoritative. */ }
        if (active) setStatus("已保存");
      } catch (error) { if (active) setStatus(error instanceof Error ? error.message : "保存失败"); }
      finally { busy.current = false; }
    }, 900);
    return () => { active = false; window.clearInterval(timer); };
  }, [ready]);

  useEffect(() => {
    if (status !== "已保存") return;
    const timer = window.setTimeout(() => setStatus(""), 1300);
    return () => window.clearTimeout(timer);
  }, [status]);

  function pointFromClient(clientX: number, clientY: number): CanvasPoint {
    const bounds = boardRef.current?.getBoundingClientRect();
    return { x: Math.max(0, clientX - (bounds?.left ?? 0)), y: Math.max(0, clientY - (bounds?.top ?? 0)) };
  }

  function visibleCenter(): CanvasPoint {
    const viewport = viewportRef.current;
    return viewport ? { x: viewport.scrollLeft + viewport.clientWidth / 2 - 110, y: viewport.scrollTop + viewport.clientHeight / 2 - 70 } : { x: 80, y: 80 };
  }

  function addSticky(point: CanvasPoint) {
    const id = crypto.randomUUID();
    edit(current => ({ ...current, cards: [...current.cards, { id, x: Math.min(point.x, 2260), y: Math.min(point.y, 1500), text: "" }] }));
    setSelection({ kind: "card", id }); setEditingId(id);
  }

  async function addImages(files: File[], point: CanvasPoint) {
    const accepted = files.filter(file => file.type.startsWith("image/") && file.size <= 2_800_000).slice(0, 8);
    if (!accepted.length) { setStatus("请选择小于 2.8 MB 的 PNG、JPEG、GIF 或 WebP 图片"); return; }
    try {
      const images: CanvasImage[] = [];
      for (const [index, file] of accepted.entries()) {
        const src = await readAsDataUrl(file), size = await imageSize(src);
        images.push({ id: crypto.randomUUID(), x: Math.min(point.x + index * 28, 2200), y: Math.min(point.y + index * 28, 1480), width: size.width, height: size.height, src, name: file.name });
      }
      edit(current => ({ ...current, images: [...(current.images ?? []), ...images] }));
      setSelection({ kind: "image", id: images.at(-1)!.id });
    } catch (error) { setStatus(error instanceof Error ? error.message : "图片无法加入白板"); }
  }

  function startMove(event: React.PointerEvent<HTMLElement>, kind: "card" | "image", id: string, x: number, y: number) {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button, textarea")) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { kind, id, clientX: event.clientX, clientY: event.clientY, x, y };
    setSelection({ kind, id });
  }

  function deleteSelected() {
    if (!selection) return;
    edit(current => ({
      ...current,
      cards: selection.kind === "card" ? current.cards.filter(card => card.id !== selection.id) : current.cards,
      images: selection.kind === "image" ? (current.images ?? []).filter(image => image.id !== selection.id) : current.images,
      edges: current.edges.filter(edge => edge.from !== selection.id && edge.to !== selection.id),
    }));
    setEditingId(null);
    setLinkDraft(null);
    drag.current = null;
    setSelection(null);
  }

  function nodeCenter(id: string): CanvasPoint | null {
    const card = doc.cards.find(item => item.id === id && !item.archived);
    if (card) return { x: card.x + 114, y: card.y + 68 };
    const image = (doc.images ?? []).find(item => item.id === id && !item.archived);
    return image ? { x: image.x + image.width / 2, y: image.y + image.height / 2 } : null;
  }

  function beginLink(event: React.PointerEvent<HTMLButtonElement>, from: string) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
    setLinkDraft({ from, ...pointFromClient(event.clientX, event.clientY) });
  }
  function moveLink(event: React.PointerEvent<HTMLButtonElement>) {
    if (linkDraft) setLinkDraft({ from: linkDraft.from, ...pointFromClient(event.clientX, event.clientY) });
  }
  function finishLink(event: React.PointerEvent<HTMLButtonElement>) {
    if (!linkDraft) return;
    const element = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
    const target = element?.closest<HTMLElement>("[data-canvas-node-id]")?.dataset.canvasNodeId;
    if (target && target !== linkDraft.from) edit(current => current.edges.some(edge => (edge.from === linkDraft.from && edge.to === target) || (edge.from === target && edge.to === linkDraft.from))
      ? current : { ...current, edges: [...current.edges, { from: linkDraft.from, to: target }] });
    setLinkDraft(null);
  }

  return <section className="canvas-workspace" aria-label="自由白板">
    <div ref={viewportRef} className="canvas-viewport" onDragOver={event => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }} onDrop={event => { event.preventDefault(); void addImages(Array.from(event.dataTransfer.files), pointFromClient(event.clientX, event.clientY)); }} onPaste={event => { const files = Array.from(event.clipboardData.files); if (files.some(file => file.type.startsWith("image/"))) { event.preventDefault(); void addImages(files, visibleCenter()); } }}>
      <div ref={boardRef} className="canvas-board" tabIndex={0}
        onDoubleClick={event => { if (!(event.target as HTMLElement).closest("[data-canvas-node-id]")) addSticky(pointFromClient(event.clientX, event.clientY)); }}
        onPointerDown={event => {
          if ((event.target as HTMLElement).closest("[data-canvas-node-id]")) return;
          setSelection(null);
          if (!event.shiftKey || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          const id = crypto.randomUUID(), point = pointFromClient(event.clientX, event.clientY);
          drawing.current = id;
          edit(current => ({ ...current, strokes: [...(current.strokes ?? []), { id, color: "#35332f", width: 3, points: [point] }] }));
        }}
        onPointerMove={event => {
          const moving = drag.current;
          if (moving) {
            const x = Math.max(0, moving.x + event.clientX - moving.clientX), y = Math.max(0, moving.y + event.clientY - moving.clientY);
            edit(current => moving.kind === "card" ? { ...current, cards: current.cards.map(card => card.id === moving.id ? { ...card, x, y } : card) } : { ...current, images: (current.images ?? []).map(image => image.id === moving.id ? { ...image, x, y } : image) });
            return;
          }
          const strokeId = drawing.current;
          if (!strokeId) return;
          const point = pointFromClient(event.clientX, event.clientY);
          edit(current => ({ ...current, strokes: (current.strokes ?? []).map(stroke => {
            if (stroke.id !== strokeId) return stroke;
            const previous = stroke.points.at(-1);
            return previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 2.5 ? stroke : { ...stroke, points: [...stroke.points, point] };
          }) }));
        }}
        onPointerUp={() => { drag.current = null; drawing.current = null; }} onPointerCancel={() => { drag.current = null; drawing.current = null; setLinkDraft(null); }}
        onKeyDown={event => {
          if ((event.target as HTMLElement).matches("textarea, input")) return;
          if ((event.key === "Delete" || event.key === "Backspace") && selection) { event.preventDefault(); deleteSelected(); }
          else if (event.key === "Escape") setSelection(null);
          else if (event.key.toLowerCase() === "n") { event.preventDefault(); addSticky(visibleCenter()); }
        }}>
        <svg className="canvas-ink" width="2400" height="1600" aria-hidden="true">
          {(doc.strokes ?? []).map(stroke => <path key={stroke.id} d={strokePath(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width} strokeLinecap="round" strokeLinejoin="round" />)}
          {doc.edges.map((edge, index) => { const from = nodeCenter(edge.from), to = nodeCenter(edge.to); if (!from || !to) return null; const bend = Math.max(42, Math.abs(to.x - from.x) * .42); return <path key={`${edge.from}-${edge.to}-${index}`} className="canvas-edge" d={`M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`} />; })}
          {linkDraft ? (() => { const from = nodeCenter(linkDraft.from); return from ? <path className="canvas-edge is-draft" d={`M ${from.x} ${from.y} L ${linkDraft.x} ${linkDraft.y}`} /> : null; })() : null}
        </svg>
        {doc.cards.filter(card => !card.archived).map(card => {
          const selected = selection?.kind === "card" && selection.id === card.id;
          return <article className={`canvas-card${selected ? " is-selected" : ""}${card.noteId ? " is-note" : ""}`} data-canvas-node-id={card.id} key={card.id} style={{ left: card.x, top: card.y }} onPointerDown={event => startMove(event, "card", card.id, card.x, card.y)} onClick={() => setSelection({ kind: "card", id: card.id })}>
            {selected ? <><div className="canvas-item-actions"><button type="button" onClick={event => { event.stopPropagation(); deleteSelected(); }}>删除</button></div><button className="canvas-connect-handle" type="button" aria-label="拖到另一个项目建立连线" title="拖拽连线" onPointerDown={event => beginLink(event, card.id)} onPointerMove={moveLink} onPointerUp={finishLink} /></> : null}
            {card.noteId ? <button className="canvas-note-link" type="button" onDoubleClick={() => onOpen(card.noteId!)}>{card.text || "未命名笔记"}</button> : <textarea aria-label="白板便签" autoFocus={editingId === card.id} value={card.text} placeholder="写点什么…" onFocus={() => { setSelection({ kind: "card", id: card.id }); setEditingId(card.id); }} onBlur={() => setEditingId(current => current === card.id ? null : current)} onChange={event => edit(current => ({ ...current, cards: current.cards.map(item => item.id === card.id ? { ...item, text: event.target.value } : item) }))} />}
          </article>;
        })}
        {(doc.images ?? []).filter(image => !image.archived).map(image => {
          const selected = selection?.kind === "image" && selection.id === image.id;
          return <figure className={`canvas-image${selected ? " is-selected" : ""}`} data-canvas-node-id={image.id} key={image.id} style={{ left: image.x, top: image.y, width: image.width, height: image.height }} onPointerDown={event => startMove(event, "image", image.id, image.x, image.y)} onClick={() => setSelection({ kind: "image", id: image.id })}>
            {selected ? <><div className="canvas-item-actions"><button type="button" onClick={event => { event.stopPropagation(); deleteSelected(); }}>删除</button></div><button className="canvas-connect-handle" type="button" aria-label="拖到另一个项目建立连线" title="拖拽连线" onPointerDown={event => beginLink(event, image.id)} onPointerMove={moveLink} onPointerUp={finishLink} /></> : null}
            {/* eslint-disable-next-line @next/next/no-img-element -- local pasted image data has no remote optimizer URL. */}
            <img src={image.src} alt={image.name || "白板图片"} draggable={false} />
          </figure>;
        })}
        {!ready ? <p className="canvas-loading">正在展开白板…</p> : null}
        <p className="canvas-hint">双击写字 · N 新建便签 · Shift 拖动涂画 · 拖入或粘贴图片</p>
        {status ? <p className="canvas-status" role="status">{status}</p> : null}
      </div>
    </div>
  </section>;
}
