import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { runHarness } from "./runtime";

test("real dsh subprocess performs multiple model/tool turns with a restricted registry", { timeout: 90_000 }, async () => {
  let requests = 0;
  const mock = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body);
    requests++;
    assert.deepEqual(input.tools?.map((t: {function:{name:string}}) => t.function.name), ["runtime_info"]);
    const done = input.messages.some((m: {role:string}) => m.role === "tool");
    const message = done ? { role: "assistant", content: "runtime verified" } : {
      role: "assistant", content: null, tool_calls: [{ id: "call_runtime", type: "function", function: { name: "runtime_info", arguments: "{}" } }],
    };
    res.setHeader("content-type", "text/event-stream");
    const delta = done ? message : { ...message, tool_calls: [{ ...message.tool_calls![0], index: 0 }] };
    res.write(`data: ${JSON.stringify({ id: "mock", object: "chat.completion.chunk", model: "test-model", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: "mock", choices: [{ index: 0, delta: {}, finish_reason: done ? "stop" : "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise<void>(ok => mock.listen(0, "127.0.0.1", ok));
  try {
    const result = await runHarness({ settings: { provider: "ollama", model: "test-model", baseUrl: `http://127.0.0.1:${(mock.address() as {port:number}).port}/v1`, timeoutMs: 45_000, apiKey: null },
      schema: "Use runtime_info then answer.", input: "What model is running?", tools: [{ type: "function", function: { name: "runtime_info", description: "Current runtime", parameters: { type: "object", properties: {}, required: [] } } }],
      execute: async () => { throw new Error("runtime_info must use trusted metadata"); } });
    assert.equal(result.message, "runtime verified");
    assert.equal(result.runtime.model, "test-model");
    assert.ok(requests >= 2);
  } finally { mock.closeAllConnections(); await new Promise<void>(ok => mock.close(() => ok())); }
});
