/** 全站共用的内联图标。项目不使用图标库；尺寸与描边分「列表」和「功能栏」两档。 */

const TREE_ICON_PROPS = {
  width: 15,
  height: 15,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const RAIL_ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function AppLogo() {
  return <div className="app-logo" aria-label="Chordnote"><span className="logo-mark" aria-hidden="true">C</span><span>Chordnote</span></div>;
}

export function IconSource() {
  return <svg {...TREE_ICON_PROPS}><path d="M4 6h16M4 12h16M4 18h10" /></svg>;
}

export function IconNote() {
  return <svg {...TREE_ICON_PROPS}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8 9h8M8 13h5" /></svg>;
}

export function IconPlus() {
  return <svg {...TREE_ICON_PROPS}><path d="M12 5v14M5 12h14" /></svg>;
}

export function IconGraph() {
  return <svg {...TREE_ICON_PROPS}><circle cx="6" cy="17.5" r="2.5" /><circle cx="12" cy="6" r="2.5" /><circle cx="18" cy="15" r="2.5" /><path d="M8 15.6 10.6 8.5M14.3 7.6 16.4 12.9M8.4 16.9l7.2-1.5" /></svg>;
}

export function IconAgent() {
  return <svg {...TREE_ICON_PROPS}><path d="M12 3v3" /><rect x="5" y="6" width="14" height="12" rx="3" /><path d="M9.5 12.5h.01M14.5 12.5h.01M9.5 15.5h5" /></svg>;
}

export function IconPen() {
  return <svg {...RAIL_ICON_PROPS}><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z" /><path d="M14.5 5.5 18.5 9.5" /></svg>;
}

export function IconGraphRail() {
  return <svg {...RAIL_ICON_PROPS}><circle cx="12" cy="5.5" r="2.2" /><circle cx="5.5" cy="18" r="2.2" /><circle cx="18.5" cy="18" r="2.2" /><path d="M10.6 7.3 7 15.9M13.4 7.3 17 15.9M7.7 18h8.6" /></svg>;
}

export function IconHarp() {
  return <svg {...RAIL_ICON_PROPS}><path d="M8 6.5v11" /><path d="M12 4v16" /><path d="M16 8.5v9" /><circle cx="12" cy="11" r="1.15" /></svg>;
}

export function IconPanelCollapse() {
  return <svg {...RAIL_ICON_PROPS}><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M9.5 4.5v15" /><path d="M16 9.5 13.5 12l2.5 2.5" /></svg>;
}

export function IconPanelExpand() {
  return <svg {...RAIL_ICON_PROPS}><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M9.5 4.5v15" /><path d="M13.5 9.5 16 12l-2.5 2.5" /></svg>;
}

export function IconInlink() {
  return <svg {...RAIL_ICON_PROPS}><path d="M18.5 5.5 6.5 17.5" /><path d="M6.5 10.5v7h7" /></svg>;
}

export function IconOutlink() {
  return <svg {...RAIL_ICON_PROPS}><path d="M5.5 18.5 17.5 6.5" /><path d="M17.5 13.5v-7h-7" /></svg>;
}

export function IconMention() {
  return <svg {...RAIL_ICON_PROPS}><path d="M10.6 13.4a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M13.4 10.6a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></svg>;
}

export function IconHome() {
  return <svg {...RAIL_ICON_PROPS}><path d="M4 11 12 4l8 7" /><path d="M6.5 9.5V20h11V9.5" /><path d="M10 20v-5h4v5" /></svg>;
}

export function IconBook() {
  return <svg {...RAIL_ICON_PROPS}><path d="M5 4.5h9a3 3 0 0 1 3 3V21H8a3 3 0 0 1-3-3z" /><path d="M17 7.5h2v13h-2" /><path d="M9 8.5h4M9 12h4" /></svg>;
}

export function IconSettings() {
  return <svg {...RAIL_ICON_PROPS}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}
