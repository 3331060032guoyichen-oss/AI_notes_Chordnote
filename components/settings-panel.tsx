"use client";

import { useEffect, useState } from "react";

import { useInterfaceSound } from "./interface-sound";

/**
 * 设置抽屉 —— 右栏滑出，三页签：主题 / 模型 / API。
 *
 * 后端最后再整：模型与 API 两栏目前只做界面与本地持久化（localStorage），
 * 不接真实请求；「测试连接」是占位，等后端定了再填。
 *
 * 主题通过 <html data-studio="…"> 切换，令牌定义在 app/globals.css 顶部。
 */

export type Studio = "darkroom" | "editorial" | "tactile";

const STUDIO_KEY = "chordnote:studio";
const MODEL_KEY = "chordnote:model";
const BASE_URL_KEY = "chordnote:base-url";
const API_KEY_KEY = "chordnote:api-key";

type SettingsTab = "theme" | "model" | "api" | "data";

const STUDIOS: { id: Studio; name: string; en: string; desc: string; swatches: string[] }[] = [
  {
    id: "darkroom",
    name: "暗室星图",
    en: "夜间专注模式",
    desc: "深色低眩光护眼界面，星图节点与重点脉络清晰醒目，适合夜间沉浸式推导公式、复盘错题与俯瞰全局知识网络。",
    swatches: ["#030712", "#7c3aed", "#e8edf7"],
  },
  {
    id: "editorial",
    name: "暖纸批注",
    en: "书页深读模式",
    desc: "温润亚麻纸底搭配人文衬线排版，还原在书页空白处做批注、查索引的纸本阅读感，适合长时间阅读与撰写长文笔记。",
    swatches: ["#f7f4ed", "#c8321e", "#161513"],
  },
  {
    id: "tactile",
    name: "实验工坊",
    en: "高效整理模式",
    desc: "利落的工程网格与高对比度信号提示，步骤分明、反馈干脆，适合考前集中整理错题、密集梳理概念结构。",
    swatches: ["#141619", "#ff5722", "#f3f4f6"],
  },
];

const PRESET_MODELS = [
  { id: "deepseek-chat", name: "DeepSeek Chat", desc: "通用对话，速度快" },
  { id: "deepseek-reasoner", name: "DeepSeek Reasoner", desc: "推理优先，适合复杂问题" },
];

