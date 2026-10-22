import { parser, GFM, type MarkdownConfig } from "@lezer/markdown";
import { parseDocument } from "yaml";

/** Shared by the editor and server: code, escaped text and YAML never become links. */
export const noteSyntax: MarkdownConfig = {
  defineNodes: ["WikiLink", "Highlight", "Hashtag"],
  parseInline: [
    {
      name: "WikiLink", before: "Link",
      parse(cx, next, pos) {
        if (next !== 91 || cx.char(pos + 1) !== 91) return -1;
        const rest = cx.slice(pos + 2, cx.end);
        const end = rest.indexOf("]]");
        if (end < 1 || rest.slice(0, end).includes("\n")) return -1;
        return cx.addElement(cx.elt("WikiLink", pos, pos + end + 4));
      },
    },
    {
      name: "Highlight", before: "Emphasis",
      parse(cx, next, pos) {
        if (next !== 61 || cx.char(pos + 1) !== 61) return -1;
        const end = cx.slice(pos + 2, cx.end).indexOf("==");
        return end < 1 ? -1 : cx.addElement(cx.elt("Highlight", pos, pos + end + 4));
      },
    },
    {
      name: "Hashtag", before: "Link",
      parse(cx, next, pos) {
        if (next !== 35 || (pos > cx.offset && /[\p{L}\p{N}_]/u.test(cx.slice(pos - 1, pos)))) return -1;
        const match = cx.slice(pos, cx.end).match(/^#[\p{L}\p{N}_][\p{L}\p{N}_/-]*/u);
        return match ? cx.addElement(cx.elt("Hashtag", pos, pos + match[0].length)) : -1;
      },
    },
  ],
};

export const noteParser = parser.configure([GFM, noteSyntax]);
export type DocumentProperties = { title: string; source: string; created: string; description: string; tags: string[] };
export type WikiReference = { from: number; to: number; target: string; alias: string; heading: string };

export function splitFrontmatter(markdown: string) {
  const match = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)(?:\r?\n|$)/);
  if (!match) return { yaml: "", body: markdown, offset: 0 };
  // \u5F00\u5934\u7684 --- \u4E5F\u53EF\u80FD\u53EA\u662F Markdown \u5206\u9694\u7EBF\u3002\u53EA\u6709\u4E2D\u95F4\u786E\u5B9E\u662F YAML \u6620\u5C04\u65F6\u624D\u5F53 frontmatter\uFF0C
  // \u5426\u5219\u4FDD\u7559\u4E3A\u6B63\u6587\uFF0C\u907F\u514D\u628A `---\n\u6807\u9898\n---` \u8FD9\u7C7B\u624B\u5199\u5185\u5BB9\u6539\u5199\u574F\u3002
  const candidate = parseDocument(match[1]);
  const value: unknown = candidate.toJS({ maxAliasCount: 50 });
  const isMapping = !candidate.errors.length && (value === null || (typeof value === "object" && !Array.isArray(value)));
  if (!isMapping) return { yaml: "", body: markdown, offset: 0 };
  return { yaml: match[1], body: markdown.slice(match[0].length), offset: match[0].length };
}

