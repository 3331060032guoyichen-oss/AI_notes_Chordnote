import { defineConfig } from "drizzle-kit";

// 迁移生成用。运行期不经过 drizzle-kit：应用启动时由 lib/db/client.ts 自己
// 跑 `drizzle/` 里的增量迁移（见该文件的 migrate()）。
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // 本地 PGlite 数据目录（PostgreSQL 方言，跑在进程内）。
    url: process.env.PGLITE_DATA_DIR ?? "./data/pglite",
  },
});
