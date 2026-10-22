import { rawCategory, wikiCategory } from "../documents/structure";

/** Conservative UTF-8 byte budget: a byte is an upper bound for byte-tokenizers.
 * This intentionally overcounts Chinese text instead of risking an overflowing request.
 */
export const MESSAGE_BUDGET = 8_000;
export const HISTORY_BUDGET = 32_000;
export function contextBudget() {
  const value = Number(process.env.CHORDNOTE_CONTEXT_TOKEN_BUDGET ?? 65_536);
  return Number.isInteger(value) && value >= 16_384 && value <= 262_144 ? value : 65_536;
}
export const estimateTokens = (text: string) => new TextEncoder().encode(text).length;
export function clipContext(text: string, budget: number): string {
  if (estimateTokens(text) <= budget) return text;
  const suffix = "\n[内容已截断]";
  let output = "", size = estimateTokens(suffix);
  for (const char of text) {
    size += estimateTokens(char);
    if (size > budget) break;
    output += char;
  }
  return output + suffix;
}

export type ContextDocument = { id: string; path: string; title: string; content: string; kind?: "raw" | "knowledge"; organized?: boolean };

const INDEX_BUDGET = 6_000;
const INDEX_PER_CATEGORY = 6;

function documentKind(doc: ContextDocument): "raw" | "knowledge" {
  return doc.kind ?? (doc.path.replace(/\\/g, "/").split("/")[0].toLowerCase() === "raw" ? "raw" : "knowledge");
}

/**
 * 两层索引：先给分类计数，再列每类最近几页。
 *
 * 平铺 JSON 每行要重复六个键名，还没列到一半就被预算截断；分类结构让 agent
 * 先看到"库里有什么"，再决定是 search 还是直接 read。每页仍然带 id 和路径——
 * 工具调用只认 id。
 */
export function buildIndex(documents: ContextDocument[]): string {
  const wiki = documents.filter(doc => documentKind(doc) === "knowledge");
  const raws = documents.filter(doc => documentKind(doc) === "raw");
  const unorganized = raws.filter(doc => doc.organized === false);
  const organized = raws.filter(doc => doc.organized !== false);
  const lines = ["知识索引（导航入口：先看分类与标题，再 search_notes 检索，最后 read_note/read_raw 通读）"];

  lines.push(`Wiki 共 ${wiki.length} 页；每类最多列 ${INDEX_PER_CATEGORY} 页，其余用 search_notes 查。`);
  const wikiGroups = new Map<string, ContextDocument[]>();
  for (const doc of wiki) {
    const category = wikiCategory(doc.path);
    wikiGroups.set(category, [...(wikiGroups.get(category) ?? []), doc]);
  }
  for (const [category, docs] of wikiGroups) {
    lines.push(`${category}（${docs.length}）`);
    for (const doc of docs.slice(0, INDEX_PER_CATEGORY)) lines.push(`- ${doc.id}｜${doc.title || "未命名"}｜${doc.path}`);
  }

  lines.push(`Raw 共 ${raws.length} 条；未整理 ${unorganized.length} 条。`);
  const rawGroups = new Map<string, ContextDocument[]>();
  for (const doc of organized) {
    const category = rawCategory(doc.path);
    rawGroups.set(category, [...(rawGroups.get(category) ?? []), doc]);
  }
  for (const [category, docs] of rawGroups) {
    lines.push(`${category}（${docs.length}）`);
    for (const doc of docs.slice(0, INDEX_PER_CATEGORY)) lines.push(`- ${doc.id}｜${doc.title || "未命名"}｜${doc.path}`);
  }
  if (unorganized.length) {
    lines.push(`未整理（${unorganized.length}）`);
    for (const doc of unorganized.slice(0, INDEX_PER_CATEGORY)) lines.push(`- ${doc.id}｜${doc.title || "未命名"}｜${doc.path}`);
  }

  return clipContext(lines.join("\n"), INDEX_BUDGET);
}

export function retrieveContext(question: string, documents: ContextDocument[]) {
  const words = question.toLowerCase().match(/[a-z0-9_+-]+|[\p{Script=Han}]+/gu) ?? [];
  const terms = [...new Set(words.flatMap(word => /^[\p{Script=Han}]+$/u.test(word) && word.length > 2
    ? [word, ...Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2))] : [word]))];
  const ranked = documents.map(doc => {
    const title = `${doc.title} ${doc.path}`.toLowerCase(), body = doc.content.toLowerCase();
    const titleHits = terms.filter(term => title.includes(term));
    const positions = terms.map(term => body.indexOf(term)).filter(pos => pos >= 0);
    const score = titleHits.length * 10 + positions.length;
    const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 150);
    const snippet = doc.content.slice(start, start + 500);
    return { id: doc.id, kind: documentKind(doc), path: doc.path, title: doc.title, score,
      snippet, truncated: start > 0 || start + snippet.length < doc.content.length };
  }).filter(doc => doc.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return {
    directory: buildIndex(documents),
    hits: ranked.slice(0, 5),
  };
}
