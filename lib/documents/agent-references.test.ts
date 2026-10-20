import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveAgentReference } from "./agent-references";
import { resolveReference } from "./markdown";

const candidates = [
  { id: "raw_259ed8cf-3549-409a-ab87-4ba2634c3f24", title: "知识图谱与双向链接", path: "raw/inbox/raw_259ed8cf-3549-409a-ab87-4ba2634c3f24.md" },
  { id: "knowledge_11111111-1111-1111-1111-111111111111", title: "知识图谱与双向链接", path: "wilki/concept/knowledge_11111111-1111-1111-1111-111111111111.md" },
];

test("reply references resolve paths, file names and ids to the correct source despite duplicate titles", () => {
  for (const candidate of candidates) {
    for (const target of [candidate.id, candidate.path, candidate.path.split("/").pop()!, candidate.path + "#来源"]) {
      assert.equal(resolveAgentReference(target, candidates)?.id, candidate.id);
      assert.equal(resolveAgentReference(target, candidates)?.title, "知识图谱与双向链接");
    }
  }
  assert.equal(resolveAgentReference("知识图谱与双向链接", candidates), null);
});

test("older abbreviated ids resolve only when the prefix uniquely identifies a note", () => {
  assert.equal(resolveAgentReference("raw_259ed8cf...", candidates)?.id, candidates[0].id);
  assert.equal(resolveAgentReference("raw_259ed8cf…", candidates)?.id, candidates[0].id);
  const collision = { ...candidates[0], id: "raw_259ed8cf-0000-0000-0000-000000000000" };
  assert.equal(resolveAgentReference("raw_259ed8cf...", [...candidates, collision]), null);
});

test("folders, missing notes and unsafe schemes never resolve to a note", () => {
  for (const target of ["raw/inbox/", "不存在", "raw_259...", "javascript:alert(1)"]) {
    assert.equal(resolveAgentReference(target, candidates), null);
  }
});

test("document wikilinks prefer the current layer without hiding cross-layer explicit paths", () => {
  for (const source of candidates) {
    assert.equal(resolveReference(source.title, candidates, source.path)?.id, source.id);
    for (const target of candidates) assert.equal(resolveReference(target.path, candidates, source.path)?.id, target.id);
  }
  const duplicate = { id: "raw_other", title: candidates[0].title, path: "raw/articles/other.md" };
  assert.equal(resolveReference(duplicate.title, [...candidates, duplicate], candidates[0].path), null);
});

test("generated-id links survive source classification without rewriting source Markdown", () => {
  const moved = [{ ...candidates[0], path: `raw/papers/${candidates[0].id}.md` }];
  assert.equal(resolveAgentReference(candidates[0].path, moved)?.id, moved[0].id);
  assert.equal(resolveReference(candidates[0].path, moved)?.id, moved[0].id);
});
