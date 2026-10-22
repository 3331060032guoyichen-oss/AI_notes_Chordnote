import { documentReferences } from "./documents";
import { listLinks } from "./links";
import { listArchivedNotes, listNotes } from "./notes";
import { readMarkdown } from "../documents/markdown";
import { isRawCategory, isWikiCategory } from "../documents/structure";

/**
 * 知识库体检：只读、可重复、不改任何内容。
 *
 * 只做「代码能判定」的检查：Schema 里凡是能被程序验证的写法（标题、分类、断链、
 * 双向链接、来源归宿）都变成一条规则；需要判断力的部分（矛盾、陈旧结论）不在这里
 * 假装有结论，留给模型并标注"待人工核实"。
 */
export type WikiHealthIssue = { id: string; title: string; path: string; detail: string };
export type WikiHealthRule = { rule: string; label: string; severity: "info" | "warn"; total: number; issues: WikiHealthIssue[] };

export type WikiHealth = {
  generatedAt: string;
  totals: { knowledge: number; archivedKnowledge: number; raw: number; links: number; references: number };
  categories: Record<string, number>;
  rules: WikiHealthRule[];
  summary: { warn: number; info: number; passed: number };
};

/** 单个规则最多回传多少条明细：报告是给人看的，不是导出。 */
const MAX_ISSUES = 50;

const normalizeTitle = (title: string) => title.normalize("NFC").toLocaleLowerCase().trim();
const categoryOf = (path: string) => path.replace(/\\/g, "/").split("/")[1] ?? "未分类";

function rule(name: string, label: string, severity: "info" | "warn", issues: WikiHealthIssue[]): WikiHealthRule {
  return { rule: name, label, severity, total: issues.length, issues: issues.slice(0, MAX_ISSUES) };
}

export async function wikiHealth(): Promise<WikiHealth> {
  const [notes, archived, { documents, references }, links] = await Promise.all([
    listNotes(), listArchivedNotes(), documentReferences(), listLinks(),
  ]);

  const knowledge = documents.filter(doc => doc.kind === "knowledge");
  const raws = documents.filter(doc => doc.kind === "raw");
  const byId = new Map(documents.map(doc => [doc.id, doc]));
  const issue = (id: string, detail: string): WikiHealthIssue => {
    const doc = byId.get(id);
    return { id, title: doc?.title ?? id, path: doc?.path ?? id, detail };
  };

  const linked = new Set(links.flatMap(link => [link.sourceId, link.targetId]));
  const resolved = references.filter(ref => ref.targetId && ref.targetId !== ref.sourceId);
  const pairs = new Set(resolved.map(ref => `${ref.sourceId}>${ref.targetId}`));
  const incoming = new Set(resolved.map(ref => ref.targetId!));
  const outgoing = new Set(resolved.map(ref => ref.sourceId));

  const missingTitle: WikiHealthIssue[] = [];
  const brokenFrontmatter: WikiHealthIssue[] = [];
  for (const doc of documents) {
    try {
      if (!readMarkdown(doc.markdown ?? "").properties.title.trim()) {
        missingTitle.push(issue(doc.id, "没有一级标题，也没有 title 属性"));
      }
    } catch (error) {
      brokenFrontmatter.push(issue(doc.id, error instanceof Error ? error.message : "YAML 无法解析"));
    }
  }

  const invalidCategory: WikiHealthIssue[] = [];
  for (const note of knowledge) {
    const folder = (note.path ?? "").replace(/\\/g, "/").split("/")[1];
    if (!folder || !isWikiCategory(folder)) invalidCategory.push(issue(note.id, `Wiki 分类「${folder ?? "无"}」不在允许列表`));
  }
  for (const raw of raws) {
    const folder = (raw.path ?? "").replace(/\\/g, "/").split("/")[1];
    if (folder && !folder.endsWith(".md") && !isRawCategory(folder)) invalidCategory.push(issue(raw.id, `Raw 分类「${folder}」不在允许列表`));
  }

  const deadLinks = references
    .filter(ref => !ref.targetId)
    .map(ref => issue(ref.sourceId, `指向 [[${ref.target}]] 的链接没有目标`));

  const titles = new Map<string, string[]>();
  for (const note of notes) {
    const key = normalizeTitle(note.title);
    titles.set(key, [...(titles.get(key) ?? []), note.id]);
  }
  const duplicateTitles = [...titles.values()]
    .filter(ids => ids.length > 1)
    .map(ids => issue(ids[0], `同名 ${ids.length} 篇：${ids.map(id => byId.get(id)?.path ?? id).join("、")}`));

  const oneWayLinks = resolved
    .filter(ref => !pairs.has(`${ref.targetId}>${ref.sourceId}`))
    .map(ref => issue(ref.sourceId, `→ ${byId.get(ref.targetId!)?.path ?? ref.targetId} 没有回链`));

  const orphans = knowledge
    .filter(doc => !incoming.has(doc.id) && !outgoing.has(doc.id) && !linked.has(doc.id))
    .map(doc => issue(doc.id, "没有出链、没有入链，也没有正式关系"));

  const withoutLinks = knowledge
    .filter(doc => !outgoing.has(doc.id) && !linked.has(doc.id))
    .map(doc => issue(doc.id, "没有任何出链或正式关系"));

  const stalePages = notes
    .filter(note => note.staleAfter && Date.parse(note.staleAfter) < Date.now())
    .map(note => issue(note.id, `超过保鲜期（${note.staleAfter!.slice(0, 10)}）`));

  const organized = new Set([...notes, ...archived].flatMap(note => note.sourceRawIds));
  const unorganized = raws
    .filter(doc => !organized.has(doc.id))
    .map(doc => issue(doc.id, "还没有被任何知识页引用为来源"));

  const categories: Record<string, number> = {};
  for (const note of notes) {
    const category = categoryOf(note.path ?? "");
    categories[category] = (categories[category] ?? 0) + 1;
  }

  const rules = [
    rule("broken-frontmatter", "属性无法解析", "warn", brokenFrontmatter),
    rule("missing-title", "缺少标题", "warn", missingTitle),
    rule("invalid-category", "分类不在允许列表", "warn", invalidCategory),
    rule("dead-link", "断链", "warn", deadLinks),
    rule("duplicate-title", "同名页面", "warn", duplicateTitles),
    rule("one-way-link", "单向链接", "info", oneWayLinks),
    rule("orphan-page", "孤立页", "info", orphans),
    rule("page-without-links", "没有任何连接", "info", withoutLinks),
    rule("stale-page", "超过保鲜期", "info", stalePages),
    rule("unorganized-source", "未整理来源", "info", unorganized),
  ];

  return {
    generatedAt: new Date().toISOString(),
    totals: { knowledge: notes.length, archivedKnowledge: archived.length, raw: raws.length, links: links.length, references: references.length },
    categories,
    rules,
    summary: {
      warn: rules.filter(item => item.severity === "warn" && item.total > 0).length,
      info: rules.filter(item => item.severity === "info" && item.total > 0).length,
      passed: rules.filter(item => item.total === 0).length,
    },
  };
}
