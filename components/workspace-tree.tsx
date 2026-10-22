"use client";
import type { Raw } from "../types/raw";
import type { Knowledge } from "../types/knowledge";
import { RAW_FOLDERS, WIKI_FOLDERS, isWikiCategory, rawCategory } from "../lib/documents/structure";
import { IconBook, IconFolder, IconNote, IconPlus } from "./ui/icons";

export function WorkspaceTree({ raws, notes, archivedNotes = [], activeId, rawLabel, onRaw, onNote, onView, onKnowledgeIndex, onRawMenu, onNoteMenu }: {
  raws: Raw[]; notes: Knowledge[]; archivedNotes?: Knowledge[]; rawLabel: (raw: Raw) => string;
  activeId?: string; onKnowledgeIndex: () => void;
  onRaw: (raw: Raw) => void; onNote: (note: Knowledge) => void; onView: (view: "schema" | "readme" | "new-note") => void;
  onRawMenu: (raw: Raw, x: number, y: number) => void; onNoteMenu: (note: Knowledge, x: number, y: number) => void;
}) {
  const rawFolders = RAW_FOLDERS;
  const wikiFolders = WIKI_FOLDERS;
  const organizedRawIds = new Set([...notes, ...archivedNotes].flatMap(note => note.sourceRawIds));
  const unorganizedRaws = raws.filter(raw => !organizedRawIds.has(raw.id));
  const organizedRaws = raws.filter(raw => organizedRawIds.has(raw.id));
  return <nav className="document-tree" aria-label="笔记目录">
    <details><summary><IconFolder /><span>Raw</span><small>{organizedRaws.length}</small></summary>{rawFolders.map(folder => <details key={folder}><summary><span>{folder}</span><small>{organizedRaws.filter(raw => rawCategory(raw.path) === folder).length}</small></summary>
      {organizedRaws.filter(r => rawCategory(r.path) === folder).map(raw => <button key={raw.id} aria-current={activeId === raw.id ? "page" : undefined} title={rawLabel(raw)} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}><IconNote /><span>{rawLabel(raw)}</span></button>)}
    </details>)}</details>
    <details><summary><IconBook /><span>Wiki</span><small>{notes.length}</small></summary><button className="tree-index" onClick={onKnowledgeIndex}><IconNote /><span>全部知识页</span></button>{wikiFolders.map(folder => <details key={folder}><summary><span>{folder}</span><small>{notes.filter(note => (note.path?.split("/")[1] ?? "concept") === folder).length}</small></summary>
      {notes.filter(n => (n.path?.split("/")[1] ?? "concept") === folder).map(note => <button key={note.id} aria-current={activeId === note.id ? "page" : undefined} title={note.title} onClick={() => onNote(note)} onContextMenu={e => { e.preventDefault(); onNoteMenu(note, e.clientX, e.clientY); }}><IconNote /><span>{note.title}</span></button>)}
    </details>)}{notes.filter(n => n.path && !isWikiCategory(n.path.split("/")[1])).map(note => <button key={note.id} aria-current={activeId === note.id ? "page" : undefined} onClick={() => onNote(note)} title={note.path} onContextMenu={e => { e.preventDefault(); onNoteMenu(note, e.clientX, e.clientY); }}><IconNote /><span>{note.title}</span></button>)}</details>
    <details className="tree-inbox" open><summary><IconFolder /><span>未整理笔记</span><small>{unorganizedRaws.length}</small></summary>
      <button className="tree-new" onClick={() => onView("new-note")}><IconPlus /><span>新建笔记</span></button>
      {unorganizedRaws.map(raw => <button key={raw.id} aria-current={activeId === raw.id ? "page" : undefined} title={rawLabel(raw)} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}><IconNote /><span>{rawLabel(raw)}</span></button>)}
    </details>
    <div className="tree-resources"><button aria-current={activeId === "schema" ? "page" : undefined} onClick={() => onView("schema")}><span className="tree-resource-symbol" aria-hidden="true">{`{ }`}</span><span>Schema</span></button>
    <button aria-current={activeId === "readme" ? "page" : undefined} onClick={() => onView("readme")}><IconBook /><span>Readme</span></button></div>
  </nav>;
}
