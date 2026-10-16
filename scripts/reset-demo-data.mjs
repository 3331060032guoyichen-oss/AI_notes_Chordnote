// 演示数据重置：清空知识库业务表，让 seed/demo-notes.json 可以重新灌一遍。
//
// 用法：
//   1) 另开终端 `pnpm dev`（重置本身不依赖服务，但紧接着要跑 seed:demo）
//   2) `pnpm seed:reset`        —— 只预览：列出将要删除的行数，不动数据库
//   3) `pnpm seed:reset -- --yes` —— 真的删除（先备份，再删）
//   4) `pnpm seed:demo`         —— 按 seed/demo-notes.json 重新写入
//
// 为什么需要它：`seed:demo` 按 title 幂等创建，**只增不删**。换一批演示内容时，
// 旧内容会留在库里和新内容混在一起，所以需要一次显式的清空。
//
// 安全性：
//   - 默认 dry-run，必须显式 `--yes` 才删除；
//   - 删除前把九张表的完整内容备份到 .tmp/（已被 .gitignore 挡住），打印绝对路径；
//   - 只在 DATABASE_URL 指向的库上操作。请务必使用 Neon **dev** 分支的连接串
//     （production 分支从未迁移、不属于本地开发流程）。
//
// 删除顺序按外键策略推导，不能随意调整：
//   notes 被 links / note_revisions / proposals 以 RESTRICT 引用，
//   必须先删引用方；raw_notes 被 notes 以 RESTRICT 引用，必须最后删。

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Pool } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(here, "..", ".tmp");

const apply = process.argv.includes("--yes");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("\n✗ 缺少 DATABASE_URL。用法：`pnpm seed:reset`（脚本已带 --env-file=.env.local）。\n");
  process.exitCode = 1;
  process.exit();
}

const pool = new Pool({ connectionString });
const q = async (sql, params) => (await pool.query(sql, params)).rows;

/** 表名 → 备份用的主键列无关，整表 select 即可。顺序即删除顺序（先引用方，后被引用方）。 */
const TABLES = [
  "proposals",
  "links",
  "note_revisions",
  "note_ai_metadata",
  "note_tags",
  "notes",
  "tags",
  "raw_notes",
  "audit_log",
];

const snapshot = {};
for (const table of TABLES) {
  snapshot[table] = await q(`select * from ${table}`);
}

const counts = Object.fromEntries(TABLES.map((table) => [table, snapshot[table].length]));
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

let host = "unknown";
try {
  host = new URL(connectionString).host;
} catch {
  // 连接串形态异常时不影响备份判断，只是打印不出库名。
}

console.log(`\n目标库：${host}`);
console.log("将要清空的表：");
for (const table of TABLES) console.log(`  ${String(counts[table]).padStart(5)}  ${table}`);
console.log(`  ${String(total).padStart(5)}  合计`);

if (total === 0) {
  console.log("\n库已经是空的，无需重置。直接 `pnpm seed:demo` 即可。\n");
  await pool.end();
  process.exit();
}

if (!apply) {
  console.log("\n这是预览模式，**没有删除任何数据**。");
  console.log("确认无误后执行：`pnpm seed:reset -- --yes`\n");
  await pool.end();
  process.exit();
}

await mkdir(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(BACKUP_DIR, `demo-backup-${stamp}.json`);
await writeFile(
  backupPath,
  JSON.stringify({ backedUpAt: new Date().toISOString(), host, counts, tables: snapshot }, null, 2),
  "utf8",
);
console.log(`\n已备份到：${backupPath}`);

for (const table of TABLES) {
  await q(`delete from ${table}`);
}

const remaining = await q(
  `select
     (select count(*)::int from raw_notes)      as raws,
     (select count(*)::int from notes)          as notes,
     (select count(*)::int from note_revisions) as revisions,
     (select count(*)::int from links)          as links,
     (select count(*)::int from proposals)      as proposals`,
);

console.log("已清空。remaining=" + JSON.stringify(remaining[0]));
console.log("\n下一步：`pnpm seed:demo`（需要 `pnpm dev` 已在运行）\n");

await pool.end();
