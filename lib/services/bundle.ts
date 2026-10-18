import { and, desc, eq } from "drizzle-orm";

import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { links, noteRevisions, notes, rawNotes } from "../db/schema";
import { createOrReviveLink, listLinks } from "./links";
import { listArchivedNotes, listNotes, promoteFromSource, updateNote, setNoteArchived } from "./notes";
import { createSource, listArchivedSources, listSources, updateSource, archiveSource } from "./sources";
import { rawMarkdown, knowledgeMarkdown } from "../documents/compat";
import { safeDocumentPath } from "../documents/markdown";
import { createZip, type ZipEntry } from "../zip";

// 知识包（Bundle）—— "数据是你的"这条承诺的兑现方式。
//
// 为什么以 title 作为可移植的键：`id` 是 build-local 的（`raw_<uuid>` 由本机生成），
// 换一台机器、换一个库就失去意义；title 是用户自己认得的名字，跨实例能对上。
// 代价是同名冲突只能"保留已有、跳过导入"，这一点在返回值里明说，不静默覆盖。
//
// 导入**不重建修订历史**：修订记录里的版本号与写入者都是当时的事实，事后补造等于伪造审计。
// 导出仍然带上它，是为了让人拿到完整快照去归档或迁库。

export const BUNDLE_FORMAT = "chordnote.bundle";
export const BUNDLE_VERSION = 2;

export type BundleSource = {
  markdown?: string; path?: string; id?: string;
  title: string | null;
  text: string;
  createdAt: string;
  archived: boolean;
};

