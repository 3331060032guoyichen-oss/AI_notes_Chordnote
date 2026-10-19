"use client";
import type { Raw } from "../types/raw";
import type { Knowledge } from "../types/knowledge";

export function WorkspaceTree({ raws, notes, rawLabel, onRaw, onNote, onView, onRawMenu, onNoteMenu }: {
  raws: Raw[]; notes: Knowledge[]; rawLabel: (raw: Raw) => string;
  onRaw: (raw: Raw) => void; onNote: (note: Knowledge) => void; onView: (view: "schema" | "readme" | "new-note") => void;
  onRawMenu: (raw: Raw, x: number, y: number) => void; onNoteMenu: (note: Knowledge, x: number, y: number) => void;
}) {
  const rawFolders = ["articles", "papers", "books", "media", "data"];
  const wikiFolders = ["index", "entitles", "concept", "sources", "synthesis", "questions", "overview"];
  const inboxRaws = raws.filter(raw => raw.path?.split("/")[1] === "inbox");
  return <nav className="document-tree" aria-label="笔记目录">
    <details open><summary>raw</summary>{rawFolders.map(folder => <details open={folder === "articles"} key={folder}><summary>{folder}</summary>
      {raws.filter(r => (r.path?.split("/")[1] ?? "articles") === folder).map(raw => <button key={raw.id} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}>{rawLabel(raw)}</button>)}
    </details>)}{raws.filter(r => r.path && r.path.split("/")[1] !== "inbox" && !rawFolders.includes(r.path.split("/")[1])).map(raw => <button key={raw.id} onClick={() => onRaw(raw)} title={raw.path}>{rawLabel(raw)}</button>)}</details>
    <button onClick={() => onView("schema")}>Schema</button>
    <details className="tree-inbox" open><summary>未整理笔记</summary>
      <button className="tree-new" onClick={() => onView("new-note")}>＋ 新建笔记</button>
      {inboxRaws.map(raw => <button key={raw.id} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}>{rawLabel(raw)}</button>)}
    </details>
    <details open><summary>wiki</summary>{wikiFolders.map(folder => <details open={folder === "concept"} key={folder}><summary>{folder}</summary>
      {notes.filter(n => (n.path?.split("/")[1] ?? "concept") === folder).map(note => <button key={note.id} onClick={() => onNote(note)} onContextMenu={e => { e.preventDefault(); onNoteMenu(note, e.clientX, e.clientY); }}>{note.title}</button>)}
    </details>)}{notes.filter(n => n.path && !wikiFolders.includes(n.path.split("/")[1])).map(note => <button key={note.id} onClick={() => onNote(note)} title={note.path}>{note.title}</button>)}</details>
    <button onClick={() => onView("readme")}>readme</button>
  </nav>;
}