export function readMarkdown(markdown: string) {
  const { yaml, body, offset } = splitFrontmatter(markdown);
  const document = parseDocument(yaml);
  if (document.errors.length) throw new Error(`属性格式有误：${document.errors[0].message}`);
  const value: unknown = document.toJS({ maxAliasCount: 50 });
  if (value !== null && (typeof value !== "object" || Array.isArray(value))) throw new Error("属性必须是 YAML 对象。");
  const data = (value ?? {}) as Record<string, unknown>;
  const heading = body.match(/^#(?!\#)\s*(.+?)\s*#*\s*$/m)?.[1] ?? "";
  const str = (key: string, fallback = "") => typeof data[key] === "string" ? data[key] as string : fallback;
  const tags = data.tags ?? data.keywords;
  return {
    body, offset, data,
    properties: {
      title: heading || str("title"), source: str("source"),
      created: str("created", str("createdAt")), description: str("description", str("summary")),
      tags: Array.isArray(tags) ? tags.filter((v): v is string => typeof v === "string") : typeof tags === "string" ? tags.split(/[,，]/).map(v => v.trim()).filter(Boolean) : [],
    } satisfies DocumentProperties,
  };
}

/** Edits the YAML AST so unknown fields and comments survive property changes. */
export function patchProperties(markdown: string, patch: Partial<DocumentProperties>) {
  const { yaml, body } = splitFrontmatter(markdown);
  let document = parseDocument(yaml);
  if (document.errors.length) throw new Error("属性格式有误，请先修复后保存。");
  if (!document.contents) {
    document = parseDocument("{}");
    const contents = document.contents as { flow?: boolean } | null;
    if (contents) contents.flow = false;
  }
  for (const [key, value] of Object.entries(patch)) document.set(key, value);
  const nextBody = patch.title !== undefined
    ? /^#(?!\#)\s*[^\n]*$/m.test(body)
      ? body.replace(/^#(?!\#)\s*[^\n]*$/m, () => `# ${patch.title}`)
      : `# ${patch.title}\n\n${body}`
    : body;
  return `---\n${document.toString()}---\n${nextBody}`;
}

export function makeMarkdown(title: string, body: string, properties: Record<string, unknown> = {}) {
  const existing = splitFrontmatter(body);
  // Existing YAML is preserved; only absent metadata is supplied on conversion.
  const parsed = readMarkdown(body);
  const firstHeading = existing.body.match(/^# ([^\n]+)/)?.[1];
  const effectiveTitle = (existing.offset && firstHeading ? firstHeading : title || firstHeading) || "未命名";
  const missing = Object.fromEntries(Object.entries({ title:effectiveTitle, ...properties }).filter(([key]) => !(key in parsed.data)));
  const withHeading = firstHeading === effectiveTitle ? body : `${existing.offset ? body.slice(0, existing.offset) : ""}# ${effectiveTitle}\n\n${existing.body}`;
  return patchProperties(withHeading, missing);
}

export function parseWikiReferences(markdown: string): WikiReference[] {
  const { body, offset } = splitFrontmatter(markdown);
  const references: WikiReference[] = [];
  noteParser.parse(body).iterate({ enter(node) {
    if (node.name !== "WikiLink") return;
    const raw = body.slice(node.from + 2, node.to - 2);
    const [destination, ...aliases] = raw.split("|");
    const hash = destination.indexOf("#");
    const target = (hash < 0 ? destination : destination.slice(0, hash)).trim();
    if (target) references.push({ from: node.from + offset, to: node.to + offset, target,
      alias: aliases.join("|").trim() || target, heading: hash < 0 ? "" : destination.slice(hash + 1) });
  } });
  return references;
}

export type LinkCandidate = { id: string; title: string | null; path?: string | null };
export function resolveReference(target: string, candidates: readonly LinkCandidate[], sourcePath?: string) {
  const normalized = target.replace(/\\/g, "/").replace(/\.md$/i, "").normalize("NFC").toLocaleLowerCase();
  const paths = candidates.filter(c => c.path?.replace(/\.md$/i, "").normalize("NFC").toLocaleLowerCase() === normalized);
  if (paths.length === 1) return paths[0];
  // Generated ids stay stable when a source moves from capture into its category.
  const basename = normalized.split("/").pop();
  if (basename && /^(raw|knowledge)_[a-f0-9-]{36}$/i.test(basename)) {
    const ids = candidates.filter(c => c.id.toLocaleLowerCase() === basename);
    if (ids.length === 1) return ids[0];
  }
  const names = candidates.filter(c => c.title?.normalize("NFC").toLocaleLowerCase() === normalized || c.id === target);
  if (names.length > 1 && sourcePath && !normalized.includes("/")) {
    const layer = (path: string) => path.replace(/\\/g, "/").split("/")[0].toLowerCase().replace(/^wilki$/, "wiki");
    const sameLayer = names.filter(c => c.path && layer(c.path) === layer(sourcePath));
    if (sameLayer.length === 1) return sameLayer[0];
  }
  return names.length === 1 ? names[0] : null;
}

export function safeDocumentPath(path: string) {
  const normalized = path.normalize("NFC").replace(/\\/g, "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.split("/").some(p => !p || p === "." || p === ".." || /[. ]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p) || /[<>:"|?*\u0000-\u001f]/.test(p))) throw new Error("笔记路径无效。");
  return /\.md$/i.test(normalized) ? normalized : `${normalized}.md`;
}
