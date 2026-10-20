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

export type ContextDocument = { id: string; path: string; title: string; content: string };
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
    return { id: doc.id, path: doc.path, title: doc.title, score,
      snippet, truncated: start > 0 || start + snippet.length < doc.content.length };
  }).filter(doc => doc.score > 0).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return {
    directory: clipContext(documents.map(doc => `${doc.path} [${doc.id}]`).sort().join("\n"), 4_000),
    hits: ranked.slice(0, 5),
  };
}
