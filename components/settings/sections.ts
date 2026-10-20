/** Settings 的分类入口。能力状态：real = 真实可用，readonly = 只读，planned = 未实现。 */
export type SettingsSection = "models" | "tools" | "schedules" | "voice" | "themes" | "data" | "archive";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  hint: string;
  group: "AI 与 Agent" | "界面偏好" | "数据与连接";
  state: "real" | "readonly" | "planned";
}> = [
  { id: "models", label: "模型与服务", hint: "提供者、模型与服务地址", group: "AI 与 Agent", state: "real" },
  { id: "tools", label: "工具权限", hint: "Agent 可使用的能力", group: "AI 与 Agent", state: "readonly" },
  { id: "schedules", label: "自动化", hint: "计划任务与后台运行", group: "AI 与 Agent", state: "planned" },
  { id: "themes", label: "外观主题", hint: "阅读与工作区风格", group: "界面偏好", state: "real" },
  { id: "voice", label: "界面声音", hint: "操作音效与公式渲染", group: "界面偏好", state: "real" },
  { id: "data", label: "Data", hint: "导入、导出与本地存储", group: "数据与连接", state: "real" },
  { id: "archive", label: "归档", hint: "已收起的知识页", group: "数据与连接", state: "real" },
];
