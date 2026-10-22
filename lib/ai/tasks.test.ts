import assert from "node:assert/strict";
import test from "node:test";

import { isOrganizeDraft, parseOrganizeDraft } from "./tasks";

test("整理稿必须明确给出有效的 Raw 和 Wiki 分类", () => {
  const draft = {
    title: "单一来源摘要",
    summary: "摘要",
    content: "# 单一来源摘要\n\n正文",
    rawCategory: "papers",
    wikiCategory: "sources",
    keyPoints: [],
    concepts: [],
    keywords: [],
    relatedKnowledge: [],
  };

  assert.equal(isOrganizeDraft(draft), true);
  assert.deepEqual(parseOrganizeDraft(JSON.stringify(draft)), draft);
  assert.equal(isOrganizeDraft({ ...draft, wikiCategory: undefined }), false);
  assert.equal(isOrganizeDraft({ ...draft, rawCategory: undefined }), false);
  assert.equal(isOrganizeDraft({ ...draft, wikiCategory: "misc" }), false);
  assert.equal(isOrganizeDraft({ ...draft, title: "---" }), false);
  assert.equal(isOrganizeDraft({ ...draft, title: "#" }), false);
  assert.throws(() => parseOrganizeDraft(JSON.stringify({ ...draft, wikiCategory: undefined })), /valid Raw and Wiki categories/);
});
