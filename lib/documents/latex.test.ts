import assert from "node:assert/strict";
import test from "node:test";

import { findMathRanges } from "./latex";

test("行内公式：$...$ 被识别并保留原始表达式", () => {
  assert.deepEqual(findMathRanges("质能方程 $E = mc^2$ 很重要"), [
    { from: 5, to: 15, expression: "E = mc^2", display: false },
  ]);
});

test("独立公式：$$...$$ 可以跨行", () => {
  assert.deepEqual(findMathRanges("$$\n\\int_0^1 x^2 dx\n$$"), [
    { from: 0, to: 21, expression: "\n\\int_0^1 x^2 dx\n", display: true },
  ]);
});

test("转义的美元符号与货币写法不渲染", () => {
  assert.deepEqual(findMathRanges("价格是 \\$5 and $6"), []);
});

test("代码区间里的公式不渲染", () => {
  const text = "`$x$` 与 $y$";
  assert.deepEqual(findMathRanges(text, [{ from: 0, to: 5 }]), [
    { from: 8, to: 11, expression: "y", display: false },
  ]);
});

test("同一行可以有多条行内公式", () => {
  assert.deepEqual(findMathRanges("$a$ 和 $b$").map((range) => range.expression), ["a", "b"]);
});

test("带 frontmatter 的公式范围使用文档绝对位置", () => {
  const frontmatter = "---\ntitle: 振动\ntags: [物理]\n---\n";
  const ranges = findMathRanges("# 振动\n\n$m\\ddot{x}+kx=0$", [], frontmatter.length);
  assert.equal(ranges[0]?.from, frontmatter.length + 6);
  assert.ok(ranges.every(range => range.from >= frontmatter.length));
});
