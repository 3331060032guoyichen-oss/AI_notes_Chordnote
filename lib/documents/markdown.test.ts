import { test } from "node:test";
import assert from "node:assert/strict";
import { makeMarkdown, patchProperties, readMarkdown, parseWikiReferences, resolveReference, safeDocumentPath } from "./markdown";
import { applyLegacyPatch } from "./compat";

test("wikilinks share AST semantics, ignore YAML, code and escapes", () => {
  const md = '---\nsource: "[[yaml]]"\n---\n# A\n[[B|别名]] [[folder/C#段落]]\n`[[code]]`\n\\[[escape]]\n```md\n[[fenced]]\n```';
  assert.deepEqual(parseWikiReferences(md).map(r => [r.target, r.alias, r.heading]), [["B", "别名", ""], ["folder/C", "folder/C", "段落"]]);
});
test("property edits preserve unknown YAML, comments, body and wikilinks", () => {
  const md = '---\n# keep me\ntitle: 旧标题\ncustom:\n  nested: [one, two]\n---\n# 旧标题\n\n[[B]]\n';
  const next = patchProperties(md, { title: "新标题", tags: ["数学"], description: "摘要" });
  assert.match(next, /# keep me/); assert.deepEqual((readMarkdown(next).data.custom as {nested: string[]}).nested, ["one", "two"]);
  assert.match(next, /# 新标题\n\n\[\[B\]\]\n$/);
  assert.equal(readMarkdown(next).properties.title, "新标题");
});
test("legacy conversion adds one heading and retains metadata", () => {
  const doc = makeMarkdown("A", "原始正文\n[[B]]", { description: "摘要", tags: ["tag"] });
  assert.equal(readMarkdown(doc).body, "# A\n\n原始正文\n[[B]]");
  assert.equal(makeMarkdown("A", doc), doc);
  assert.equal(readMarkdown(makeMarkdown("A", "# 原文标题\n原文段落")).body,"# A\n\n# 原文标题\n原文段落");
});
test("ambiguous titles stay unresolved; exact paths resolve", () => {
  const candidates = [{ id: "1", title: "A", path: "one/A.md" }, { id: "2", title: "A", path: "two/A.md" }];
  assert.equal(resolveReference("A", candidates), null);
  assert.equal(resolveReference("two/A", candidates)?.id, "2");
  assert.throws(() => safeDocumentPath("../settings.json"));
  assert.throws(() => safeDocumentPath("C:\\secret"));
  assert.throws(() => safeDocumentPath("raw/CON.md"));
  assert.throws(() => safeDocumentPath("raw/name. "));
});

test("agent replacement YAML retains user metadata and comments", () => {
  const next = applyLegacyPatch('---\n# user comment\ncustom: {keep: true}\n---\n# A\nold', {content:'---\ndescription: new\n---\n# A\n[[B]]'});
  assert.match(next, /# user comment/);
  assert.deepEqual(readMarkdown(next).data.custom, {keep:true});
  assert.equal(parseWikiReferences(next)[0].target, "B");
});
