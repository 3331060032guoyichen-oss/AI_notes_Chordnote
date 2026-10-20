import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { stringify } from "yaml";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import type { ModelSettings } from "../ai/config";
import { ProviderError, type ChatToolDefinition } from "../ai/provider";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { contextBudget, estimateTokens, MESSAGE_BUDGET } from "./context";
import type { AgentPermission } from "./manual";

export function runtimeInformation(settings: ModelSettings, tools: ChatToolDefinition[], permission: AgentPermission = "propose") {
  return { engine: "dsh", version: "0.2.1-rc.2", provider: settings.agentBackend === "acp" ? `acp:${settings.acp?.label ?? "external"}` : settings.provider,
    model: settings.model, tools: tools.map(t => t.function.name),
    permissions: { mode: permission, read: true, mutations: permission === "full" ? "automatic task-scoped changes" : permission === "read" ? "none" : "pending proposals only", rawText: "read only", shell: false, database: false } };
}

/** dsh owns the multi-turn loop. This host owns authentication and business permissions. */
export async function runHarness(options: {
  settings: ModelSettings; schema: string; tools: ChatToolDefinition[]; input: string;
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
  signal?: AbortSignal;
  history?: SessionEvent[];
  onDiagnostic?: (message: string) => void;
  permission?: AgentPermission;
}) {
  const { settings, tools } = options;
  if (settings.agentBackend !== "acp" && settings.provider !== "ollama" && !settings.apiKey) {
    throw new ProviderError("CONFIG_MISSING", "请在模型设置中配置 API Key。");
  }
  options.signal?.throwIfAborted();
  if (settings.agentBackend === "acp" && !settings.acp?.command) throw new ProviderError("CONFIG_MISSING","请配置 ACP 可执行程序。");
  const root = await mkdtemp(join(tmpdir(), "chordnote-dsh-"));
  const workspace = join(root, "workspace");
  const token = randomBytes(32).toString("hex");
  const adminToken = randomBytes(32).toString("hex");
  const children = new Set<number>();
  const allowed = new Set(tools.map(t => t.function.name));
  let ready = false;
  let calls = 0;
  let budgetExceeded = false;
  const runtime = runtimeInformation(settings, tools, options.permission);
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    const admin = req.headers.authorization === `Bearer ${adminToken}`;
    if (!admin && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
    try {
      if (req.url === "/config" && req.method === "GET") {
        res.end(JSON.stringify({ schema: options.schema, history: options.history ?? [], contextBudget: contextBudget(), runtime, tools, acp:{...settings.acp,mcpScript:resolve("lib/agent/acp-mcp.mjs")} })); return;
      }
      if (req.url === "/ready" && req.method === "POST") { ready = true; res.end("{}"); return; }
      if (req.url === "/budget-exceeded" && req.method === "POST") { budgetExceeded = true; res.end("{}"); return; }
      if (admin && ["/child","/runtime"].includes(req.url ?? "") && req.method === "POST") {
        let body=""; for await (const chunk of req) { body+=chunk; if(body.length>8192) throw new Error("Too large"); }
        const data=JSON.parse(body);
        if (req.url === "/child" && Number.isSafeInteger(data.pid) && data.pid > 0 && data.pid !== process.pid) children.add(data.pid);
        if (req.url === "/runtime" && typeof data.model === "string" && typeof data.provider === "string") { runtime.model=data.model;runtime.provider=data.provider; }
        res.end("{}");return;
      }
      if (!ready || req.url !== "/tool" || req.method !== "POST" || ++calls > 64) {
        res.writeHead(403).end(); return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1_000_000) throw new Error("Tool request too large");
      }
      const { name, args } = JSON.parse(body);
      if (estimateTokens(JSON.stringify(args)) > MESSAGE_BUDGET) {
        res.end(JSON.stringify({ result: "工具参数超过单条消息上限，请缩短内容或拆分任务。" })); return;
      }
      if (!allowed.has(name) || !args || typeof args !== "object" || Array.isArray(args)) {
        res.writeHead(403).end(); return;
      }
      options.signal?.throwIfAborted();
      const result = name === "runtime_info" ? JSON.stringify(runtime) : await options.execute(name, args);
      res.end(JSON.stringify({ result }));
    } catch { res.writeHead(400).end(JSON.stringify({ error: "Tool execution failed" })); }
  });
  let harness: DeepSeekHarness | undefined;
  const abort = () => { void harness?.close(); };
  try {
  await mkdir(workspace);
  await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", ok); });
  const port = (server.address() as { port: number }).port;
  // dsh loads this adapter by file path from its generated patch. Do not use
  // `createRequire()` here: Next's server bundler replaces that call with
  // `undefined` in an App Route, so Agent runs fail before reaching the model.
  // The package version is pinned and this is its public entry point.
  const modelAdapterPath = resolve("node_modules/@deepseek-ai/dsh-llm-pi-ai/lib/index.js");
  const disabled = ["llm-deepseek", "deepseek-llm-api-extensions", "session-log-deepseek", "plugin-package-inventory-deepseek",
    "sandbox", "attachment-local", "tool-fs", "tool-working-directory", "sandbox-policy", "subprocess", "pty",
    "terminal-bash", "terminal-pwsh", "persistent-bash", "persistent-pwsh", "image-offload", "jobs"];
  const patch = [...disabled.map(id => ({ id, disabled: true })),
    { id: "system-prompt", config: { includeHarnessIdentity: false, includeRuntimeContext: true, personaPrefix: "" } },
    { id: "sdk-jsonrpc-server", inject: ["sdkAppStartup", "loader", "chordnotePolicy"] },
    { insert: [
      { id: "chordnote-policy", name: resolve("lib/agent/dsh-policy.mjs") },
      ...(settings.agentBackend === "acp" ? [{id:"chordnote-acp",name:resolve("lib/agent/dsh-acp.mjs")}] : [{ id: "chordnote-models", name: modelAdapterPath, config: { providers: {
        chordnote: { api: "openai-completions", baseURL: settings.baseUrl,
          apiKeyEnv: "CHORDNOTE_RUNTIME_KEY", models: [{ id: settings.model }] },
      } } }]),
    ] }];
  const patchPath = join(root, "chordnote.yml");
  await writeFile(patchPath, stringify(patch), { mode: 0o600 });
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "PATHEXT"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { CHORDNOTE_BRIDGE: `http://127.0.0.1:${port}`, CHORDNOTE_RUN_TOKEN: token,
    CHORDNOTE_ADMIN_TOKEN:adminToken,
    CHORDNOTE_RUNTIME_KEY: settings.apiKey ?? "ollama" });
  harness = new DeepSeekHarness({ profile: "sdk-minimal", patches: [patchPath], dshHome: join(root, "home"),
    processCwd: workspace, cwd: workspace, provider: "chordnote", model: settings.model, env,
    initializeTimeoutMs: 60_000, requestTimeoutMs: settings.timeoutMs });
  options.signal?.addEventListener("abort", abort, { once: true });
    const result = await harness.run(options.input);
    if (result.events.some(event => event.type === "turn/end" && (event.data as {reason?:{kind?:string}}).reason?.kind === "error")) throw new Error("Model turn failed");
    if (!ready) throw new Error("Policy unavailable");
    options.signal?.throwIfAborted();
    const start = result.events.findLastIndex(event => event.type === "user/message" && event.data.source.kind === "user");
    const events = result.events.slice(Math.max(0, start)).filter(event =>
      event.type === "user/message" ? event.data.source.kind === "user" : ["assistant/message", "tool/call", "tool/result"].includes(event.type));
    return { message: result.finalResponse, runtime, events };
  } catch (error) {
    if (budgetExceeded) throw new ProviderError("UPSTREAM_ERROR", "本轮上下文已达到长度上限，请缩小引用范围或开始新会话。");
    let detail = error instanceof Error ? error.message : "Runtime failed";
    for (const secret of [settings.apiKey, token, adminToken].filter(Boolean) as string[]) detail = detail.split(secret).join("[redacted]");
    options.onDiagnostic?.(detail);
    throw new ProviderError("UPSTREAM_ERROR", "dsh 运行失败；请检查模型连接、工具支持与运行时日志。");
  } finally {
    options.signal?.removeEventListener("abort", abort);
    for (const pid of children) {
      if (process.platform === "win32") await new Promise<void>(ok=>execFile("taskkill",["/PID",String(pid),"/T","/F"],{windowsHide:true},()=>ok()));
      else { try { process.kill(pid,"SIGTERM"); } catch { /* Already stopped. */ } }
    }
    await harness?.close().catch(() => undefined);
    server.closeAllConnections();
    await new Promise<void>(ok => server.close(() => ok()));
    await rm(root, { recursive: true, force: true });
  }
}
