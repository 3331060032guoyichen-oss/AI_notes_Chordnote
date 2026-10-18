/** Settings 的六个入口。能力状态：real = 真实可用，readonly = 只读，planned = 未实现。 */
export type SettingsSection = "models" | "tools" | "schedules" | "voice" | "themes" | "settings";

export const SETTINGS_SECTIONS: Array<{
  id: SettingsSection;
  label: string;
  hint: string;
  state: "real" | "readonly" | "planned";
}> = [
  { id: "models", label: "Models", hint: "模型提供者与地址", state: "real" },
  { id: "tools", label: "Tools", hint: "Agent 的授权清单", state: "readonly" },
  { id: "schedules", label: "Schedules", hint: "定时任务", state: "planned" },
  { id: "voice", label: "Voice", hint: "界面声音", state: "real" },
  { id: "themes", label: "Themes", hint: "三套阅读主题", state: "real" },
  { id: "settings", label: "Settings", hint: "API、数据与系统", state: "real" },
];
