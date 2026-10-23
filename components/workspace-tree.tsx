"use client";
import type { Raw } from "../types/raw";
import type { Knowledge } from "../types/knowledge";
import { RAW_FOLDERS, RAW_FOLDER_HINTS, WIKI_FOLDERS, WIKI_FOLDER_HINTS, isWikiCategory, rawCategory } from "../lib/documents/structure";
import { IconBook, IconFolder, IconIndex, IconLog, IconNote, IconPlus } from "./ui/icons";

export function WorkspaceTree({ raws, notes, archivedNotes = [], activeId, rawLabel, onRaw, onNote, onView, onKnowledgeIndex, onRawMenu, onNoteMenu }: {
  raws: Raw[]; notes: Knowledge[]; archivedNotes?: Knowledge[]; rawLabel: (raw: Raw) => string;
  activeId?: string; onKnowledgeIndex: () => void;
  onRaw: (raw: Raw) => void; onNote: (note: Knowledge) => void; onView: (view: "schema" | "readme" | "new-note" | "wiki-index" | "wiki-log") => void;
  onRawMenu: (raw: Raw, x: number, y: number) => void; onNoteMenu: (note: Knowledge, x: number, y: number) => void;
}) {
  const rawFolders = RAW_FOLDERS;
  const wikiFolders = WIKI_FOLDERS;
  const organizedRawIds = new Set([...notes, ...archivedNotes].flatMap(note => note.sourceRawIds));
  const unorganizedRaws = raws.filter(raw => !organizedRawIds.has(raw.id));
  const organizedRaws = raws.filter(raw => organizedRawIds.has(raw.id));
  return <nav className="document-tree" aria-label="笔记目录">
    <details><summary><IconFolder /><span>Raw</span><small>{organizedRaws.length}</small></summary>{rawFolders.map(folder => <details key={folder}><summary title={RAW_FOLDER_HINTS[folder]}><span>{folder}</span><small>{organizedRaws.filter(raw => rawCategory(raw.path) === folder).length}</small></summary>
      {organizedRaws.filter(r => rawCategory(r.path) === folder).map(raw => <button key={raw.id} aria-current={activeId === raw.id ? "page" : undefined} title={rawLabel(raw)} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}><IconNote /><span>{rawLabel(raw)}</span></button>)}
    </details>)}</details>
    <details><summary><IconBook /><span>Wiki</span><small>{notes.length}</small></summary><button className="tree-index" onClick={onKnowledgeIndex}><IconNote /><span>全部知识页</span></button>{wikiFolders.flatMap(folder => {
      const pages = notes.filter(note => (note.path?.split("/")[1] ?? "concept") === folder);
      const folderNode = <details key={folder}><summary title={WIKI_FOLDER_HINTS[folder]}><span>{folder}</span><small>{pages.length}</small></summary>
        {pages.map(note => <button key={note.id} aria-current={activeId === note.id ? "page" : undefined} title={note.title} onClick={() => onNote(note)} onContextMenu={e => { e.preventDefault(); onNoteMenu(note, e.clientX, e.clientY); }}><IconNote /><span>{note.title}</span></button>)}
      </details>;
      if (folder !== "index") return [folderNode];
      return [
        <button key="index" type="button" className="tree-category" title={WIKI_FOLDER_HINTS.index} aria-current={activeId === "wiki-index" ? "page" : undefined} onClick={() => onView("wiki-index")}>
          <IconIndex /><span>index</span>
        </button>,
        <button key="log" type="button" className="tree-category" title="操作日志" aria-current={activeId === "wiki-log" ? "page" : undefined} onClick={() => onView("wiki-log")}>
          <IconLog /><span>log</span>
        </button>,
      ];
    })}{notes.filter(n => n.path && !isWikiCategory(n.path.split("/")[1])).map(note => <button key={note.id} aria-current={activeId === note.id ? "page" : undefined} onClick={() => onNote(note)} title={note.path} onContextMenu={e => { e.preventDefault(); onNoteMenu(note, e.clientX, e.clientY); }}><IconNote /><span>{note.title}</span></button>)}</details>
    <details className="tree-inbox" open><summary><IconFolder /><span>未整理笔记</span><small>{unorganizedRaws.length}</small></summary>
      <button className="tree-new" onClick={() => onView("new-note")}><IconPlus /><span>新建笔记</span></button>
      {unorganizedRaws.map(raw => <button key={raw.id} aria-current={activeId === raw.id ? "page" : undefined} title={rawLabel(raw)} onClick={() => onRaw(raw)} onContextMenu={e => { e.preventDefault(); onRawMenu(raw, e.clientX, e.clientY); }}><IconNote /><span>{rawLabel(raw)}</span></button>)}
    </details>
    <div className="tree-resources"><button aria-current={activeId === "schema" ? "page" : undefined} onClick={() => onView("schema")}><span className="tree-resource-symbol" aria-hidden="true">{`{ }`}</span><span>Schema</span></button>
    <button aria-current={activeId === "readme" ? "page" : undefined} onClick={() => onView("readme")}><IconBook /><span>Readme</span></button></div>
  </nav>;
}
