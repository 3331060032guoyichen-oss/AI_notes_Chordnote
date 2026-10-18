/**
 * 模型配置：服务端唯一真相。
 *
 * 优先级：统一环境变量 > 旧的 DEEPSEEK_* 变量（只在 provider=deepseek 时）> data/settings.json > 默认值。
 * 浏览器只拿得到脱敏状态，永远读不到 API Key，也不能通过请求参数选择内部 provider。
 *
 * 这个文件不读数据库：设置接口负责审计，配置解析保持纯函数，方便离线测试。
 */

import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { ProviderError, type ChatProviderConfig, type ProviderId } from "./provider";

export const PROVIDER_IDS = ["deepseek", "ollama", "custom"] as const;

/** 界面展示用的默认值。切换 provider 时如果没带模型名/地址，会落到这里。 */
export const PROVIDER_DEFAULTS: Record<ProviderId, ModelSettings> = {
  deepseek: {
    provider: "deepseek",
    model: "deepseek-chat",
    baseUrl: "https://api.deepseek.com",
    timeoutMs: 30_000,
    apiKey: null,
  },
  ollama: {
    provider: "ollama",
    model: "qwen3:4b",
    baseUrl: "http://localhost:11434/v1",
    timeoutMs: 120_000,
    apiKey: null,
  },
  custom: {
    provider: "custom",
    model: "",
    baseUrl: "",
    timeoutMs: 30_000,
    apiKey: null,
  },
};

export type ModelSettings = {
  provider: ProviderId;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  /** 只存在于服务端。接口与前端永远拿不到这个值。 */
  apiKey: string | null;
};

export type LockedField = "provider" | "model" | "baseUrl" | "timeoutMs" | "apiKey";

export type ResolvedModelSettings = {
  settings: ModelSettings;
  /** 被环境变量锁住的字段：界面应禁用，接口应拒绝修改。 */
  locked: LockedField[];
};

export type ModelSettingsPatch = {
  provider?: ProviderId;
  model?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** undefined = 保持现有密钥；null = 清除；字符串 = 设置为新值。 */
  apiKey?: string | null;
};

export const MAX_TIMEOUT_MS = 600_000;
export const MIN_TIMEOUT_MS = 1_000;

export function defaultSettingsPath(): string {
  return resolve(process.env.CHORDNOTE_SETTINGS_FILE ?? "./data/settings.json");
}

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && (PROVIDER_IDS as readonly string[]).includes(value);
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function assertValidSettled(settings: ModelSettings): ModelSettings {
  if (!isProviderId(settings.provider)) {
    throw new ProviderError("CONFIG_INVALID", "未知的模型提供者。");
  }

  if (!settings.model.trim()) {
    throw new ProviderError("CONFIG_INVALID", "模型名不能为空。");
  }

  let parsed: URL;

  try {
    parsed = new URL(settings.baseUrl);
  } catch {
    throw new ProviderError("CONFIG_INVALID", "服务地址不是合法 URL。");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderError("CONFIG_INVALID", "服务地址只接受 http 或 https。");
  }

  if (
    !Number.isFinite(settings.timeoutMs) ||
    settings.timeoutMs < MIN_TIMEOUT_MS ||
    settings.timeoutMs > MAX_TIMEOUT_MS
  ) {
    throw new ProviderError(
      "CONFIG_INVALID",
      `超时时间必须在 ${MIN_TIMEOUT_MS}–${MAX_TIMEOUT_MS} 毫秒之间。`,
    );
  }

  return {
    ...settings,
    model: settings.model.trim(),
    baseUrl: normalizeUrl(settings.baseUrl),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 读配置文件。文件不存在时返回 DeepSeek 默认值（与接入前的行为一致）。 */
export async function readModelSettings(path = defaultSettingsPath()): Promise<ModelSettings> {
  let raw: string;

  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return { ...PROVIDER_DEFAULTS.deepseek };
    }

    throw new ProviderError("CONFIG_INVALID", "模型配置读不出来。");
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ProviderError("CONFIG_INVALID", "模型配置文件不是合法 JSON。");
  }

  if (!isRecord(parsed)) {
    throw new ProviderError("CONFIG_INVALID", "模型配置文件格式不对。");
  }

  const provider = isProviderId(parsed.provider) ? parsed.provider : "deepseek";
  const defaults = PROVIDER_DEFAULTS[provider];

  return {
    provider,
    model: typeof parsed.model === "string" && parsed.model.trim() ? parsed.model : defaults.model,
    baseUrl:
      typeof parsed.baseUrl === "string" && parsed.baseUrl.trim() ? parsed.baseUrl : defaults.baseUrl,
    timeoutMs:
      typeof parsed.timeoutMs === "number" && Number.isFinite(parsed.timeoutMs)
        ? parsed.timeoutMs
        : defaults.timeoutMs,
    apiKey: typeof parsed.apiKey === "string" && parsed.apiKey ? parsed.apiKey : null,
  };
}

