/** 列表与标签里的短预览。多行空白压成单行，超出补省略号。 */
export function getPreview(text: string, length = 140): string {
  const flat = text.replace(/\s+/g, " ").trim();

  return flat.length > length ? `${flat.slice(0, length)}...` : flat;
}
