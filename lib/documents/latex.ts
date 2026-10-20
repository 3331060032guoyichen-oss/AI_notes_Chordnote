export type TextRange = { from: number; to: number };
export type MathRange = TextRange & { expression: string; display: boolean };

/**
 * 找出 `$...$` 与 `$$...$$`。skip 是代码区间：代码里的美元符号不参与渲染。
 * 行内公式按常见约定要求首尾不是空白，所以 `$5 and $6` 不会被当成公式。
 */
export function findMathRanges(text: string, skip: readonly TextRange[] = []): MathRange[] {
  const skipped = (index: number) => skip.some((range) => index >= range.from && index < range.to);
  const ranges: MathRange[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\\") {
      index += 1;
      continue;
    }
    if (text[index] !== "$" || skipped(index)) continue;

    if (text[index + 1] === "$") {
      const close = text.indexOf("$$", index + 2);
      const expression = close > index + 1 ? text.slice(index + 2, close) : "";
      if (expression.trim()) {
        ranges.push({ from: index, to: close + 2, expression, display: true });
        index = close + 1;
      }
      continue;
    }

    if (!text[index + 1] || /\s/.test(text[index + 1])) continue;

    let close = -1;
    for (let cursor = index + 1; cursor < text.length; cursor += 1) {
      const char = text[cursor];
      if (char === "\n") break;
      if (char === "\\") {
        cursor += 1;
        continue;
      }
      if (char === "$" && cursor > index + 1 && !/\s/.test(text[cursor - 1]) && !skipped(cursor)) {
        close = cursor;
        break;
      }
    }
    if (close < 0) continue;

    ranges.push({ from: index, to: close + 1, expression: text.slice(index + 1, close), display: false });
    index = close;
  }

  return ranges;
}
