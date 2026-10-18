"use client";

import { useEffect, useState } from "react";

import { AGENT_MANUAL, MANUAL_VERSION } from "../../lib/agent/manual";
import { useInterfaceSound } from "../interface-sound";
import type { SettingsSection } from "./sections";

/**
 * Settings 空间。外层不再是抽屉：主工作区直接渲染当前入口的内容。
 * 六个入口的能力状态见 `sections.ts`；未实现的能力只显示空态，不伪造记录。
 */

export type Studio = "darkroom" | "editorial" | "tactile";

const STUDIO_KEY = "chordnote:studio";

type ProviderId = "deepseek" | "ollama" | "custom";

type PublicSettings = {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  apiKeyConfigured: boolean;
  locked: string[];
};

type ProviderDefaults = Pick<PublicSettings, "provider" | "model" | "baseUrl" | "timeoutMs">;

type TestCheck = { id: string; label: string; status: "ok" | "failed" | "skipped"; detail: string };

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

const PROVIDERS: { id: ProviderId; name: string; desc: string }[] = [
  { id: "deepseek", name: "DeepSeek", desc: "外部 API，需要密钥" },
  { id: "ollama", name: "Ollama 本地模型", desc: "本机服务，默认 qwen3:4b" },
  { id: "custom", name: "自定义兼容接口", desc: "自己填地址与模型名" },
];

const ACCESS_LABEL: Record<string, string> = {
  auto: "自动执行",
  proposal: "先提议 · 用户确认",
  blocked: "未授权 · 不交给模型",
};

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

function SectionHeader({ title, body }: { title: string; body: string }) {
  return (
    <header className="workspace-heading compact-heading">
      <div>
        <p className="eyebrow">Settings</p>
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </header>
  );
}

