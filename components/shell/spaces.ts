/** 一级空间。Tab 只属于 Knowledge；其余空间各有自己的导航。 */
export type Space = "home" | "knowledge" | "agent" | "settings";

export const SPACE_META: Record<Space, { label: string; shortLabel: string; hint: string }> = {
  home: { label: "Home", shortLabel: "首页", hint: "最近的活动与入口" },
  knowledge: { label: "Knowledge", shortLabel: "知识", hint: "原始记录、知识页与图谱" },
  agent: { label: "Agent", shortLabel: "Agent", hint: "本次整理任务与提议" },
  settings: { label: "Settings", shortLabel: "设置", hint: "模型、工具与偏好" },
};
