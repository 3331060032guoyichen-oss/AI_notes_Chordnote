// 演示数据重置：清空本地知识库的业务表，让 seed/demo-notes.json 可以重新灌一遍。
//
// 用法：
//   1) **先停掉 `pnpm dev`**（原因见下）
//   2) `pnpm seed:reset`            —— 只预览：列出将要删除的行数，不动数据库
//   3) `pnpm seed:reset -- --yes`   —— 真的删除（先备份，再删）
//   4) `pnpm dev` + `pnpm seed:demo`
//
// 为什么必须先停 dev server：
//   知识库是 PGlite（PostgreSQL 的 WASM 版），**同一份数据目录同一时刻只允许一个进程写**。
//   应用运行期间它把这份库握在自己进程里；这时另一个进程再打开同一目录，读到的是打开那一刻的
//   快照，写回去的内容还会被应用随后的写入覆盖 —— 也就是"删了像没删"。
//   所以本脚本先探测 3000 端口，发现服务还活着就直接拒绝运行。
//
// 为什么不是"归档"而是物理删除：
//   DEMO 换一批内容时，旧内容必须真的消失。归档只是从日常列表里隐藏，
//   而 `seed:demo` 是按 title 幂等创建的（存在就复用），归档过的内容会让重灌直接跳过。
//   界面上没有物理删除入口，这个脚本就是唯一的"推倒重来"开关。
//
// 安全性：
//   - 默认 dry-run，必须显式 `--yes` 才删除；
//   - 删除前把九张表的完整内容备份成 JSON 放到 .tmp/（已被 .gitignore 挡住），并打印绝对路径；
//   - 只动 PGLITE_DATA_DIR 指向的那份本地库，不涉及任何远端服务。
//
// 删除顺序按外键策略推导，不能随意调整：
//   notes 被 links / note_revisions / proposals 以 RESTRICT 引用，必须先删引用方；
//   raw_notes 被 notes 以 RESTRICT 引用，必须最后删。

import { mkdir, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(here, "..", ".tmp");
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? join(here, "..", "data", "pglite");

const apply = process.argv.includes("--yes");

/** 3000 端口有人监听就说明 dev server 还开着。 */
function serverAlive(port = 3000, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    const done = (alive) => {
      socket.destroy();
      resolve(alive);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1500, () => done(false));
  });
}

if (await serverAlive()) {
  console.error(
    "\n✗ 3000 端口有服务在跑。请先停掉 `pnpm dev` 再重置：\n" +
      "  PGlite 是单写者，应用运行期间它对本地库的写入会覆盖掉这个脚本删掉的内容。\n",
  );
  process.exitCode = 1;
  process.exit();
}

const db = new PGlite(DATA_DIR);
await db.waitReady;

const q = async (sql, params) => (await db.query(sql, params)).rows;

/** 表名 → 整表 select 即备份内容。顺序即删除顺序（先引用方，后被引用方）。 */
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

console.log(`数据目录：${DATA_DIR}`);
console.log("将要删除的行数：");
for (const table of TABLES) console.log(`  ${table.padEnd(20)} ${counts[table]}`);
console.log(`  ${"合计".padEnd(19)} ${total}`);

if (!apply) {
  console.log("\n这是预览（dry-run）。确认无误后运行：`pnpm seed:reset -- --yes`\n");
  await db.close();
  process.exit();
}

if (total === 0) {
  console.log("\n库里没有数据，无需重置。\n");
  await db.close();
  process.exit();
}

await mkdir(BACKUP_DIR, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = join(BACKUP_DIR, `demo-reset-backup-${stamp}.json`);
await writeFile(backupPath, JSON.stringify({ dataDir: DATA_DIR, counts, snapshot }, null, 2), "utf8");
console.log(`\n已备份到：${backupPath}`);

for (const table of TABLES) {
  await q(`delete from ${table}`);
}

const left = {};
for (const table of TABLES) {
  left[table] = (await q(`select count(*)::int as n from ${table}`))[0].n;
}

const residue = Object.entries(left).filter(([, n]) => n > 0);
if (residue.length) {
  console.error("\n✗ 清理不完整：", residue.map(([t, n]) => `${t}=${n}`).join(" "));
  process.exitCode = 1;
} else {
  console.log("✓ 九张业务表已清空。接下来：`pnpm dev`，然后 `pnpm seed:demo`。\n");
}

await db.close();