const DEFAULT_BASE_URL = "https://api.deepseek.com";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* 隐私模式等场景下 localStorage 不可用，静默降级 */
  }
}

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<SettingsTab>("theme");
  /** 界面声音的开关与状态都在 InterfaceSoundProvider 里（layout.tsx 顶层），
      所以这里读到的和全局是同一份 —— 不存在"设置里关了、顶栏还亮着"。 */
  const { enabled: soundEnabled, preference: soundPreference, toggle: toggleSound } = useInterfaceSound();
  /** 数据页码：导出/导入的结果提示。 */
  const [bundleNote, setBundleNote] = useState("");

  const [studio, setStudio] = useState<Studio>("darkroom");
  const [model, setModel] = useState("deepseek-chat");
  const [customModel, setCustomModel] = useState("");
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [apiKey, setApiKey] = useState("");
  const [testNote, setTestNote] = useState("");

  // 首次挂载：从 localStorage 恢复，并把主题应用到 <html>
  useEffect(() => {
    const savedStudio = readStorage(STUDIO_KEY) as Studio | null;
    if (savedStudio && ["darkroom", "editorial", "tactile"].includes(savedStudio)) {
      setStudio(savedStudio);
    }
    setModel(readStorage(MODEL_KEY) ?? "deepseek-chat");
    setBaseUrl(readStorage(BASE_URL_KEY) ?? DEFAULT_BASE_URL);
    setApiKey(readStorage(API_KEY_KEY) ?? "");
  }, []);

  // 主题变化：写 <html data-studio> + 持久化
  useEffect(() => {
    document.documentElement.setAttribute("data-studio", studio);
    writeStorage(STUDIO_KEY, studio);
  }, [studio]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const activeModelId = model === "custom" ? "custom" : model;

  return (
    <>
      <div className="settings-backdrop" aria-hidden="true" onClick={onClose} />
      <aside className="settings-drawer" role="dialog" aria-modal="true" aria-label="设置">
        <div className="settings-head">
          <div>
            <h2>设置</h2>
            <p>主题、模型与接口都在这里。</p>
          </div>
          <button type="button" className="settings-close" aria-label="关闭设置" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "theme"} className={`settings-tab${tab === "theme" ? " is-active" : ""}`} onClick={() => setTab("theme")}>
            主题
          </button>
          <button type="button" role="tab" aria-selected={tab === "model"} className={`settings-tab${tab === "model" ? " is-active" : ""}`} onClick={() => setTab("model")}>
            模型
          </button>
          <button type="button" role="tab" aria-selected={tab === "api"} className={`settings-tab${tab === "api" ? " is-active" : ""}`} onClick={() => setTab("api")}>
            API
          </button>
          <button type="button" role="tab" aria-selected={tab === "data"} className={`settings-tab${tab === "data" ? " is-active" : ""}`} onClick={() => setTab("data")}>
            数据
          </button>
        </div>

        <div className="settings-body">
          {tab === "theme" ? (
            <>
            <div className="settings-section">
              <div className="settings-section-title">外观主题</div>
              <p className="settings-hint">三套阅读主题，按你当下的学习场景挑一套，切换立即生效并记住你的选择。</p>
              <div className="theme-grid">
                {STUDIOS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`theme-card${studio === s.id ? " is-active" : ""}`}
                    onClick={() => setStudio(s.id)}
                  >
                    <span className="theme-swatches" aria-hidden="true">
                      {s.swatches.map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                    <span className="theme-name">{s.name}</span>
                    <span className="theme-en">{s.en}</span>
                    <span className="theme-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 「声音」原来在顶栏与侧栏底部各挂一颗开关（一个为宽屏、一个为抽屉），
                两处都在"用着用着"的位置上占地方。它是偏好，不是常用动作 —— 收到这里。 */}
            <div className="settings-section">
              <div className="settings-section-title">界面声音</div>
              <div className="toggle-row">
                <span>操作音效</span>
                <button
                  type="button"
                  className={`sw${soundEnabled ? " on" : ""}`}
                  role="switch"
                  aria-checked={soundEnabled}
                  aria-label="界面声音"
                  disabled={soundPreference === "unsupported"}
                  onClick={toggleSound}
                >
                  <i />
                </button>
              </div>
              <p className="settings-note">
                {soundPreference === "unsupported"
                  ? "这台设备的浏览器不支持 Web Audio，声音不可用。"
                  : "点击、保存、归档这些动作会有一声很轻的音效 —— 现场合成，不加载任何音频文件。"}
              </p>
            </div>
            </>
          ) : null}

          {tab === "model" ? (
            <div className="settings-section">
              <div className="settings-section-title">模型选择</div>
              <p className="settings-hint">决定「AI 整理」与「编辑助理」用哪个模型回答。</p>

              <div className="model-list">
                {PRESET_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`model-option${model === m.id ? " is-active" : ""}`}
                    onClick={() => setModel(m.id)}
                  >
                    <span className="model-radio" aria-hidden="true" />
                    <span className="model-name">{m.name}</span>
                    <span className="model-desc">{m.desc}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`model-option${model === "custom" ? " is-active" : ""}`}
                  onClick={() => setModel("custom")}
                >
                  <span className="model-radio" aria-hidden="true" />
                  <span className="model-name">自定义模型</span>
                  <span className="model-desc">手动输入模型名</span>
                </button>
              </div>

              {activeModelId === "custom" ? (
                <label className="field">
                  <span className="field-label">自定义模型名</span>
                  <input
                    className="text-input"
                    type="text"
                    value={customModel}
                    placeholder="如 deepseek-v3"
                    onChange={(event) => setCustomModel(event.target.value)}
                    onBlur={() => writeStorage(MODEL_KEY, customModel.trim() || "custom")}
                  />
                </label>
              ) : (
                <p className="settings-note">
                  当前模型：<code>{model}</code>。切换即时保存。
                </p>
              )}
            </div>
          ) : null}

          {tab === "data" ? (
            <div className="settings-section">
              <div className="settings-section-title">知识包</div>
              <p className="settings-hint">
                导出会把原始记录、知识页、关联与修订历史打成一个 JSON 文件。它不依赖本应用就能读懂，
                换台机器、换个部署都可以再导入回来 —— 这是「数据是你的」这条承诺的兑现方式。
              </p>

              <button
                type="button"
                className="button-secondary settings-test-btn"
                onClick={() => {
                  window.location.href = "/api/export";
                }}
              >
                导出知识包（.json）
              </button>

              <button
                type="button"
                className="button-secondary settings-test-btn"
                onClick={() => {
                  window.location.href = "/api/export?format=markdown";
                }}
              >
                导出 markdown 知识包（.zip）
              </button>

              <p className="settings-note">
                两种导出的分工：JSON 是「导回来用」的完整快照（含修订历史）；
                markdown 包是「拿出去读或迁移」的可读形态，任何 markdown 工具都能打开。
              </p>

              <label className="field">
                <span className="field-label">导入知识包</span>
                <input
                  className="text-input"
                  type="file"
                  accept="application/json,.json"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    setBundleNote("正在导入…");

                    try {
                      const payload = JSON.parse(await file.text());
                      const response = await fetch("/api/import", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      const body = (await response.json()) as {
                        result?: {
                          sources: { created: number; skipped: number };
                          notes: { created: number; skipped: number };
                          links: { created: number; skipped: number };
                          problems: string[];
                        };
                        error?: { message?: string };
                      };

                      if (!response.ok || !body.result) throw new Error(body.error?.message ?? "导入没有完成。");

                      const result = body.result;
                      const skipped = result.sources.skipped + result.notes.skipped + result.links.skipped;
                      setBundleNote(
                        `导入完成：原始记录 +${result.sources.created}、知识页 +${result.notes.created}、关联 +${result.links.created}；` +
                          `跳过同名 ${skipped} 条` +
                          (result.problems.length > 0 ? `；提示：${result.problems[0]}` : "。") +
                          " 同名内容一律保留已有、不覆盖。",
                      );
                    } catch (error) {
                      setBundleNote(error instanceof Error ? error.message : "导入没有完成，请确认文件来自 Chordnote。");
                    } finally {
                      event.target.value = "";
                    }
                  }}
                />
                <span className="settings-note">同名原始记录与知识页会保留已有、跳过导入，不会覆盖你现在的内容。</span>
              </label>

              {bundleNote ? <p className="settings-note" role="status">{bundleNote}</p> : null}
            </div>
          ) : null}

          {tab === "api" ? (
            <div className="settings-section">
              <div className="settings-section-title">API 调用</div>
              <p className="settings-hint">后端尚未接入，以下配置仅保存在本机浏览器，暂不发起真实请求。</p>

              <label className="field">
                <span className="field-label">API Key</span>
                <input
                  className="text-input"
                  type="password"
                  value={apiKey}
                  placeholder="sk-…"
                  autoComplete="off"
                  onChange={(event) => setApiKey(event.target.value)}
                  onBlur={() => writeStorage(API_KEY_KEY, apiKey)}
                />
                <span className="settings-note">仅存本机；后端接入后改由服务端保管。</span>
              </label>

              <label className="field">
                <span className="field-label">Base URL</span>
                <input
                  className="text-input"
                  type="text"
                  value={baseUrl}
                  spellCheck={false}
                  onChange={(event) => setBaseUrl(event.target.value)}
                  onBlur={() => writeStorage(BASE_URL_KEY, baseUrl.trim() || DEFAULT_BASE_URL)}
                />
              </label>

              <button
                type="button"
                className="button-secondary settings-test-btn"
                onClick={() => setTestNote("后端尚未接入，测试连接将在后端完成后启用。")}
              >
                测试连接
              </button>
              {testNote ? <p className="settings-note" role="status">{testNote}</p> : null}
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
