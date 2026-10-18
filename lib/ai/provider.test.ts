import assert from "node:assert/strict";
import test from "node:test";

import {
  ProviderError,
  createChatProvider,
  type ChatProviderConfig,
  type ChatToolDefinition,
} from "./provider";

type Recorded = { url: string; init: RequestInit };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function config(overrides: Partial<ChatProviderConfig> = {}): ChatProviderConfig {
  return {
    provider: "ollama",
    baseUrl: "http://127.0.0.1:11434/v1",
    model: "qwen3:4b",
    apiKey: null,
    timeoutMs: 1_000,
    ...overrides,
  };
}

function capture(response: Response, recorded: Recorded[]): typeof fetch {
  return async (input, init) => {
    recorded.push({ url: String(input), init: init ?? {} });
    return response;
  };
}

const TOOL: ChatToolDefinition = {
  type: "function",
  function: {
    name: "search_notes",
    description: "search",
    parameters: { type: "object", properties: {}, required: [] },
  },
};

test("请求归一化：拼接地址、去掉尾部斜杠、无密钥时不带 Authorization", async () => {
  const recorded: Recorded[] = [];
  const provider = createChatProvider(
    config({
      baseUrl: "http://127.0.0.1:11434/v1/",
      fetchImpl: capture(jsonResponse({ choices: [{ message: { content: " ok " } }] }), recorded),
    }),
  );

  const result = await provider.chat({ messages: [{ role: "user", content: "hi" }] });

  assert.equal(result.content, "ok");
  assert.equal(recorded[0].url, "http://127.0.0.1:11434/v1/chat/completions");

  const headers = recorded[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, undefined);

  const body = JSON.parse(String(recorded[0].init.body));
  assert.equal(body.model, "qwen3:4b");
  assert.equal(body.temperature, 0.2);
  assert.equal("tools" in body, false);
  // 两个供应商差异字段都不该在 Ollama 的普通请求里出现
  assert.equal("tool_choice" in body, false);
  assert.equal("response_format" in body, false);
});

test("DeepSeek：带 Bearer、带 response_format、解析工具调用并过滤畸形项", async () => {
  const recorded: Recorded[] = [];
  const provider = createChatProvider(
    config({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "sk-test",
      fetchImpl: capture(
        jsonResponse({
          choices: [
            {
              message: {
                content: null,
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "search_notes", arguments: '{"keywords":["极限"]}' },
                  },
                  { id: 42, type: "function", function: { name: "bad" } },
                ],
              },
            },
          ],
        }),
        recorded,
      ),
    }),
  );

  const result = await provider.chat({
    messages: [{ role: "user", content: "hi" }],
    tools: [TOOL],
    json: true,
  });

  const headers = recorded[0].init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-test");

  const body = JSON.parse(String(recorded[0].init.body));
  assert.deepEqual(body.tools, [TOOL]);
  assert.deepEqual(body.response_format, { type: "json_object" });

  assert.equal(result.content, "");
  assert.equal(result.toolCalls.length, 1);
  assert.equal(result.toolCalls[0].function.name, "search_notes");
});

test("Ollama 不发 response_format，但仍解析工具调用", async () => {
  const recorded: Recorded[] = [];
  const provider = createChatProvider(
    config({
      fetchImpl: capture(
        jsonResponse({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: { name: "search_notes", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        }),
        recorded,
      ),
    }),
  );

  const result = await provider.chat({
    messages: [{ role: "user", content: "hi" }],
    tools: [TOOL],
    json: true,
  });

  const body = JSON.parse(String(recorded[0].init.body));
  assert.equal("response_format" in body, false);
  assert.equal(result.toolCalls.length, 1);
});

test("HTTP 错误保留状态码与上游正文", async () => {
  const provider = createChatProvider(
    config({
      fetchImpl: async () => new Response("model 'qwen3:4b' not found", { status: 404 }),
    }),
  );

  await assert.rejects(
    () => provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => {
      assert.ok(error instanceof ProviderError);
      assert.equal(error.code, "UPSTREAM_ERROR");
      assert.equal(error.status, 404);
      assert.match(error.message, /404/);
      assert.match(error.message, /not found/);
      return true;
    },
  );
});

test("非 JSON 响应与空信封都归为 UPSTREAM_INVALID_JSON", async () => {
  const notJson = createChatProvider(
    config({ fetchImpl: async () => new Response("plain text", { status: 200 }) }),
  );

  await assert.rejects(
    () => notJson.chat({ messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => error instanceof ProviderError && error.code === "UPSTREAM_INVALID_JSON",
  );

  const noChoices = createChatProvider(
    config({ fetchImpl: async () => jsonResponse({ choices: [] }) }),
  );

  await assert.rejects(
    () => noChoices.chat({ messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => error instanceof ProviderError && error.code === "UPSTREAM_INVALID_JSON",
  );
});

test("超时映射为 TIMEOUT", async () => {
  const provider = createChatProvider(
    config({
      timeoutMs: 5,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
          });
        }),
    }),
  );

  await assert.rejects(
    () => provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => error instanceof ProviderError && error.code === "TIMEOUT",
  );
});

test("网络错误映射为 UPSTREAM_ERROR", async () => {
  const provider = createChatProvider(
    config({
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    }),
  );

  await assert.rejects(
    () => provider.chat({ messages: [{ role: "user", content: "hi" }] }),
    (error: unknown) => error instanceof ProviderError && error.code === "UPSTREAM_ERROR",
  );
});

test("DeepSeek 缺密钥在发请求前就失败", () => {
  assert.throws(
    () => createChatProvider(config({ provider: "deepseek", apiKey: null })),
    (error: unknown) => error instanceof ProviderError && error.code === "CONFIG_MISSING",
  );
});

test("配置不完整时抛 CONFIG_INVALID", () => {
  assert.throws(
    () => createChatProvider(config({ model: "  " })),
    (error: unknown) => error instanceof ProviderError && error.code === "CONFIG_INVALID",
  );
});

test("listModels 解析模型 id 并过滤无效项", async () => {
  const recorded: Recorded[] = [];
  const provider = createChatProvider(
    config({
      baseUrl: "http://127.0.0.1:11434/v1/",
      fetchImpl: capture(
        jsonResponse({ data: [{ id: "qwen3:4b" }, { id: 7 }, { name: "x" }] }),
        recorded,
      ),
    }),
  );

  const models = await provider.listModels();

  assert.equal(recorded[0].url, "http://127.0.0.1:11434/v1/models");
  assert.deepEqual(models, ["qwen3:4b"]);
});
