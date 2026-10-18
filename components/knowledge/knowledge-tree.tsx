import { getPreview } from "../../lib/text-preview";
import type { Knowledge } from "../../types/knowledge";
import type { Raw } from "../../types/raw";
import { IconGraph, IconNote, IconPlus, IconSource } from "../ui/icons";

type KnowledgeTreeProps = {
  raws: Raw[];
  knowledges: Knowledge[];
  archivedNotes: Knowledge[];
  activeTabId: string;
  rawsExpanded: boolean;
  notesExpanded: boolean;
  archivedExpanded: boolean;
  onToggleRaws: () => void;
  onToggleNotes: () => void;
  onToggleArchived: () => void;
  rawLabel: (raw: Raw) => string;
  onOpenRaw: (raw: Raw) => void;
  onOpenKnowledge: (knowledge: Knowledge) => void;
  onRestoreNote: (note: Knowledge) => void;
  onRawContextMenu: (raw: Raw, x: number, y: number) => void;
  onNavigate: (view: "new-note" | "graph") => void;
};

/** Knowledge 空间的二级导航：原始记录、知识页、已归档，以及两个工具入口。 */
export function KnowledgeTree({
  raws,
  knowledges,
  archivedNotes,
  activeTabId,
  rawsExpanded,
  notesExpanded,
  archivedExpanded,
  onToggleRaws,
  onToggleNotes,
  onToggleArchived,
  rawLabel,
  onOpenRaw,
  onOpenKnowledge,
  onRestoreNote,
  onRawContextMenu,
  onNavigate,
}: KnowledgeTreeProps) {
  return (
    <>
      <div className="tree-section">
        <button className="tree-section-header" type="button" data-sound="select" onClick={onToggleRaws} aria-expanded={rawsExpanded}>
          <span className={`tree-caret${rawsExpanded ? " is-open" : ""}`} aria-hidden="true">▾</span>
          <span>原始记录</span>
          <span className="tree-count">{raws.length}</span>
        </button>
        {rawsExpanded ? (
          <div className="tree-items">
            {raws.length === 0 ? <p className="tree-empty">还没有原始记录</p> : raws.map((raw) => (
              <button
                className={`tree-item${activeTabId === `raw:${raw.id}` ? " is-selected" : ""}`}
                type="button"
                data-sound="select"
                key={raw.id}
                title={raw.title?.trim() || getPreview(raw.text, 40)}
                onClick={() => onOpenRaw(raw)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onRawContextMenu(raw, event.clientX, event.clientY);
                }}
              >
                <span className="tree-item-icon"><IconSource /></span>
                <span className="tree-item-label">{getPreview(rawLabel(raw), 32)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="tree-section">
        <button className="tree-section-header" type="button" data-sound="select" onClick={onToggleNotes} aria-expanded={notesExpanded}>
          <span className={`tree-caret${notesExpanded ? " is-open" : ""}`} aria-hidden="true">▾</span>
          <span>笔记</span>
          <span className="tree-count">{knowledges.length}</span>
        </button>
        {notesExpanded ? (
          <div className="tree-items">
            {knowledges.length === 0 ? <p className="tree-empty">还没有笔记，先创建一条</p> : knowledges.map((knowledge) => (
              <button
                className={`tree-item${activeTabId === `knowledge:${knowledge.id}` ? " is-selected" : ""}`}
                type="button"
                data-sound="select"
                key={knowledge.id}
                title={knowledge.title}
                onClick={() => onOpenKnowledge(knowledge)}
              >
                <span className="tree-item-icon"><IconNote /></span>
                <span className="tree-item-label">{getPreview(knowledge.title, 32)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {archivedNotes.length > 0 ? (
        <div className="tree-section">
          <button className="tree-section-header" type="button" data-sound="select" onClick={onToggleArchived} aria-expanded={archivedExpanded}>
            <span className={`tree-caret${archivedExpanded ? " is-open" : ""}`} aria-hidden="true">▾</span>
            <span>已归档</span>
            <span className="tree-count">{archivedNotes.length}</span>
          </button>
          {archivedExpanded ? (
            <div className="tree-items">
              {archivedNotes.map((note) => (
                <div className="tree-item tree-item-archived" key={note.id}>
                  <span className="tree-item-icon"><IconNote /></span>
                  <span className="tree-item-label">{getPreview(note.title, 30)}</span>
                  <button className="tree-item-action" type="button" data-sound="press" title="恢复这一页" onClick={() => onRestoreNote(note)}>恢复</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="tree-section tree-tools-section">
        <button className={`tree-tool-item${activeTabId === "view:new-note" ? " is-active" : ""}`} type="button" data-sound="select" title="新建笔记" onClick={() => onNavigate("new-note")}>
          <span className="tree-item-icon"><IconPlus /></span>
          <span className="tree-tool-item-label">新建笔记</span>
        </button>
        <button className={`tree-tool-item${activeTabId === "view:graph" ? " is-active" : ""}`} type="button" data-sound="select" title="知识网络" onClick={() => onNavigate("graph")}>
          <span className="tree-item-icon"><IconGraph /></span>
          <span className="tree-tool-item-label">知识网络</span>
        </button>
      </div>
    </>
  );
}
