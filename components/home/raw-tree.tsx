import { getPreview } from "../../lib/text-preview";
import type { Raw } from "../../types/raw";
import { IconPlus, IconSource } from "../ui/icons";

type RawTreeProps = {
  raws: Raw[];
  activeTabId: string;
  rawsExpanded: boolean;
  onToggleRaws: () => void;
  rawLabel: (raw: Raw) => string;
  onOpenRaw: (raw: Raw) => void;
  onRawContextMenu: (raw: Raw, x: number, y: number) => void;
  onNewNote: () => void;
};

/** Home 的二级导航：新建入口与全部原始记录。 */
export function RawTree({
  raws,
  activeTabId,
  rawsExpanded,
  onToggleRaws,
  rawLabel,
  onOpenRaw,
  onRawContextMenu,
  onNewNote,
}: RawTreeProps) {
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

      <div className="tree-section tree-tools-section">
        <button className={`tree-tool-item${activeTabId === "view:new-note" ? " is-active" : ""}`} type="button" data-sound="select" title="新建笔记" onClick={onNewNote}>
          <span className="tree-item-icon"><IconPlus /></span>
          <span className="tree-tool-item-label">新建笔记</span>
        </button>
      </div>
    </>
  );
}
