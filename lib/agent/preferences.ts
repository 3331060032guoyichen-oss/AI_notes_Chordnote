/** Only this H2 section may be replaced by a preference proposal. */
export function preferenceSection(schema: string) {
  const lines = schema.split(/(?<=\n)/);
  let offset = 0, start = -1, end = schema.length, fence = "";
  for (const line of lines) {
    const code = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (code) { if (!fence) fence = code[1][0]; else if (code[1][0] === fence) fence = ""; }
    if (!fence && /^##\s+/.test(line)) {
      if (start >= 0) { end = offset; break; }
      if (/^##\s+用户偏好\s*$/.test(line.trimEnd())) start = offset;
    }
    offset += line.length;
  }
  return { start, end, content: start < 0 ? "" : schema.slice(start, end) };
}
export function validPreferences(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 4000
    && !/^\s*(?:#{1,2}\s|```|~~~|<!--|---\s*$)/m.test(value) && !value.includes("-->");
}
export function replacePreferences(schema: string, content: string, proposalId: string) {
  if (!validPreferences(content)) throw new Error("偏好内容无效");
  const { start, end } = preferenceSection(schema);
  const block = `## 用户偏好\n\n${content.trim()}\n\n<!-- preference-proposal:${proposalId} -->\n\n`;
  return start < 0 ? `${schema.trimEnd()}\n\n${block}` : schema.slice(0, start) + block + schema.slice(end);
}
