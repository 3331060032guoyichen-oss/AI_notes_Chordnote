import { test } from "node:test";
import assert from "node:assert/strict";
import { toChatToolDefinitions } from "./manual";

test("AI 权限按档位收窄工具：仅对话 0 个，只读只有 auto，可提议才出现 proposal 工具", () => {
  assert.equal(toChatToolDefinitions("ask").length, 0);

  const read = toChatToolDefinitions("read").map((tool) => tool.function.name);
  assert.ok(read.includes("search_notes"));
  assert.ok(!read.includes("propose_update"));

  const propose = toChatToolDefinitions("propose").map((tool) => tool.function.name);
  assert.ok(propose.includes("propose_update"));
  assert.ok(!propose.includes("create_note"));
});
