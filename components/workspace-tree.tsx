"use client";
import type { Raw } from "../types/raw";
import type { Knowledge } from "../types/knowledge";
import { RAW_FOLDERS, WIKI_FOLDERS, rawCategory } from "../lib/documents/structure";

export function WorkspaceTree({ raws, notes, archivedNotes = [], rawLabel, onRaw, onNote, onView, onRawMenu, onNoteMenu }: {
  raws: Raw[]; notes: Knowledge[]; archivedNotes?: Knowledge[]; rawLabel: (raw: Raw) => string;
  onRaw: (raw: Raw) => void; onNote: (note: Knowledge) => void; onView: (view: "schema" | "readme" | "new-note") => void;
  onRawMenu: (raw: Raw, x: number, y: number) => void; onNoteMenu: (note: Knowledge, x: number, y: number) => void;
}) {
  const rawFolders = RAW_FOLDERS;
  const wikiFolders = WIKI_FOLDERS;
  const organizedRawIds = new Set([...notes, ...archivedNotes].map(note => note.rawId));
  const unorganizedRaws = raws.filter(raw => !organizedRawIds.has(raw.id));
  const organizedRaws = raws.filter(raw => organizedRawIds.has(raw.id));
  return <nav className="document-tree" aria-label="笔记目录">
    <details><summary>Raw</summary>{rawFolders.map(folder => <details key={folder}><summary>{folder}</summary>
      {organizedRaws.filter(r => rawCategory(r.path) === folder).map(raw => <button key={raw.id} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}>{rawLabel(raw)}</button>)}
    </details>)}</details>
    <details><summary>Wiki</summary>{wikiFolders.map(folder => <details key={folder}><summary>{folder}</summary>
      {notes.filter(n => (n.path?.split("/")[1] ?? "concept") === folder).map(note => <button key={note.id} onClick={() => onNote(note)} onContextMenu={e => { e.preventDefault(); onNoteMenu(note, e.clientX, e.clientY); }}>{note.title}</button>)}
    </details>)}{notes.filter(n => n.path && !wikiFolders.includes(n.path.split("/")[1])).map(note => <button key={note.id} onClick={() => onNote(note)} title={note.path}>{note.title}</button>)}</details>
    <details className="tree-inbox"><summary>未整理笔记</summary>
      <button className="tree-new" onClick={() => onView("new-note")}>＋ 新建笔记</button>
      {unorganizedRaws.map(raw => <button key={raw.id} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}>{rawLabel(raw)}</button>)}
    </details>
    <button onClick={() => onView("schema")}>Schema</button>
    <button onClick={() => onView("readme")}>Readme</button>
  </nav>;
}