type EnvLike = Record<string, string | undefined>;

function envNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 合并环境变量。
 *
 * 旧的 DEEPSEEK_* 只在最终 provider 是 deepseek 时生效：
 * 换成 Ollama 后，遗留的 DEEPSEEK_API_KEY 不应再影响任何请求。
 */
export function resolveModelSettings(
  fileSettings: ModelSettings,
  env: EnvLike = process.env,
): ResolvedModelSettings {
  const locked: LockedField[] = [];
  const merged: ModelSettings = { ...fileSettings };

  if (isProviderId(env.CHORDNOTE_PROVIDER)) {
    merged.provider = env.CHORDNOTE_PROVIDER;
    locked.push("provider");
  }

  const legacy = merged.provider === "deepseek";

  const model = env.CHORDNOTE_MODEL ?? (legacy ? env.DEEPSEEK_MODEL : undefined);
  if (model) {
    merged.model = model;
    locked.push("model");
  }

  const baseUrl = env.CHORDNOTE_BASE_URL ?? (legacy ? env.DEEPSEEK_BASE_URL : undefined);
  if (baseUrl) {
    merged.baseUrl = baseUrl;
    locked.push("baseUrl");
  }

  const timeoutMs =
    envNumber(env.CHORDNOTE_TIMEOUT_MS) ?? (legacy ? envNumber(env.DEEPSEEK_TIMEOUT_MS) : undefined);
  if (timeoutMs !== undefined) {
    merged.timeoutMs = timeoutMs;
    locked.push("timeoutMs");
  }

  const apiKey = env.CHORDNOTE_API_KEY ?? (legacy ? env.DEEPSEEK_API_KEY : undefined);
  if (apiKey) {
    merged.apiKey = apiKey;
    locked.push("apiKey");
  }

  return { settings: assertValidSettled(merged), locked };
}

/** 前端拿到的唯一形态：没有任何密钥。 */
export function publicModelSettings(
  settings: ModelSettings,
  locked: LockedField[],
): Omit<ModelSettings, "apiKey"> & { apiKeyConfigured: boolean; locked: LockedField[] } {
  return {
    provider: settings.provider,
    model: settings.model,
    baseUrl: settings.baseUrl,
    timeoutMs: settings.timeoutMs,
    apiKeyConfigured: Boolean(settings.apiKey),
    locked,
  };
}

/** 把配置交给 provider 层。密钥缺失时的错误由 `createChatProvider` 抛。 */
export function toProviderConfig(settings: ModelSettings): ChatProviderConfig {
  return {
    provider: settings.provider,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKey: settings.apiKey,
    timeoutMs: settings.timeoutMs,
  };
}

/**
 * 写回配置。
 *
 * 密钥语义：不传 = 保持；`null` = 清除；非空字符串 = 设为新值。
 * 换 provider 时若没带模型名/地址，落到该 provider 的默认值，避免留下错配组合。
 */
export async function updateModelSettings(
  patch: ModelSettingsPatch,
  path = defaultSettingsPath(),
): Promise<ModelSettings> {
  const current = await readModelSettings(path);
  const next: ModelSettings = { ...current };

  if (patch.provider !== undefined) {
    if (!isProviderId(patch.provider)) {
      throw new ProviderError("CONFIG_INVALID", "未知的模型提供者。");
    }

    if (patch.provider !== current.provider) {
      const defaults = PROVIDER_DEFAULTS[patch.provider];
      next.provider = patch.provider;

      if (patch.model === undefined) next.model = defaults.model;
      if (patch.baseUrl === undefined) next.baseUrl = defaults.baseUrl;
      if (patch.timeoutMs === undefined) next.timeoutMs = defaults.timeoutMs;
    }
  }

  if (patch.model !== undefined) next.model = patch.model;
  if (patch.baseUrl !== undefined) next.baseUrl = patch.baseUrl;
  if (patch.timeoutMs !== undefined) next.timeoutMs = patch.timeoutMs;

  if (patch.apiKey === null) {
    next.apiKey = null;
  } else if (typeof patch.apiKey === "string" && patch.apiKey.trim()) {
    next.apiKey = patch.apiKey.trim();
  }

  const settled = assertValidSettled(next);

  await mkdir(dirname(path), { recursive: true });

  const tempPath = `${path}.tmp`;
  // mode 只在创建文件时生效；POSIX 下是 0600，Windows 下会被忽略（见 ADR-0007）。
  await writeFile(tempPath, `${JSON.stringify(settled, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, path);

  if (process.platform !== "win32") {
    await chmod(path, 0o600);
  }

  return settled;
}
