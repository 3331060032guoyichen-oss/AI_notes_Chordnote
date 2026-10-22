import { desc,eq } from "drizzle-orm";

import type { Raw } from "../../types/raw";
import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { noteRevisions,notes,noteSources,rawNotes } from "../db/schema";
import { rawCategory } from "../documents/structure";
import { knowledgeMarkdown,rawMarkdown } from "../documents/compat";
import { parseWikiReferences,patchProperties,readMarkdown,safeDocumentPath } from "../documents/markdown";
import { createZip,type ZipEntry } from "../zip";
import { readCanvas,saveCanvas,validCanvas,type CanvasDocument } from "./canvases";
import { createOrReviveLink,listLinks } from "./links";
import { attachSourcesToNote,listArchivedNotes,listNotes,promoteFromSource,setNoteArchived,updateNote } from "./notes";
import { archiveSource,createSource,listArchivedSources,listSources,updateSource } from "./sources";

// 知识包（Bundle）—— "数据是你的"这条承诺的兑现方式。
//
// v1 使用标题判重；v2 使用路径、来源 id 和关系端点映射，允许不同路径同名。
// 历史说明：为什么以 title 作为可移植的键：`id` 是 build-local 的（`raw_<uuid>` 由本机生成），
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
  markdown?: string; path?: string; id?: string; sourceId?: string; sourceIds?: string[]; archived?: boolean;
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
  fromId?: string; toId?: string;
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
  canvases?: {title:string; document:CanvasDocument}[];
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

  const [rawRows, noteRows, sourceRows, linkRows, revisionRows] = await Promise.all([
    db
      .select()
      .from(rawNotes)
      .where(eq(rawNotes.userId, userId))
      .orderBy(desc(rawNotes.createdAt)),
    db.select().from(notes).where(eq(notes.userId, userId)).orderBy(desc(notes.updatedAt)),
    db.select({ noteId: noteSources.noteId, rawId: noteSources.rawId }).from(noteSources).where(eq(noteSources.userId, userId)),
    listLinks(),
    db
      .select()
      .from(noteRevisions)
      .where(eq(noteRevisions.userId, userId))
      .orderBy(desc(noteRevisions.createdAt)),
  ]);

  const canvas = await readCanvas();
  const titleById = new Map(noteRows.map((row) => [row.id, row.title]));
  const rawTitleById = new Map(rawRows.map((row) => [row.id, row.title]));
  const sourceIdsByNote = new Map<string, string[]>();
  for (const row of sourceRows) sourceIdsByNote.set(row.noteId, [...(sourceIdsByNote.get(row.noteId) ?? []), row.rawId]);

  return {
    format: BUNDLE_FORMAT,
    version: BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    canvases: canvas ? [{title:canvas.title,document:canvas.document as CanvasDocument}] : [],
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
      id: row.id, sourceId: row.rawId, sourceIds: [...new Set([row.rawId, ...(sourceIdsByNote.get(row.id) ?? [])])], markdown: knowledgeMarkdown(row), path: row.path ?? `wilki/concept/${row.id}.md`, archived: row.archivedAt !== null,
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
      fromId:row.sourceId,toId:row.targetId,
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
  const existingSources = [...await listSources(), ...await listArchivedSources()];
  const existingNotes = [...await listNotes(), ...await listArchivedNotes()];
  const sourceMap = new Map<string, string>();
  const noteMap = new Map<string, string>();
  const sourcesByTitle = new Map(existingSources.map(s=>[s.title,s.id]));
  const sourcesById = new Map(existingSources.map(source => [source.id, source]));
  const notesByTitle = new Map(existingNotes.map(n=>[n.title,n.id]));
  const paths = new Map([...existingSources.map(s=>({id:s.id,path:s.path,kind:"raw"})),...existingNotes.map(n=>({id:n.id,path:n.path,kind:"knowledge"}))].filter(d=>d.path).map(d=>[d.path!.toLowerCase(),d]));
  const importedNotes: {id:string;markdown:string}[]=[];
  function validateDocument(item: {path?:string;markdown?:string}) {
    if(item.path) safeDocumentPath(item.path);
    if(item.markdown !== undefined) readMarkdown(item.markdown);
  }
  // Validate all canonical documents before creating anything.
  for (const item of [...incomingSources,...incomingNotes]) validateDocument(item);
  for (const source of incomingSources) {
    const title=asString(source?.title).trim(), text=asString(source?.text);
    if(!text.trim()){result.problems.push("有一条原始记录没有正文，已跳过。");continue;}
    const path=source.path ? safeDocumentPath(source.path) : undefined;
    const byPath=path ? paths.get(path.toLowerCase()) : undefined;
    const existing=byPath?.kind === "raw" ? byPath.id : path && bundle.version === 2 ? undefined : title ? sourcesByTitle.get(title) : existingSources.find(s=>!s.title && s.text.trim()===text.trim())?.id;
    if (byPath && byPath.kind !== "raw") {result.problems.push("原始记录路径被知识页占用："+path);result.sources.skipped++;continue;}
    if(existing){if(source.id)sourceMap.set(source.id,existing);result.sources.skipped++;continue;}
    const created=plan.dryRun ? {id:"planned-raw-"+result.sources.created} : await createSource(text,title||null);
    if(!plan.dryRun && typeof source.markdown === "string") await updateSource(created.id,text,{markdown:source.markdown,path});
    if(!plan.dryRun && source.archived===true) await archiveSource(created.id);
    if(!plan.dryRun) { const createdRaw = created as Raw; sourcesById.set(createdRaw.id, { ...createdRaw, path: path ?? createdRaw.path }); }
    if(source.id)sourceMap.set(source.id,created.id);
    sourcesByTitle.set(title,created.id);
    if(path)paths.set(path.toLowerCase(),{id:created.id,path,kind:"raw"});
    result.sources.created++;
  }
  for(const note of incomingNotes){
    const title=asString(note?.title).trim(),content=asString(note?.content);
    if(!title||!content.trim()){result.problems.push("有一条知识页缺少标题或正文，已跳过。");continue;}
    const path=note.path ? safeDocumentPath(note.path) : undefined;
    const byPath=path ? paths.get(path.toLowerCase()) : undefined;
    const existing=byPath?.kind === "knowledge" ? byPath.id : path && bundle.version===2 ? undefined : notesByTitle.get(title);
    if(byPath && byPath.kind!=="knowledge"){result.problems.push("知识页路径被原始记录占用："+path);result.notes.skipped++;continue;}
    if(existing){if(note.id)noteMap.set(note.id,existing);result.notes.skipped++;continue;}
    let sourceId=note.sourceId ? sourceMap.get(note.sourceId) : undefined;
    if(!sourceId)sourceId=sourcesByTitle.get(asString(note.sourceTitle));
    if(!sourceId && !plan.dryRun){sourceId=(await createSource(content,asString(note.sourceTitle)||title)).id;result.sources.created++;}
    const promoted=plan.dryRun ? {created:true,knowledge:{id:"planned-note-"+result.notes.created}} : await promoteFromSource({rawId:sourceId!,title,summary:asString(note.summary)||"（导入的知识页未带摘要）",content,keyPoints:toStringArray(note.keyPoints),concepts:toStringArray(note.concepts),keywords:toStringArray(note.keywords),origin:"user"});
    if (!plan.dryRun && Array.isArray(note.sourceIds)) {
      const attachments = [...new Set(note.sourceIds.map(id => sourceMap.get(id)).filter((id): id is string => Boolean(id)))]
        .filter(id => id !== sourceId)
        .flatMap(id => {
          const source = sourcesById.get(id);
          return source ? [{ rawId: id, rawCategory: rawCategory(source.path) }] : [];
        });
      if (attachments.length) await attachSourcesToNote(promoted.knowledge.id, attachments);
    }
    if(promoted.created){
      if(!plan.dryRun && note.markdown !== undefined){
        let markdown=note.markdown;
        const oldSource=readMarkdown(markdown).properties.source;
        if(sourceMap.has(oldSource))markdown=patchProperties(markdown,{source:sourceMap.get(oldSource)!});
        await updateNote(promoted.knowledge.id,{markdown,...(path?{path}:{})});
        importedNotes.push({id:promoted.knowledge.id,markdown});
      }
      if(!plan.dryRun && note.archived===true)await setNoteArchived(promoted.knowledge.id,true);
      result.notes.created++;
    }else result.notes.skipped++;
    if(note.id)noteMap.set(note.id,promoted.knowledge.id);
    notesByTitle.set(title,promoted.knowledge.id);
    if(path)paths.set(path.toLowerCase(),{id:promoted.knowledge.id,path,kind:"knowledge"});
  }
  if(!plan.dryRun){
    const ids=new Map([...sourceMap,...noteMap]);
    for(const item of importedNotes){
      let markdown=item.markdown;
      for(const ref of parseWikiReferences(markdown).reverse()){
        const mapped=ids.get(ref.target);
        if(mapped)markdown=markdown.slice(0,ref.from+2)+mapped+markdown.slice(ref.from+2+ref.target.length);
      }
      if(markdown!==item.markdown)await updateNote(item.id,{markdown});
    }
  }
  const existingLinkKeys=new Set((await listLinks()).map(l=>[l.sourceId,l.targetId].sort().join("→")));
  for(const link of incomingLinks){
    const from=link.fromId ? noteMap.get(link.fromId) : notesByTitle.get(link.from);
    const to=link.toId ? noteMap.get(link.toId) : notesByTitle.get(link.to);
    if(!from||!to){result.problems.push("关联找不到两端知识页："+link.from+" → "+link.to);continue;}
    const key=[from,to].sort().join("→");
    if(from===to||existingLinkKeys.has(key)){result.links.skipped++;continue;}
    if(!plan.dryRun)await createOrReviveLink({sourceId:from,targetId:to,reason:asString(link.reason)||"导入的知识包关联"});
    existingLinkKeys.add(key);result.links.created++;
  }
  if(bundle.canvases?.length){
    const incoming=bundle.canvases[0].document;
    if(!validCanvas(incoming))result.problems.push("白板格式无效，已跳过。");
    else if((await readCanvas())?.document)result.problems.push("已有白板保留；导入白板已跳过。");
    else if(!plan.dryRun)await saveCanvas({...incoming,cards:incoming.cards.map(c=>({...c,...(c.noteId?{noteId:noteMap.get(c.noteId)??sourceMap.get(c.noteId)??c.noteId}:{})}))},0);
  }
  return result;
}
