/** Shared by workspace navigation and the built-in Agent manual. */
export const RAW_FOLDERS = ["articles", "papers", "books", "media", "data"];
export type RawCategory = "articles" | "papers" | "books" | "media" | "data";
export function isRawCategory(value: unknown): value is RawCategory { return typeof value === "string" && RAW_FOLDERS.includes(value); }
export function rawCategory(path?: string | null): RawCategory {
  const folder = path?.replace(/\\/g, "/").split("/")[1];
  return isRawCategory(folder) ? folder : "articles";
}
export const WIKI_FOLDERS = ["index", "entitles", "concept", "sources", "synthesis", "questions", "overview"];
export const WORKSPACE_DIRECTORY_RULES = `目录约定：未整理笔记是独立入口；原始来源整理后按 ${RAW_FOLDERS.join("、")} 分类进入 Raw，未整理状态由是否已有对应知识页判断。Raw 不设置 index 或收件箱目录。Wiki 保存知识页，按 ${WIKI_FOLDERS.join("、")} 分类；index 专属 Wiki，是按类别组织知识页的内容索引，便于查找和导航。内容索引由知识列表与图谱动态提供，不另建 index 文件。已有知识页兼容 wilki/ 前缀。`;
