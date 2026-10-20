import { test } from "node:test";
import assert from "node:assert/strict";
import { toChatToolDefinitions } from "./manual";

test("只读与可提议保留原工具边界，完全允许才提供分类与归档操作", () => {
  const read = toChatToolDefinitions("read").map((tool) => tool.function.name);
  assert.ok(read.includes("search_notes"));
  assert.ok(!read.includes("propose_update"));

  const propose = toChatToolDefinitions("propose").map((tool) => tool.function.name);
  assert.ok(propose.includes("propose_update"));
  assert.ok(!propose.includes("create_note"));
  assert.ok(!propose.includes("classify_document"));
  assert.ok(!read.includes("archive_knowledge"));
  const full = toChatToolDefinitions("full").map(tool => tool.function.name);
  assert.ok(full.includes("classify_document"));
  assert.ok(full.includes("archive_knowledge"));
  assert.ok(full.includes("draft_knowledge"));
  assert.ok(!full.includes("create_note"));
});
