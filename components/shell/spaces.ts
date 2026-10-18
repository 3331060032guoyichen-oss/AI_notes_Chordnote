/** 一级空间。Home 与 Knowledge 各自保存所属内容的 Tab。 */
export type Space = "home" | "knowledge" | "graph" | "agent" | "settings";

export const SPACE_META: Record<Space, { label: string; shortLabel: string; hint: string }> = {
  home: { label: "Home", shortLabel: "首页", hint: "新建与原始记录" },
  knowledge: { label: "Knowledge", shortLabel: "知识", hint: "沉淀后的知识页" },
  graph: { label: "Graph", shortLabel: "图谱", hint: "知识关系网络" },
  agent: { label: "Agent", shortLabel: "Agent", hint: "本次整理任务与提议" },
  settings: { label: "Settings", shortLabel: "设置", hint: "模型、工具与偏好" },
};