export type BundleNote = {
  markdown?: string; path?: string; id?: string; sourceId?: string; archived?: boolean;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  concepts: string[];
  keywords: string[];
  /** 这张知识页对应的原始记录标题，导入时据此找回或补建原始记录。 */
  sourceTitle: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BundleLink = {
  from: string;
  to: string;
  reason: string;
  type: string;
};

export type BundleRevision = {
  markdown?: string | null; path?: string | null;
  noteTitle: string;
  version: number;
  title: string;
  summary: string;
  content: string;
  createdAt: string;
};

export type KnowledgeBundle = {
  format: typeof BUNDLE_FORMAT;
  version: number;
  exportedAt: string;
  counts: { sources: number; notes: number; links: number; revisions: number };
  sources: BundleSource[];
  notes: BundleNote[];
  links: BundleLink[];
  revisions: BundleRevision[];
};

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

/**
 * 导出整库。
 *
 * 有意**包含已归档的原始记录与知识页** —— 归档是"我不想在日常里看到它"，不是"它不是我的数据"。
 * 导出少给一部分，这份快照就不足以用来恢复，那"可带走"就是假的。
 */
export async function exportBundle(): Promise<KnowledgeBundle> {
  const { db } = await getDb();
  const { userId } = getUserContext();

  const [rawRows, noteRows, linkRows, revisionRows] = await Promise.all([
    db
      .select()
      .from(rawNotes)
      .where(eq(rawNotes.userId, userId))
      .orderBy(desc(rawNotes.createdAt)),
    db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.updatedAt)),
    listLinks(),
    db
      .select()
      .from(noteRevisions)
      .where(eq(noteRevisions.userId, userId))
      .orderBy(desc(noteRevisions.createdAt)),
  ]);

  const titleById = new Map(noteRows.map((row) => [row.id, row.title]));
  const rawTitleById = new Map(rawRows.map((row) => [row.id, row.title]));

  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    counts: {
      sources: rawRows.length,
      notes: noteRows.length,
      links: linkRows.length,
      revisions: revisionRows.length,
    },
    sources: rawRows.map((row) => ({
      id: row.id, markdown: rawMarkdown(row), path: row.path ?? `raw/articles/${row.id}.md`,
      title: row.title,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      archived: row.archivedAt !== null,
    })),
    notes: noteRows.map((row) => ({
      id: row.id, sourceId: row.rawId, markdown: knowledgeMarkdown(row), path: row.path ?? `wilki/concept/${row.id}.md`, archived: row.archivedAt !== null,
      title: row.title,
      summary: row.summary,
      content: row.content,
      keyPoints: toStringArray(row.keyPoints),
      concepts: toStringArray(row.concepts),
      keywords: toStringArray(row.keywords),
      sourceTitle: rawTitleById.get(row.rawId) ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
    links: linkRows.map((row) => ({
      from: titleById.get(row.sourceId) ?? row.sourceId,
      to: titleById.get(row.targetId) ?? row.targetId,
      reason: row.reason,
      type: row.type,
    })),
    revisions: revisionRows.map((row) => ({
      markdown: row.markdown, path: row.path,
      noteTitle: titleById.get(row.noteId) ?? row.noteId,
      version: row.version,
      title: row.title,
      summary: row.summary,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * markdown 知识包 —— GLOSSARY 里定义的那种形态：纯 markdown + YAML frontmatter，
 * 任何读 markdown 的工具（Obsidian、VS Code、Hugo…）都能直接消费，不需要本应用在场。
 *
 * 与 JSON 导出的分工：JSON 是"导回来用"的完整快照（含修订历史与 id），
 * markdown 是"拿出去读/迁移"的可读形态（不含修订历史 —— 那是审计记录，不是正文）。
 */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function yamlList(label: string, values: string[]): string {
  if (values.length === 0) return `${label}: []`;
  return `${label}:\n${values.map((value) => `  - ${yamlString(value)}`).join("\n")}`;
}

/** 文件名安全化：去掉路径分隔符与 Windows 非法字符，压掉多余空白，限制长度，重名加序号。 */
function safeFileName(title: string, fallback: string, used: Set<string>): string {
  const base =
    title
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60) || fallback;

  let name = base;
  let counter = 2;
  while (used.has(name)) {
    name = `${base} (${counter})`;
    counter += 1;
  }
  used.add(name);
  return name;
}

export async function exportMarkdownBundle(): Promise<{ file: Buffer; fileName: string }> {
  const bundle = await exportBundle();
  const entries: ZipEntry[] = [];
  const usedNoteNames = new Set<string>();
  const usedSourceNames = new Set<string>();

  const outlinks = new Map<string, { to: string; reason: string }[]>();
  const backlinks = new Map<string, { from: string; reason: string }[]>();
  for (const link of bundle.links) {
    outlinks.set(link.from, [...(outlinks.get(link.from) ?? []), { to: link.to, reason: link.reason }]);
    backlinks.set(link.to, [...(backlinks.get(link.to) ?? []), { from: link.from, reason: link.reason }]);
  }

  const notePaths = new Map<string, string>();
  for (const note of bundle.notes) {
    const path = note.path ? safeDocumentPath(note.path) : `notes/${safeFileName(note.title, "未命名知识页", usedNoteNames)}.md`;
    if (note.markdown !== undefined) { entries.push({ name: path, content: note.markdown }); notePaths.set(note.title, path); continue; }
    notePaths.set(note.title, path);

    const out = outlinks.get(note.title) ?? [];
    const back = backlinks.get(note.title) ?? [];
    const frontmatter = [
      "---",
      `title: ${yamlString(note.title)}`,
      `summary: ${yamlString(note.summary)}`,
      `source: ${note.sourceTitle ? yamlString(note.sourceTitle) : "null"}`,
      `createdAt: ${note.createdAt}`,
      `updatedAt: ${note.updatedAt}`,
      yamlList("concepts", note.concepts),
      yamlList("keywords", note.keywords),
      yamlList("keyPoints", note.keyPoints),
      out.length > 0
        ? `links:\n${out.map((item) => `  - to: ${yamlString(item.to)}\n    reason: ${yamlString(item.reason)}`).join("\n")}`
        : "links: []",
      back.length > 0
        ? `backlinks:\n${back.map((item) => `  - from: ${yamlString(item.from)}\n    reason: ${yamlString(item.reason)}`).join("\n")}`
        : "backlinks: []",
      "---",
      "",
    ].join("\n");

    entries.push({ name: path, content: `${frontmatter}\n${note.content.trim()}\n` });
  }

  for (const source of bundle.sources) {
    const label = source.title?.trim() || source.text.trim().slice(0, 24) || "未命名原始记录";
    const path = source.path ? safeDocumentPath(source.path) : `sources/${safeFileName(label, "未命名原始记录", usedSourceNames)}.md`;
    if (source.markdown !== undefined) { entries.push({ name: path, content: source.markdown }); continue; }
    const frontmatter = [
      "---",
      `title: ${yamlString(label)}`,
      `createdAt: ${source.createdAt}`,
      `archived: ${source.archived ? "true" : "false"}`,
      "---",
      "",
    ].join("\n");

    entries.push({ name: path, content: `${frontmatter}\n${source.text.trim()}\n` });
  }

  const index = [
    "# Chordnote 知识包",
    "",
    `导出时间：${bundle.exportedAt}`,
    `内容：${bundle.counts.sources} 条原始记录 · ${bundle.counts.notes} 张知识页 · ${bundle.counts.links} 条关联`,
    "",
    "> 这是纯 markdown 快照：每一张知识页在 `notes/`，每一条原始记录在 `sources/`，",
    "> YAML frontmatter 里带着概念、关键词、出处与双向链接。任何读 markdown 的工具都能打开，",
    "> 不需要 Chordnote。修订历史不在这里 —— 那是审计记录，需要完整快照请导出 JSON。",
    "",
    "## 知识页",
    "",
    ...bundle.notes.map((note) => `- [${note.title}](${encodeURI(notePaths.get(note.title) as string)})`),
    "",
    "## 原始记录",
    "",
    ...bundle.sources.map((source) => {
      const label = source.title?.trim() || source.text.trim().slice(0, 24) || "未命名原始记录";
      return `- ${label}${source.archived ? "（已归档）" : ""}`;
    }),
    "",
  ].join("\n");

  entries.unshift({ name: "README.md", content: index });

  const stamp = bundle.exportedAt.slice(0, 10);
  return { file: createZip(entries), fileName: `chordnote-bundle-${stamp}.zip` };
}

export type ImportPlan = {
  /** true = 只算数不写库，让用户先看清会发生什么。 */
  dryRun: boolean;
};

export type ImportResult = {
  sources: { created: number; skipped: number };
  notes: { created: number; skipped: number };
  links: { created: number; skipped: number };
  problems: string[];
};

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * 导入知识包。
 *
 * 规则（都写在这里，因为"合并策略"是最容易事后扯不清的地方）：
 *   1. 同名原始记录/知识页**保留已有、跳过导入**，不覆盖 —— 导入永远不破坏当前内容。
 *      原始记录没有标题时按**正文**判重（课堂随手记大多没标题，只按标题判重会让重导翻倍）；
 *   2. 知识页需要原始记录（`notes.raw_id` NOT NULL）：先按 sourceTitle 找回，
 *      找不到就用该页的正文补建一条，保证导入不会因为缺出处而失败；
 *   3. 关联按两端标题解析，任一端缺失就记进 problems，不猜。
 */
export async function importBundle(
  payload: unknown,
  plan: ImportPlan = { dryRun: false },
): Promise<ImportResult> {
  const result: ImportResult = {
    sources: { created: 0, skipped: 0 },
    notes: { created: 0, skipped: 0 },
    links: { created: 0, skipped: 0 },
    problems: [],
  };

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("知识包内容无法识别。");
  }

  const bundle = payload as Partial<KnowledgeBundle>;

  if (bundle.format !== BUNDLE_FORMAT) {
    throw new Error("这不是 Chordnote 的知识包（format 不匹配）。");
  }

  if (typeof bundle.version !== "number" || bundle.version > BUNDLE_VERSION) {
    throw new Error("知识包的版本比当前应用更新，请先升级应用再导入。");
  }

  const incomingSources = Array.isArray(bundle.sources) ? bundle.sources : [];
  const incomingNotes = Array.isArray(bundle.notes) ? bundle.notes : [];
  const incomingLinks = Array.isArray(bundle.links) ? bundle.links : [];

  /**
   * 判重要连**已归档的**一起看。
   *
   * 导出包含已归档内容（归档是"我不想在日常里看到它"，不是"它不是我的数据"），
   * 只看未归档那一份，重导自己的包就会把已归档的原话/知识页当成新的再建一遍。
   */
  const existingSources = [...(await listSources()), ...(await listArchivedSources())];
  const sourceTitleSet = new Set(
    existingSources.map((source) => source.title?.trim()).filter((title): title is string => Boolean(title)),
  );
  /**
   * 没有标题的原始记录只能按正文去重。
   *
   * 这是实测出来的：课堂随手记大多没有标题，导出再导入时会因为"没有标题可比"
   * 被整批重新创建 —— 自己导出的包再导回来反而让原始记录翻倍，"可带走"就成了半句话。
   * 正文完全一样视为同一条，与"同名跳过"是同一个口径。
   */
  const existingUntitledTexts = new Set(
    existingSources.filter((source) => !source.title?.trim()).map((source) => source.text.trim()),
  );
  const sourceByTitle = new Map(
    existingSources
      .filter((source) => source.title)
      .map((source) => [source.title as string, source]),
  );

  for (const source of incomingSources) {
    const title = typeof source?.title === "string" ? source.title.trim() : "";
    const text = asString(source?.text);

    if (!text.trim()) {
      result.problems.push("有一条原始记录没有正文，已跳过。");
      continue;
    }

    if (title ? sourceTitleSet.has(title) : existingUntitledTexts.has(text.trim())) {
      result.sources.skipped += 1;
      continue;
    }

    if (plan.dryRun) {
      result.sources.created += 1;
      if (title) sourceTitleSet.add(title);
      else existingUntitledTexts.add(text.trim());
      continue;
    }

    const created = await createSource(text, title || null);
    if (typeof source.markdown === "string") await updateSource(created.id, text, { markdown: source.markdown, path: typeof source.path === "string" ? safeDocumentPath(source.path) : undefined });
    if (source.archived === true) await archiveSource(created.id);
    result.sources.created += 1;
    if (title) {
      sourceTitleSet.add(title);
      sourceByTitle.set(title, created);
    } else {
      existingUntitledTexts.add(text.trim());
    }
  }

  /** 同上：已归档的知识页也要参与判重，否则导入会把它们重新建一遍。 */
  const existingNotes = [...(await listNotes()), ...(await listArchivedNotes())];
  const noteTitleSet = new Set(existingNotes.map((note) => note.title));
  const noteByTitle = new Map(existingNotes.map((note) => [note.title, note]));

  for (const note of incomingNotes) {
    const title = asString(note?.title).trim();
    const content = asString(note?.content);

    if (!title || !content.trim()) {
      result.problems.push("有一条知识页缺少标题或正文，已跳过。");
      continue;
    }

    if (noteTitleSet.has(title)) {
      result.notes.skipped += 1;
      continue;
    }

    if (plan.dryRun) {
      result.notes.created += 1;
      noteTitleSet.add(title);
      continue;
    }

    // 知识页必须挂在一条原始记录上：优先按出处标题找回，找不到就用正文补建。
    const sourceTitle = asString(note?.sourceTitle).trim();
    let source = sourceTitle ? sourceByTitle.get(sourceTitle) : undefined;

    if (!source) {
      source = await createSource(content, sourceTitle || title);
      if (sourceTitle) {
        sourceTitleSet.add(sourceTitle);
        sourceByTitle.set(sourceTitle, source);
      }
    }

    const promoted = await promoteFromSource({
      rawId: source.id,
      title,
      summary: asString(note?.summary, "（导入的知识页未带摘要）") || "（导入的知识页未带摘要）",
      content,
      keyPoints: toStringArray(note?.keyPoints),
      concepts: toStringArray(note?.concepts),
      keywords: toStringArray(note?.keywords),
      origin: "user",
    });

    if (promoted.created && typeof note.markdown === "string") await updateNote(promoted.knowledge.id, { markdown: note.markdown, ...(typeof note.path === "string" ? { path: safeDocumentPath(note.path) } : {}) });
    if (promoted.created && note.archived === true) await setNoteArchived(promoted.knowledge.id, true);
    if (promoted.created) {
      result.notes.created += 1;
      noteTitleSet.add(title);
      noteByTitle.set(title, promoted.knowledge);
    } else {
      result.notes.skipped += 1;
    }
  }

  const existingLinkKeys = new Set((await listLinks()).map((link) => `${link.sourceId}→${link.targetId}`));

  for (const link of incomingLinks) {
    const from = asString(link?.from).trim();
    const to = asString(link?.to).trim();
    const source = noteByTitle.get(from);
    const target = noteByTitle.get(to);

    if (!source || !target) {
      result.problems.push(`关联「${from} → ${to}」找不到两端知识页，已跳过。`);
      continue;
    }

    if (source.id === target.id || existingLinkKeys.has(`${source.id}→${target.id}`) || existingLinkKeys.has(`${target.id}→${source.id}`)) {
      result.links.skipped += 1;
      continue;
    }

    if (plan.dryRun) {
      result.links.created += 1;
      continue;
    }

    await createOrReviveLink({
      sourceId: source.id,
      targetId: target.id,
      reason: asString(link?.reason, "导入的知识包关联") || "导入的知识包关联",
    });
    existingLinkKeys.add(`${source.id}→${target.id}`);
    result.links.created += 1;
  }

  return result;
}
