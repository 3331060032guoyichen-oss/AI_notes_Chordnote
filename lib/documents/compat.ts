import { makeMarkdown, patchProperties, readMarkdown, splitFrontmatter } from "./markdown";

export function rawMarkdown(row: { markdown?: string | null; title: string | null; text: string }) {
  return row.markdown ?? makeMarkdown(row.title ?? "", row.text, {});
}
export function knowledgeMarkdown(row: { markdown?: string | null; title: string; content: string; summary: string; rawId: string; createdAt: Date | string; keywords: unknown; keyPoints: unknown; concepts: unknown }) {
  return row.markdown ?? makeMarkdown(row.title, row.content, { source: row.rawId,
    created: new Date(row.createdAt).toISOString().slice(0, 10), description: row.summary,
    tags: Array.isArray(row.keywords) ? row.keywords : [], keyPoints: row.keyPoints, concepts: row.concepts });
}
export function bodyWithoutTitle(markdown: string) {
  return splitFrontmatter(markdown).body.replace(/^# [^\n]*\n?/, "").replace(/^\n/, "");
}
/** Legacy partial APIs update the same canonical document, preserving unknown YAML. */
export function applyLegacyPatch(markdown: string, patch: { title?: string; summary?: string; content?: string; keywords?: string[] }) {
  let doc = markdown;
  if (patch.content !== undefined) {
    const incoming = splitFrontmatter(patch.content);
    doc = incoming.offset ? patch.content :
      `${splitFrontmatter(doc).offset ? `---\n${splitFrontmatter(doc).yaml}\n---\n` : ""}${/^# /m.test(incoming.body) ? incoming.body : `# ${readMarkdown(doc).properties.title}\n\n${incoming.body}`}`;
  }
  return patchProperties(doc, { ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.summary !== undefined ? { description: patch.summary } : {}),
    ...(patch.keywords !== undefined ? { tags: patch.keywords } : {}) });
}
