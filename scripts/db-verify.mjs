// 数据库结构与约束验证（离线跑，不需要 dev server）。
//
// 用法：
//   pnpm verify:db
//
// 干什么：
//   在一个**内存里的** PGlite 上按顺序执行 drizzle/ 里的迁移，然后检查
//   表数量、约束、外键删除行为、jsonb 列的存储形态，以及"另一个用户的数据
//   读不到"这条隔离口径在 SQL 层成立。
//
// 为什么用内存库而不是应用正在用的 data/pglite：
//   PGlite 是"单写者"——同一时刻只允许一个进程写一份数据目录（见 AGENTS.md 已知坑）。
//   这个脚本要往库里塞测试行，所以它自己起一份干净的内存库：既不会碰你的知识库，
//   也不需要先关掉 `pnpm dev`。想检查**真实**数据请用 `GET /api/export`（导出知识包）。
//
// 安全性：全程不进磁盘、不联网、不留残留；结束即随进程消失。

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, "..", "drizzle");

const out = [];
const line = (s) => out.push(s);

const db = new PGlite();

/** 迁移文件里的语句用 `--> statement-breakpoint` 分隔；PGlite 的 exec 可整文件执行。 */
async function applyMigrations() {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const name of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    await db.exec(sql);
  }

  return files.length;
}

const q = async (sql, params) => (await db.query(sql, params)).rows;

const applied = await applyMigrations();
line(`migrations_applied=${applied}`);

// 1) 表数量（public schema）
const tables = await q(
  `select count(*)::int as n from pg_catalog.pg_tables where schemaname = current_schema()`,
);
line(`public_tables=${tables[0].n}`);

// 2) 每个 schema 的表数量（PGlite 自带 pg_catalog / information_schema / pg_toast）
const perSchema = await q(
  `select schemaname, count(*)::int as n
     from pg_catalog.pg_tables
    group by schemaname
    order by schemaname`,
);
line(`tables_per_schema=${perSchema.map((r) => `${r.schemaname}:${r.n}`).join(" ")}`);

// 3) 约束计数（c=check, f=foreign key, p=primary key, u=unique）
const cons = await q(
  `select contype::text as t, count(*)::int as n
     from pg_constraint
    where connamespace = (select oid from pg_namespace where nspname = current_schema())
    group by contype
    order by contype`,
);
line(`constraints_in_current_schema=${cons.map((r) => `${r.t}:${r.n}`).join(" ")}`);

// 4) 外键的删除行为（a=no action, r=restrict, c=cascade, n=set null, d=set default）
const fks = await q(
  `select conname, confdeltype::text as d
     from pg_constraint
    where contype = 'f'
      and connamespace = (select oid from pg_namespace where nspname = current_schema())
    order by conname`,
);
line("foreign_keys:");
for (const r of fks) line(`  ${r.conname} = ${r.d}`);

// 5) 索引与唯一约束的落地情况（links_pair_idx 是"重建关系 = 复活"的前提）
const idx = await q(
  `select indexname from pg_indexes where schemaname = current_schema() order by indexname`,
);
line(`indexes=${idx.map((r) => r.indexname).join(" ")}`);

// 6) 关键列是否存在且可空
const cols = await q(
  `select table_name, column_name, is_nullable, data_type
     from information_schema.columns
    where table_schema = current_schema()
      and (
        (table_name = 'raw_notes' and column_name in ('archived_at', 'title')) or
        (table_name = 'notes' and column_name in ('archived_at', 'version', 'origin')) or
        (table_name = 'links' and column_name = 'deleted_at')
      )
    order by table_name, column_name`,
);
line("key_columns:");
for (const r of cols) line(`  ${r.table_name}.${r.column_name} ${r.data_type} nullable=${r.is_nullable}`);

// 7) jsonb 列存的是真 jsonb（不是二次编码的字符串）
await q(`insert into raw_notes (id, user_id, text) values ($1, $2, $3)`, [
  "dbv_raw",
  "dbv-user",
  "库验证原话",
]);
await q(
  `insert into notes (id, user_id, raw_id, title, summary, content, concepts, key_points, keywords)
   values ($1, $2, $3, $4, $5, $6, '["概念"]'::jsonb, '["要点"]'::jsonb, '["关键词"]'::jsonb)`,
  ["dbv_note", "dbv-user", "dbv_raw", "库验证知识页", "摘要", "正文"],
);

const shapes = await q(
  `select jsonb_typeof(concepts) as concepts,
          jsonb_typeof(key_points) as key_points,
          jsonb_typeof(keywords) as keywords
     from notes where id = $1`,
  ["dbv_note"],
);
line(
  `jsonb_types=${shapes[0].concepts}/${shapes[0].key_points}/${shapes[0].keywords}`,
);

// 8) 关系表：非法类型被 CHECK 拒绝；同一条关系（含方向）只能有一行
const insertLink = (id, source, target, type = "related", reason = "库验证") =>
  q(
    `insert into links (id, user_id, source_note_id, target_note_id, type, reason)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, "dbv-user", source, target, type, reason],
  );

await q(
  `insert into notes (id, user_id, raw_id, title, summary, content)
   values ($1, $2, $3, $4, $5, $6)`,
  ["dbv_note_b", "dbv-user", "dbv_raw", "库验证知识页 B", "摘要", "正文"],
);

let badTypeRejected = false;
try {
  await insertLink("dbv_link_bad", "dbv_note", "dbv_note_b", "supports");
} catch {
  badTypeRejected = true;
}
line(`invalid_link_type_rejected=${badTypeRejected}`);

await insertLink("dbv_link", "dbv_note", "dbv_note_b");
let duplicateRejected = false;
try {
  await insertLink("dbv_link_dup", "dbv_note", "dbv_note_b");
} catch {
  duplicateRejected = true;
}
line(`duplicate_pair_rejected=${duplicateRejected}`);

// 9) 归属隔离：另一个 user_id 的行读不到（服务层的每个查询都带 user_id 过滤）
await q(`insert into raw_notes (id, user_id, text) values ($1, $2, $3)`, [
  "dbv_raw_other",
  "dbv-other",
  "他人的原话",
]);
const visibleToOwner = await q(`select id from raw_notes where user_id = $1 order by id`, ["dbv-user"]);
const visibleToOther = await q(`select id from raw_notes where user_id = $1 order by id`, ["dbv-other"]);
line(`owner_sees=${visibleToOwner.map((r) => r.id).join(",")}`);
line(`other_sees=${visibleToOther.map((r) => r.id).join(",")}`);
line(
  `isolation_ok=${!visibleToOwner.some((r) => r.id === "dbv_raw_other") && !visibleToOther.some((r) => r.id === "dbv_raw")}`,
);

// 10) 外键 RESTRICT：知识页还在时，原始记录删不掉
let rawDeleteBlocked = false;
try {
  await q(`delete from raw_notes where id = $1`, ["dbv_raw"]);
} catch {
  rawDeleteBlocked = true;
}
line(`raw_delete_blocked_by_note=${rawDeleteBlocked}`);

await db.close();

console.log(out.join("\n"));
