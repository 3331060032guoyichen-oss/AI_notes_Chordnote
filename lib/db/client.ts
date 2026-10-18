import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

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
  client: PGlite;
  close: () => Promise<void>;
}

/**
 * 连接工厂 —— 全项目唯一知道"用哪个驱动"的地方。
 *
 * 用的是 PGlite：把 PostgreSQL 编译成 WASM，直接在 Node 进程里跑，
 * 数据落在本地目录（默认 `data/pglite`）。因此：
 *   - 不需要连接串、不需要外部数据库服务、不需要联网；
 *   - SQL 方言仍是 PostgreSQL，schema 与 drizzle 迁移原样可用；
 *   - 备份 = 拷走 `data/` 目录（或走「导出知识包」）。
 *
 * 单写者：同一时刻只允许一个进程写这份数据目录（WASM 版 Postgres 的固有约束）。
 * 所以不要在应用运行时再开第二个进程去连同一个 `PGLITE_DATA_DIR`；
 * 需要脚本检查数据时，请走 HTTP 接口（见 scripts/regression.mjs）。
 *
 * 驱动替换只发生在本文件：服务层只用 `getDb()` 与 `DbTransaction`，
 * 不出现驱动专属 API。
 */
export const DEFAULT_DATA_DIR = "./data/pglite";
const DEFAULT_MIGRATIONS_FOLDER = "./drizzle";

/** 数据目录；可用 PGLITE_DATA_DIR 覆盖（测试脚本会指到别处，避免和应用抢同一份数据）。 */
export function resolveDataDir(): string {
  return resolve(process.env.PGLITE_DATA_DIR ?? DEFAULT_DATA_DIR);
}

/**
 * 桌面安装包把迁移文件放在只读资源目录。网页开发仍沿用项目根目录的 drizzle/。
 * 通过环境变量传入绝对路径，避免 standalone 进程的工作目录影响迁移发现。
 */
export function resolveMigrationsFolder(): string {
  return resolve(process.env.CHORDNOTE_MIGRATIONS_DIR ?? DEFAULT_MIGRATIONS_FOLDER);
}

export async function createDb(): Promise<DbHandle> {
  const dataDir = resolveDataDir();
  // PGlite 不会自己建父目录（`data/` 在仓库里存在，但 `data/pglite` 是新建的）。
  await mkdir(dirname(dataDir), { recursive: true });

  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });

  // 建表 / 补列：drizzle 迁移按 journal 增量执行，已应用过的会跳过，每个进程跑一次。
  await migrate(db, { migrationsFolder: resolveMigrationsFolder() });

  return {
    db,
    client,
    close: async () => {
      await client.close();
    },
  };
}

/**
 * App Router may evaluate different route bundles independently in development.
 * Keep the PGlite owner on Node's process object rather than in a module-local
 * variable. App Router route bundles can have separate VM globals in development,
 * but they share the process object. Without this, one request can hold PGlite
 * open while a second route attempts a conflicting writer connection.
 */
type DbProcess = typeof process & { __chordnoteDbPromise?: Promise<DbHandle> };
const dbProcess = process as DbProcess;

/** 进程内复用的数据库句柄（首次调用时打开数据目录并补齐迁移，之后一直复用）。 */
export function getDb(): Promise<DbHandle> {
  if (!dbProcess.__chordnoteDbPromise) {
    dbProcess.__chordnoteDbPromise = createDb().catch((error) => {
      // A failed first open must not poison future retries.
      dbProcess.__chordnoteDbPromise = undefined;
      throw error;
    });
  }
  return dbProcess.__chordnoteDbPromise;
}

/** 显式关闭（脚本收尾用；Next 运行期不需要调用）。 */
export async function closeDb(): Promise<void> {
  if (!dbProcess.__chordnoteDbPromise) return;
  const handle = await dbProcess.__chordnoteDbPromise;
  dbProcess.__chordnoteDbPromise = undefined;
  await handle.close();
}
