export type Knowledge = {
  markdown?: string;
  path?: string;
  id: string;
  rawId: string;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  concepts: string[];
  keywords: string[];
  /**
   * 版本号：数据库实现里每次更新 +1，用于乐观并发检查（PATCH 时回传即可）。
   * 旧 JSON 存储没有这个字段，因此是可选的。
   */
  version?: number;
  /** 归档时间。null / 缺省表示在日常列表里可见；归档不删数据，可以恢复。 */
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
