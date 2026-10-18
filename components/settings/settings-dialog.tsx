"use client";

import { useEffect, useRef } from "react";

import type { Knowledge } from "../../types/knowledge";
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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="settings-window-backdrop" onMouseDown={onClose}>
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
            <p>CHORDNOTE</p>
            <h2 id="settings-window-title">设置</h2>
          </div>
          <button className="settings-close" type="button" data-sound="select" aria-label="关闭设置" onClick={onClose}>×</button>
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
