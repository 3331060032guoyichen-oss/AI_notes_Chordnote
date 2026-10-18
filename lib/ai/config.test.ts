import assert from "node:assert/strict";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import os from "node:os";
import path from "node:path";

import {
  PROVIDER_DEFAULTS,
  defaultSettingsPath,
  publicModelSettings,
  readModelSettings,
  resolveModelSettings,
  updateModelSettings,
} from "./config";
import { ProviderError } from "./provider";

async function tempSettingsPath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "chordnote-settings-"));

  return join(dir, "settings.json");
}

test("文件不存在时回到 DeepSeek 默认值，且没有密钥", async () => {
  const settings = await readModelSettings(await tempSettingsPath());

  assert.equal(settings.provider, "deepseek");
  assert.equal(settings.model, "deepseek-chat");
  assert.equal(settings.baseUrl, "https://api.deepseek.com");
  assert.equal(settings.apiKey, null);
});

test("读文件：缺省字段按 provider 的默认值补齐", async () => {
  const path = await tempSettingsPath();
  await writeFile(path, JSON.stringify({ provider: "ollama", model: "qwen3:4b" }), "utf8");

  const settings = await readModelSettings(path);

  assert.equal(settings.provider, "ollama");
  assert.equal(settings.baseUrl, "http://localhost:11434/v1");
  assert.equal(settings.timeoutMs, 120_000);
});

test("坏 JSON 抛出 CONFIG_INVALID，不静默回退", async () => {
  const path = await tempSettingsPath();
  await writeFile(path, "{ not json", "utf8");

  await assert.rejects(
    () => readModelSettings(path),
    (error: unknown) => error instanceof ProviderError && error.code === "CONFIG_INVALID",
  );
});

test("环境变量优先于文件，并被标记为锁定", async () => {
  const file = { ...PROVIDER_DEFAULTS.deepseek, apiKey: "sk-file" };
  const { settings, locked } = resolveModelSettings(file, {
    CHORDNOTE_PROVIDER: "ollama",
    CHORDNOTE_MODEL: "qwen3:4b",
    DEEPSEEK_API_KEY: "sk-env-legacy",
  });

  assert.equal(settings.provider, "ollama");
  assert.equal(settings.model, "qwen3:4b");
  // 换成 Ollama 后，遗留的 DEEPSEEK_API_KEY 不再生效
  assert.equal(settings.apiKey, "sk-file");
  assert.deepEqual(locked.sort(), ["model", "provider"]);
});

test("旧的 DEEPSEEK_* 只在 provider=deepseek 时生效", async () => {
  const file = { ...PROVIDER_DEFAULTS.deepseek, apiKey: null };
  const legacy = resolveModelSettings(file, {
    DEEPSEEK_MODEL: "deepseek-reasoner",
    DEEPSEEK_BASE_URL: "https://example.test",
    DEEPSEEK_TIMEOUT_MS: "45000",
    DEEPSEEK_API_KEY: "sk-legacy",
  });

  assert.equal(legacy.settings.model, "deepseek-reasoner");
  assert.equal(legacy.settings.baseUrl, "https://example.test");
  assert.equal(legacy.settings.timeoutMs, 45_000);
  assert.equal(legacy.settings.apiKey, "sk-legacy");
  assert.deepEqual(legacy.locked.sort(), ["apiKey", "baseUrl", "model", "timeoutMs"]);
});

test("统一变量优先于旧变量", async () => {
  const file = { ...PROVIDER_DEFAULTS.deepseek };
  const { settings } = resolveModelSettings(file, {
    CHORDNOTE_MODEL: "deepseek-chat",
    DEEPSEEK_MODEL: "deepseek-reasoner",
  });

  assert.equal(settings.model, "deepseek-chat");
});

test("脱敏视图不含密钥，只报告是否已配置", async () => {
  const { settings, locked } = resolveModelSettings({
    ...PROVIDER_DEFAULTS.deepseek,
    apiKey: "sk-secret",
  }, {});

  const view = publicModelSettings(settings, locked);

  assert.equal("apiKey" in view, false);
  assert.equal(view.apiKeyConfigured, true);
  assert.equal(JSON.stringify(view).includes("sk-secret"), false);
});

test("更新：不传密钥=保持，null=清除，字符串=设置", async () => {
  const path = await tempSettingsPath();

  await updateModelSettings({ apiKey: "sk-one" }, path);
  await updateModelSettings({ model: "deepseek-reasoner" }, path);
  assert.equal((await readModelSettings(path)).apiKey, "sk-one");

  await updateModelSettings({ apiKey: "" }, path);
  assert.equal((await readModelSettings(path)).apiKey, "sk-one");

  await updateModelSettings({ apiKey: null }, path);
  assert.equal((await readModelSettings(path)).apiKey, null);
});

test("切换 provider 时补齐该 provider 的默认模型与地址", async () => {
  const path = await tempSettingsPath();

  await updateModelSettings({ provider: "ollama" }, path);
  const settings = await readModelSettings(path);

  assert.equal(settings.model, "qwen3:4b");
  assert.equal(settings.baseUrl, "http://localhost:11434/v1");
  assert.equal(settings.timeoutMs, 120_000);
});

test("非法地址被拒绝", async () => {
  const path = await tempSettingsPath();

  await assert.rejects(
    () => updateModelSettings({ baseUrl: "ftp://example.test" }, path),
    (error: unknown) => error instanceof ProviderError && error.code === "CONFIG_INVALID",
  );
});

test("POSIX 下配置文件是 0600（Windows 不适用）", async () => {
  if (process.platform === "win32") return;

  const path = await tempSettingsPath();
  await updateModelSettings({ apiKey: "sk-mode" }, path);

  const mode = (await stat(path)).mode & 0o777;
  assert.equal(mode, 0o600);

  const raw = await readFile(path, "utf8");
  assert.match(raw, /"apiKey": "sk-mode"/);
});
test("设置文件路径可被 CHORDNOTE_SETTINGS_FILE 覆盖", () => {
  const previous = process.env.CHORDNOTE_SETTINGS_FILE;
  const settingsFile = path.join(os.tmpdir(), "chordnote-test.json");
  process.env.CHORDNOTE_SETTINGS_FILE = settingsFile;

  try {
    assert.equal(defaultSettingsPath(), settingsFile);
  } finally {
    if (previous === undefined) delete process.env.CHORDNOTE_SETTINGS_FILE;
    else process.env.CHORDNOTE_SETTINGS_FILE = previous;
  }
});