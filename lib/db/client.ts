import { drizzle } from "drizzle-orm/neon-serverless";
import { neonConfig, Pool } from "@neondatabase/serverless";

import * as schema from "./schema";

export type Database = ReturnType<typeof drizzle<typeof schema>>;

/**
 * 事务句柄。
 *
 * 服务层需要"在一个事务里做多步"时接收它（例如提议执行：写正式数据 → 更新提议状态 → 写审计）。
 * 类型从 `Database` 推导，因此驱动替换只影响本文件，服务层不会出现驱动专属类型。
 */
export type DbTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export interface DbHandle {
  db: Database;
  pool: Pool;
  close: () => Promise<void>;
}

/**
 * 连接工厂 —— 全项目唯一知道"用哪个驱动"的地方。
 *
 * 默认：@neondatabase/serverless（WebSocket 传输）。
 *   - Netlify Functions 属 serverless，Neon 官方推荐该驱动；
 *   - WebSocket 传输支持交互式事务（HTTP 传输只支持非交互式事务，不使用）。
 *
 * 驱动替换只发生在本文件：若将来部署到长驻服务器（VPS / 容器），可改为
 * `drizzle-orm/node-postgres` + `pg`，业务层与服务层不出现驱动专属 API。
 *
 * 连接串：
 *   - 应用运行期：池化串（DATABASE_URL，hostname 含 -pooler）
 *   - 迁移 / pg_dump：直连串（DATABASE_URL_UNPOOLED）
 */
export async function createDb(connectionString = process.env.DATABASE_URL): Promise<DbHandle> {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  // Node.js 没有全局 WebSocket；WebSocket 传输需要显式构造器（ws + bufferutil）。
  if (typeof WebSocket === "undefined") {
    const ws = await import("ws");
    neonConfig.webSocketConstructor = ws.default as unknown as typeof WebSocket;
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

let dbPromise: Promise<DbHandle> | null = null;

/** 进程内复用的数据库句柄（serverless 冷启动后首调创建，后续复用）。 */
export function getDb(): Promise<DbHandle> {
  if (!dbPromise) {
    dbPromise = createDb();
  }
  return dbPromise;
}
