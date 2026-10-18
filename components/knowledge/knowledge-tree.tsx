import type { Knowledge } from "../../types/knowledge";
import { getPreview } from "../../lib/text-preview";
import { IconNote } from "../ui/icons";

type KnowledgeTreeProps = {
  knowledges: Knowledge[];
  activeTabId: string;
  notesExpanded: boolean;
  onToggleNotes: () => void;
  onOpenKnowledge: (knowledge: Knowledge) => void;
};

/** Knowledge 空间的二级导航：只展示已经确认收录的知识页。 */
export function KnowledgeTree({
  knowledges,
  activeTabId,
  notesExpanded,
  onToggleNotes,
  onOpenKnowledge,
}: KnowledgeTreeProps) {
  return (
    <>
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

    </>
  );
}