export function SettingsSpace({ section }: { section: SettingsSection }) {
  const { enabled: soundEnabled, preference: soundPreference, toggle: toggleSound } = useInterfaceSound();
  const [bundleNote, setBundleNote] = useState("");
  const [studio, setStudio] = useState<Studio>("darkroom");
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [defaults, setDefaults] = useState<Record<ProviderId, ProviderDefaults> | null>(null);
  const [modelDraft, setModelDraft] = useState("");
  const [baseUrlDraft, setBaseUrlDraft] = useState("");
  const [timeoutDraft, setTimeoutDraft] = useState(30000);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [testChecks, setTestChecks] = useState<TestCheck[]>([]);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const savedStudio = readStorage(STUDIO_KEY) as Studio | null;
    if (savedStudio && ["darkroom", "editorial", "tactile"].includes(savedStudio)) {
      setStudio(savedStudio);
    }
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-studio", studio);
    writeStorage(STUDIO_KEY, studio);
  }, [studio]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/settings/model");
        const body = (await response.json()) as {
          settings?: PublicSettings;
          defaults?: ProviderDefaults[];
          error?: { message?: string };
        };

        if (!response.ok || !body.settings) {
          throw new Error(body.error?.message ?? "模型配置读不出来。");
        }

        if (cancelled) return;

        setSettings(body.settings);
        setModelDraft(body.settings.model);
        setBaseUrlDraft(body.settings.baseUrl);
        setTimeoutDraft(body.settings.timeoutMs);
        setDefaults(
          (body.defaults ?? []).reduce(
            (acc, item) => ({ ...acc, [item.provider]: item }),
            {} as Record<ProviderId, ProviderDefaults>,
          ),
        );
      } catch (error) {
        if (!cancelled) setSaveNote(error instanceof Error ? error.message : "模型配置读不出来。");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const locked = settings?.locked ?? [];
  const lockedNote = "由环境变量设置，界面不能修改。";

  async function patchSettings(patch: Record<string, unknown>) {
    setSaveNote("");

    const response = await fetch("/api/settings/model", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const body = (await response.json()) as {
      settings?: PublicSettings;
      warnings?: string[];
      error?: { message?: string };
    };

    if (!response.ok || !body.settings) {
      throw new Error(body.error?.message ?? "设置没有保存。");
    }

    setSettings(body.settings);
    setModelDraft(body.settings.model);
    setBaseUrlDraft(body.settings.baseUrl);
    setTimeoutDraft(body.settings.timeoutMs);
    setSaveNote(body.warnings?.join(" ") ?? "已保存。");
    return body.settings;
  }

  const selectProvider = (provider: ProviderId) => {
    if (locked.includes("provider")) return;

    const preset = defaults?.[provider];
    setSettings((current) => (current ? { ...current, provider } : current));

    if (preset) {
      setModelDraft(preset.model);
      setBaseUrlDraft(preset.baseUrl);
      setTimeoutDraft(preset.timeoutMs);
    }
  };

  return (
    <div className="settings-space">
      {section === "models" ? (
        <>
          <SectionHeader title="模型提供者" body="决定 AI 整理、编辑助理与 Agent 用哪个模型。配置由服务端保存，浏览器只看到脱敏状态。" />
          <section className="content-section settings-panel-body">
            <div className="model-list">
              {PROVIDERS.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={`model-option${settings?.provider === provider.id ? " is-active" : ""}`}
                  disabled={locked.includes("provider")}
                  onClick={() => selectProvider(provider.id)}
                >
                  <span className="model-radio" aria-hidden="true" />
                  <span className="model-name">{provider.name}</span>
                  <span className="model-desc">{provider.desc}</span>
                </button>
              ))}
            </div>

            <label className="field">
              <span className="field-label">模型名</span>
              <input className="text-input" type="text" value={modelDraft} disabled={locked.includes("model")} placeholder="如 qwen3:4b" onChange={(event) => setModelDraft(event.target.value)} />
              {locked.includes("model") ? <span className="settings-note">{lockedNote}</span> : null}
            </label>

            <label className="field">
              <span className="field-label">服务地址</span>
              <input className="text-input" type="text" value={baseUrlDraft} disabled={locked.includes("baseUrl")} spellCheck={false} placeholder="https://api.deepseek.com 或 http://localhost:11434/v1" onChange={(event) => setBaseUrlDraft(event.target.value)} />
              {locked.includes("baseUrl") ? <span className="settings-note">{lockedNote}</span> : null}
            </label>

            <label className="field">
              <span className="field-label">超时（毫秒）</span>
              <input className="text-input" type="number" min={1000} max={600000} value={timeoutDraft} disabled={locked.includes("timeoutMs")} onChange={(event) => setTimeoutDraft(Number(event.target.value))} />
            </label>

            <button
              type="button"
              className="button-secondary settings-test-btn"
              onClick={async () => {
                try {
                  const patch: Record<string, unknown> = {};
                  if (!locked.includes("provider") && settings?.provider) patch.provider = settings.provider;
                  if (!locked.includes("model")) patch.model = modelDraft;
                  if (!locked.includes("baseUrl")) patch.baseUrl = baseUrlDraft;
                  if (!locked.includes("timeoutMs")) patch.timeoutMs = timeoutDraft;
                  await patchSettings(patch);
                } catch (error) {
                  setSaveNote(error instanceof Error ? error.message : "设置没有保存。");
                }
              }}
            >
              保存模型设置
            </button>

            <p className="settings-note">
              这里只保存连接配置，不管理本地模型的生命周期：Ollama 的启动、拉取与卸载仍在应用之外完成。
            </p>
            {saveNote ? <p className="settings-note" role="status">{saveNote}</p> : null}
          </section>
        </>
      ) : null}

      {section === "tools" ? (
        <>
          <SectionHeader title="Agent 工具授权" body={`来自工作手册 ${MANUAL_VERSION}。这里只展示真实存在的工具与权限，不能在这里修改。`} />
          <section className="content-section settings-panel-body">
            <div className="tool-list">
              <b>工具清单</b>
              {AGENT_MANUAL.map((tool) => (
                <div className="tool-row" key={tool.name}>
                  <span>
                    {tool.label}
                    <small className="settings-note"> {tool.name}</small>
                  </span>
                  <em className={tool.access === "blocked" ? "no" : tool.access === "proposal" ? "mid" : "ok"}>
                    {ACCESS_LABEL[tool.access] ?? tool.access}
                  </em>
                </div>
              ))}
            </div>
            <p className="settings-note">
              标记为「未授权」的工具不会出现在模型的 tools 列表里——这不是提示词约束，而是宿主根本不提供。
            </p>
            <p className="settings-note">编辑、启用或禁用工具需要改工作手册与授权表；本轮不提供界面开关。</p>
          </section>
        </>
      ) : null}

      {section === "schedules" ? (
        <>
          <SectionHeader title="定时任务" body="尚未实现。本轮不接入调度器，也不会生成任何假的运行记录。" />
          <section className="content-section settings-panel-body">
            <div className="settings-empty">
              <b>没有可用的定时任务</b>
              <p>规划中的能力包括：定期体检知识库、按计划重跑整理。它们依赖后台调度与任务落库，当前架构还没有这两样。</p>
            </div>
          </section>
        </>
      ) : null}

      {section === "voice" ? (
        <>
          <SectionHeader title="界面声音" body="操作音效是偏好，不是常用动作；开关只影响本机这次会话与之后的启动。" />
          <section className="content-section settings-panel-body">
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
            <p className="settings-note">语音输入与朗读尚未实现；这里只有界面音效。</p>
          </section>
        </>
      ) : null}

      {section === "themes" ? (
        <>
          <SectionHeader title="阅读主题" body="三套主题按学习场景切换，立即生效并记住选择。" />
          <section className="content-section settings-panel-body">
            <div className="theme-grid">
              {STUDIOS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`theme-card${studio === item.id ? " is-active" : ""}`}
                  onClick={() => setStudio(item.id)}
                >
                  <span className="theme-swatches" aria-hidden="true">
                    {item.swatches.map((color) => <i key={color} style={{ background: color }} />)}
                  </span>
                  <span className="theme-name">{item.name}</span>
                  <span className="theme-en">{item.en}</span>
                  <span className="theme-desc">{item.desc}</span>
                </button>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {section === "settings" ? (
        <>
          <SectionHeader title="API、数据与系统" body="密钥、知识包与本地存储说明。密钥只保存在服务端，不会回到浏览器。" />
          <section className="content-section settings-panel-body">
            <div className="settings-section">
              <div className="settings-section-title">API Key</div>
              <label className="field">
                <span className="field-label">密钥</span>
                <input
                  className="text-input"
                  type="password"
                  value={apiKeyDraft}
                  disabled={locked.includes("apiKey")}
                  placeholder={settings?.apiKeyConfigured ? "已配置 · 留空保持不变" : "sk-… 或留空（Ollama 通常不需要）"}
                  autoComplete="off"
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                />
                <span className="settings-note">
                  {locked.includes("apiKey")
                    ? lockedNote
                    : settings?.apiKeyConfigured
                      ? "当前已保存密钥。留空保存不会改动它。"
                      : "当前没有保存密钥。"}
                </span>
              </label>

              <div className="review-actions">
                <button
                  type="button"
                  className="button-secondary settings-test-btn"
                  disabled={locked.includes("apiKey")}
                  onClick={async () => {
                    if (!apiKeyDraft.trim()) {
                      setSaveNote("输入新的 API Key 后再保存；留空不会改动现有密钥。");
                      return;
                    }
                    try {
                      await patchSettings({ apiKey: apiKeyDraft });
                      setApiKeyDraft("");
                    } catch (error) {
                      setSaveNote(error instanceof Error ? error.message : "密钥没有保存。");
                    }
                  }}
                >
                  保存 API Key
                </button>
                <button
                  type="button"
                  className="button-secondary settings-test-btn"
                  disabled={locked.includes("apiKey")}
                  onClick={async () => {
                    try {
                      await patchSettings({ apiKey: null });
                      setApiKeyDraft("");
                      setSaveNote("已清除服务端保存的 API Key。");
                    } catch (error) {
                      setSaveNote(error instanceof Error ? error.message : "密钥没有清除。");
                    }
                  }}
                >
                  清除 API Key
                </button>
                <button
                  type="button"
                  className="button-secondary settings-test-btn"
                  disabled={testing}
                  onClick={async () => {
                    setTesting(true);
                    setTestChecks([]);
                    try {
                      const response = await fetch("/api/settings/model/test", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: "{}",
                      });
                      const body = (await response.json()) as {
                        ok?: boolean;
                        checks?: TestCheck[];
                        error?: { message?: string };
                      };
                      if (!response.ok) throw new Error(body.error?.message ?? "连接测试没有完成。");
                      setTestChecks(body.checks ?? []);
                    } catch (error) {
                      setSaveNote(error instanceof Error ? error.message : "连接测试没有完成。");
                    } finally {
                      setTesting(false);
                    }
                  }}
                >
                  {testing ? "正在测试连接…" : "测试连接"}
                </button>
              </div>

              {testChecks.length > 0 ? (
                <ul className="settings-note" role="status">
                  {testChecks.map((check) => (
                    <li key={check.id}>
                      {check.status === "ok" ? "✓" : check.status === "skipped" ? "–" : "✕"} {check.label}：{check.detail}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="settings-section">
              <div className="settings-section-title">知识包</div>
              <p className="settings-hint">
                导出会把原始记录、知识页、关联与修订历史打成一个 JSON 文件。它不依赖本应用就能读懂，
                换台机器、换个部署都可以再导入回来。
              </p>
              <button type="button" className="button-secondary settings-test-btn" onClick={() => { window.location.href = "/api/export"; }}>
                导出知识包（.json）
              </button>
              <button type="button" className="button-secondary settings-test-btn" onClick={() => { window.location.href = "/api/export?format=markdown"; }}>
                导出 markdown 知识包（.zip）
              </button>
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

            <div className="settings-section">
              <div className="settings-section-title">本地存储</div>
              <p className="settings-note">
                知识库在本机 PGlite 里，模型配置在 data/settings.json。两者都不进 Git。
                备份 = 导出知识包；换机器 = 在新机器导入。
              </p>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
