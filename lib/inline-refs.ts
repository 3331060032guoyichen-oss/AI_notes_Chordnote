/**
 * 把知识页正文切成「普通文字」与「知识点」两种片段，供正文内联标记使用。
 *
 * 为什么按标题匹配、而不是引入 `[[ ]]` 语法：库里已有的正文都是纯文本
 * （seed 与 AI 草稿都不写方括号），而右栏的「未链接提及」本来就是靠标题匹配算出来的。
 * 沿用同一套口径，才能保证「右栏说正文提到了它」与「正文里能点它」永远是同一个判断 ——
 * 两套口径迟早会打架，用户会看到"提了却没标"或"标了却没提"。
 */

export type InlineSegment =
  | { type: "text"; text: string }
  | { type: "ref"; title: string };

export function splitByTitles(text: string, titles: readonly string[]): InlineSegment[] {
  // 长标题优先：否则「实对称矩阵的正交对角化」会被其中更短的标题先切走。
  const candidates = [...new Set(titles.filter((title) => title.trim().length > 0))].sort(
    (a, b) => b.length - a.length,
  );

  if (candidates.length === 0) return text.length > 0 ? [{ type: "text", text }] : [];

  const segments: InlineSegment[] = [];
  let buffer = "";
  let cursor = 0;

  const flush = () => {
    if (buffer.length > 0) {
      segments.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  while (cursor < text.length) {
    const hit = candidates.find((title) => text.startsWith(title, cursor));

    if (hit) {
      flush();
      segments.push({ type: "ref", title: hit });
      cursor += hit.length;
      continue;
    }

    buffer += text[cursor];
    cursor += 1;
  }

  flush();

  return segments;
}
