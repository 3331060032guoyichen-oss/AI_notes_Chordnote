/** Shared by workspace navigation and the built-in Agent manual. */
export const RAW_FOLDERS = ["articles", "papers", "books", "media", "data"] as const;
export type RawCategory = typeof RAW_FOLDERS[number];
export const RAW_FOLDER_HINTS: Record<RawCategory, string> = {
  articles: "文章和博客",
  papers: "论文和研究",
  books: "书籍和章节",
  media: "图片、视频、音频",
  data: "数据文件",
};
export function isRawCategory(value: unknown): value is RawCategory { return typeof value === "string" && (RAW_FOLDERS as readonly string[]).includes(value); }
export function rawCategory(path?: string | null): RawCategory {
  const folder = path?.replace(/\\/g, "/").split("/")[1];
  return isRawCategory(folder) ? folder : "articles";
}
export const WIKI_FOLDERS = ["index", "entitles", "concept", "sources", "synthesis", "questions", "overview"] as const;
export type WikiCategory = typeof WIKI_FOLDERS[number];
export const WIKI_FOLDER_HINTS: Record<WikiCategory, string> = {
  index: "内容索引",
  entitles: "实体页面（人物、组织、产品等）",
  concept: "概念页面（主题、理论、方法等）",
  sources: "源文档摘要",
  synthesis: "综合分析",
  questions: "探索性问题和答案",
  overview: "知识库总览",
};
export function isWikiCategory(value: unknown): value is WikiCategory { return typeof value === "string" && (WIKI_FOLDERS as readonly string[]).includes(value); }
export function wikiCategory(path?: string | null): WikiCategory {
  const folder = path?.replace(/\\/g, "/").split("/")[1];
  return isWikiCategory(folder) ? folder : "concept";
}
export const WORKSPACE_DIRECTORY_RULES = `目录约定：未整理笔记是独立入口；原始来源整理后按 ${RAW_FOLDERS.join("、")} 分类进入 Raw，未整理状态由是否已通过来源关联绑定到知识页判断。Raw 不设置 index 或收件箱目录。Wiki 保存知识页，按 ${WIKI_FOLDERS.join("、")} 分类；index 与 log 是只读视图，不是文件：index 由知识列表与图谱实时生成，log 读取 audit_log，不另建 index.md 或 log.md。已有知识页兼容 wilki/ 前缀。`;
