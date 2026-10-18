import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { stringify } from "yaml";
import { DeepSeekHarness } from "@deepseek-ai/dsh-sdk-client";
import type { ModelSettings } from "../ai/config";
import { ProviderError, type ChatToolDefinition } from "../ai/provider";

export function runtimeInformation(settings: ModelSettings, tools: ChatToolDefinition[]) {
  return { engine: "dsh", version: "0.2.1-rc.2", provider: settings.provider,
    model: settings.model, tools: tools.map(t => t.function.name),
    permissions: { read: true, mutations: "pending proposals only", shell: false, database: false } };
}

/** dsh owns the multi-turn loop. This host owns authentication and business permissions. */
export async function runHarness(options: {
  settings: ModelSettings; schema: string; tools: ChatToolDefinition[]; input: string;
  execute: (name: string, args: Record<string, unknown>) => Promise<string>;
  signal?: AbortSignal;
}) {
  const { settings, tools } = options;
  if (settings.provider !== "ollama" && !settings.apiKey) {
    throw new ProviderError("CONFIG_MISSING", "请在模型设置中配置 API Key。");
  }
  options.signal?.throwIfAborted();
  const root = await mkdtemp(join(tmpdir(), "chordnote-dsh-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const token = randomBytes(32).toString("hex");
  const allowed = new Set(tools.map(t => t.function.name));
  let ready = false;
  let calls = 0;
  const runtime = runtimeInformation(settings, tools);
  const server = createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(403).end(); return; }
    try {
      if (req.url === "/config" && req.method === "GET") {
        res.end(JSON.stringify({ schema: options.schema, runtime, tools })); return;
      }
      if (req.url === "/ready" && req.method === "POST") { ready = true; res.end("{}"); return; }
      if (!ready || req.url !== "/tool" || req.method !== "POST" || ++calls > 64) {
        res.writeHead(403).end(); return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (Buffer.byteLength(body) > 1_000_000) throw new Error("Tool request too large");
      }
      const { name, args } = JSON.parse(body);
      if (!allowed.has(name) || !args || typeof args !== "object" || Array.isArray(args)) {
        res.writeHead(403).end(); return;
      }
      options.signal?.throwIfAborted();
      const result = name === "runtime_info" ? JSON.stringify(runtime) : await options.execute(name, args);
      res.end(JSON.stringify({ result }));
    } catch { res.writeHead(400).end(JSON.stringify({ error: "Tool execution failed" })); }
  });
  await new Promise<void>((ok, fail) => { server.once("error", fail); server.listen(0, "127.0.0.1", ok); });
  const port = (server.address() as { port: number }).port;
  const requireModule = createRequire(resolve("package.json"));
  const disabled = ["llm-deepseek", "deepseek-llm-api-extensions", "session-log-deepseek", "plugin-package-inventory-deepseek",
    "sandbox", "attachment-local", "tool-fs", "tool-working-directory", "sandbox-policy", "subprocess", "pty",
    "terminal-bash", "terminal-pwsh", "persistent-bash", "persistent-pwsh", "image-offload", "jobs"];
  const patch = [...disabled.map(id => ({ id, disabled: true })),
    { id: "system-prompt", config: { includeHarnessIdentity: false, includeRuntimeContext: true, personaPrefix: "" } },
    { id: "sdk-jsonrpc-server", inject: ["sdkAppStartup", "loader", "chordnotePolicy"] },
    { insert: [
      { id: "chordnote-policy", name: resolve("lib/agent/dsh-policy.mjs") },
      { id: "chordnote-models", name: requireModule.resolve("@deepseek-ai/dsh-llm-pi-ai"), config: { providers: {
        chordnote: { api: "openai-completions", baseURL: settings.baseUrl,
          apiKeyEnv: "CHORDNOTE_RUNTIME_KEY", models: [{ id: settings.model }] },
      } } },
    ] }];
  const patchPath = join(root, "chordnote.yml");
  await writeFile(patchPath, stringify(patch), { mode: 0o600 });
  const env: NodeJS.ProcessEnv = { NODE_ENV: "production" };
  for (const key of ["PATH", "Path", "SystemRoot", "WINDIR", "TEMP", "TMP", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "PATHEXT"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { CHORDNOTE_BRIDGE: `http://127.0.0.1:${port}`, CHORDNOTE_RUN_TOKEN: token,
    CHORDNOTE_RUNTIME_KEY: settings.apiKey ?? "ollama" });
  const harness = new DeepSeekHarness({ profile: "sdk-minimal", patches: [patchPath], dshHome: join(root, "home"),
    processCwd: workspace, cwd: workspace, provider: "chordnote", model: settings.model, env,
    initializeTimeoutMs: 30_000, requestTimeoutMs: settings.timeoutMs });
  const abort = () => { void harness.close(); };
  options.signal?.addEventListener("abort", abort, { once: true });
  try {
    const result = await harness.run(options.input);
    if (result.events.some(event => event.type === "turn/end" && (event.data as {reason?:{kind?:string}}).reason?.kind === "error")) throw new Error("Model turn failed");
    if (!ready) throw new Error("Policy unavailable");
    options.signal?.throwIfAborted();
    return { message: result.finalResponse, runtime };
  } catch {
    throw new ProviderError("UPSTREAM_ERROR", "dsh 运行失败；请检查模型连接、工具支持与运行时日志。");
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await harness.close();
    server.closeAllConnections();
    await new Promise<void>(ok => server.close(() => ok()));
    await rm(root, { recursive: true, force: true });
  }
}
