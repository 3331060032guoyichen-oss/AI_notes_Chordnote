/**
 * 逐行 diff —— 只为「编辑助理提议改写正文」的预览卡服务。
 *
 * 为什么自己写而不是引库：这里只需要"哪几行删了、哪几行加了"，用 LCS 就够，
 * 知识页正文都是几十行量级，O(n·m) 完全无压力。引一个通用 diff 库反而要处理
 * 它的字符级 / 词级模式、补丁格式和体积。
 *
 * 输出保留原始行序（相同的行也返回），这样预览卡读起来还是原文的顺序，
 * 而不是"先列删掉的、再列新增的"那种拼贴感。
 */

export type DiffLineKind = "same" | "added" | "removed";

export type DiffLine = {
  kind: DiffLineKind;
  text: string;
};

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);

  // lcs[i][j] = a[i..] 与 b[j..] 的最长公共子序列长度
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: "removed", text: a[i] });
      i += 1;
    } else {
      lines.push({ kind: "added", text: b[j] });
      j += 1;
    }
  }

  while (i < a.length) {
    lines.push({ kind: "removed", text: a[i] });
    i += 1;
  }

  while (j < b.length) {
    lines.push({ kind: "added", text: b[j] });
    j += 1;
  }

  return lines;
}
