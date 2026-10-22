"use client";

import type { Knowledge } from "../../types/knowledge";
import { IconClose } from "../ui/icons";
import { useDialog } from "../ui/use-dialog";
import type { SettingsSection } from "./sections";
import { SettingsNav } from "./settings-nav";
import { SettingsSpace } from "./settings-space";

type SettingsDialogProps = {
  open: boolean;
  section: SettingsSection;
  archivedNotes: Knowledge[];
  onSelect: (section: SettingsSection) => void;
  onRestoreNote: (note: Knowledge) => void;
  onClose: () => void;
};

/**
 * 桌面设置窗口。工作区保持原位，关闭后回到用户刚才正在阅读或编辑的位置。
 */
export function SettingsDialog({ open, section, archivedNotes, onSelect, onRestoreNote, onClose }: SettingsDialogProps) {
  const { dialogRef, dismiss, closing } = useDialog(open, onClose);

  if (!open) return null;

  return (
    <div className="settings-window-backdrop" data-closing={closing || undefined} onMouseDown={dismiss}>
      <div
        id="settings-window"
        ref={dialogRef}
        className="settings-window"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-window-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="settings-window-head">
          <div>
            <h2 id="settings-window-title">设置</h2>
          </div>
          <div className="settings-window-dismiss"><kbd>Esc</kbd><button className="settings-close" type="button" data-autofocus data-sound="select" aria-label="关闭设置" onClick={dismiss}><IconClose /></button></div>
        </header>

        <div className="settings-window-layout">
          <nav className="settings-window-nav" aria-label="设置分类">
            <SettingsNav section={section} onSelect={onSelect} />
          </nav>
          <div className="settings-window-content">
            <SettingsSpace section={section} archivedNotes={archivedNotes} onRestoreNote={onRestoreNote} />
          </div>
        </div>
      </div>
    </div>
  );
}
