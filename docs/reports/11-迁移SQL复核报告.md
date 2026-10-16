# 迁移 SQL 复核报告（0000–0003）

> 对应项目方决策 1：**先逐一复核完整 SQL、迁移记录、破坏性操作及目标分支；当前不执行迁移。**
> **本文未执行任何迁移、未连接任何数据库、未触碰 production。** 复核结论供授权决策参考。

---

## 一、复核结论（先说结果）

| 项 | 结论 |
|---|---|
| 是否可以执行 | ✅ 可以（**前提：按序 0000 → 0001 → 0002 → 0003 全部执行**，见第八节的中间态警告）|
| 破坏性操作 | **0 条**（四份迁移合计：无 `DROP TABLE` / `DROP COLUMN` / `DELETE` / `TRUNCATE` / `ALTER COLUMN`）|
| 目标分支 | ✅ `.neon` 与 `.env.local` 都指向 **`dev`**（实测）|
| 数据库 | 项目 `Notipelago` / `gentle-feather-13372754`，区域 `aws-us-east-2`，PostgreSQL **18** |
| 组织套餐 | **`free`**（实测 `neon orgs list`）→ 决定备份保留期，见 12 号文件 |
| 迁移状态 | **一次都没执行过**（`public_tables` 上次实测为 0，此后未执行任何迁移）|

---

## 二、目标分支核实（实测）

```json
// .neon
{ "projectId": "gentle-feather-13372754", "orgId": "org-proud-pine-88857547", "branch": "dev" }
```

`.env.local` 中 `NEON_BRANCH=dev`。**两处一致，当前上下文锁定在 `dev` 分支。**

> ⚠️ `production` 分支存在且**从未被本会话连接或修改**。执行迁移前仍建议再复核一次这两个文件。

---

## 三、四份迁移逐份复核（含 SHA256）

| 迁移 | 用途 | 语句统计 | 破坏性 | SHA256（前 12 位）|
|---|---|---|---|---|
| `0000_fearless_wonder_man.sql` | 建 11 张表 + 8 个外键 + 18 个索引 | CREATE TABLE 11 / ALTER 8 / CHECK 0 / DROP CONSTRAINT 0 | **0** | `1C867E70C473` |
| `0001_icy_starbolt.sql` | 4 个外键改 RESTRICT + 11 个 CHECK + `raw_notes.archived_at` | CREATE 0 / ALTER 20 / **CHECK 11** / **DROP CONSTRAINT 4** | **0** | `515FC6ED4FC4` |
| `0002_lovely_power_pack.sql` | `notes.deleted_at`（墓碑）| ALTER 1 | **0** | `B35B374AC43D` |
| `0003_lean_bloodscream.sql` | `links.deleted_at`（关系软删）| ALTER 1 | **0** | `7D801D9A9B2A` |

---

## 四、迁移记录（`drizzle/meta/_journal.json`，实测原文）

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    { "idx": 0, "version": "7", "when": 1791644197546, "tag": "0000_fearless_wonder_man", "breakpoints": true },
    { "idx": 1, "version": "7", "when": 1791646924747, "tag": "0001_icy_starbolt",       "breakpoints": true },
    { "idx": 2, "version": "7", "when": 1791647076177, "tag": "0002_lovely_power_pack",  "breakpoints": true },
    { "idx": 3, "version": "7", "when": 1791647379371, "tag": "0003_lean_bloodscream",   "breakpoints": true }
  ]
}
```

四条记录、idx 连续（0–3）、dialect 为 postgresql。配套 snapshot（`meta/0000–0003_snapshot.json`）**必须与 SQL 一起提交**，否则下一个迁移会 diff 错。

---

## 五、破坏性操作逐条判定

**四份迁移合计 0 条数据破坏性语句。** 逐类确认：

| 语句类型 | 数量 | 判定 |
|---|---|---|
| `DROP TABLE` / `DROP COLUMN` | 0 | 无 |
| `DELETE` / `TRUNCATE` | 0 | 无 |
| `ALTER COLUMN ... TYPE` | 0 | 无（无表重写风险）|
| `DROP CONSTRAINT` | **4**（全在 0001）| **只删约束、不动数据。** 目的就是把 4 个外键从 `cascade` 换掉。在 `DROP` 与随后 `ADD` 之间该外键短暂缺席；若整份迁移在单个事务内执行，该中间态对外不可见（**此点尚未实测，列为待验证**）|
| `ADD COLUMN` | 2（0002、0003）| 可空、无默认值 → 不重写表、不影响既有行 |
| `ADD CONSTRAINT ... CHECK` | 11（全在 0001）| 只校验、不改数据；**若目标库已有违规行会直接失败**（期望行为，见第七节预检）|

---

## 六、`0000` 完整语句清单（37 条，逐字）

**11 个建表**：

```
CREATE TABLE "agent_tokens" (:        CREATE TABLE "audit_log" (:
CREATE TABLE "idempotency_keys" (:    CREATE TABLE "links" (:
CREATE TABLE "note_ai_metadata" (:    CREATE TABLE "note_revisions" (:
CREATE TABLE "note_tags" (:           CREATE TABLE "notes" (:
CREATE TABLE "proposals" (:           CREATE TABLE "raw_notes" (:
CREATE TABLE "tags" (:
```

> 各表的列定义完整见 `drizzle/0000_fearless_wonder_man.sql`（169 行）。表与列的语义、及其与设计文档的一致性，已在 09 号文件 §一 逐表复核过（11 表 / 8 外键 / 0 破坏性 / 0 内联 REFERENCES）。

**8 个外键（⚠️ 注意：这里全是 `cascade`，由 0001 改成 `restrict`）**：

```sql
ALTER TABLE "links" ADD CONSTRAINT "links_source_note_id_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "links" ADD CONSTRAINT "links_target_note_id_notes_id_fk" FOREIGN KEY ("target_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "note_ai_metadata" ADD CONSTRAINT "note_ai_metadata_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "notes" ADD CONSTRAINT "notes_raw_id_raw_notes_id_fk" FOREIGN KEY ("raw_id") REFERENCES "public"."raw_notes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_target_note_id_notes_id_fk" FOREIGN KEY ("target_note_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
```

**18 个索引（4 个唯一）**：

```sql
CREATE UNIQUE INDEX "agent_tokens_hash_idx" ON "agent_tokens" USING btree ("token_hash");
CREATE INDEX "agent_tokens_user_id_idx" ON "agent_tokens" USING btree ("user_id");
CREATE INDEX "audit_log_user_id_idx" ON "audit_log" USING btree ("user_id");
CREATE INDEX "audit_log_target_idx" ON "audit_log" USING btree ("target_type","target_id");
CREATE INDEX "links_user_id_idx" ON "links" USING btree ("user_id");
CREATE INDEX "links_source_idx" ON "links" USING btree ("source_note_id");
CREATE INDEX "links_target_idx" ON "links" USING btree ("target_note_id");
CREATE UNIQUE INDEX "links_pair_idx" ON "links" USING btree ("user_id","source_note_id","target_note_id","type");
CREATE UNIQUE INDEX "note_ai_metadata_note_idx" ON "note_ai_metadata" USING btree ("note_id");
CREATE INDEX "note_ai_metadata_user_idx" ON "note_ai_metadata" USING btree ("user_id");
CREATE INDEX "note_revisions_note_version_idx" ON "note_revisions" USING btree ("note_id","version");
CREATE INDEX "note_tags_tag_idx" ON "note_tags" USING btree ("tag_id");
CREATE INDEX "notes_user_id_idx" ON "notes" USING btree ("user_id");
CREATE INDEX "notes_raw_id_idx" ON "notes" USING btree ("raw_id");
CREATE INDEX "proposals_user_id_idx" ON "proposals" USING btree ("user_id");
CREATE INDEX "proposals_status_idx" ON "proposals" USING btree ("user_id","status");
CREATE INDEX "raw_notes_user_id_idx" ON "raw_notes" USING btree ("user_id");
CREATE UNIQUE INDEX "tags_user_normalized_idx" ON "tags" USING btree ("user_id","normalized_name");
```

---

## 七、`0001` / `0002` / `0003` 完整 SQL（逐字）

```sql
-- 0001_icy_starbolt.sql
ALTER TABLE "links" DROP CONSTRAINT "links_source_note_id_notes_id_fk";
ALTER TABLE "links" DROP CONSTRAINT "links_target_note_id_notes_id_fk";
ALTER TABLE "note_revisions" DROP CONSTRAINT "note_revisions_note_id_notes_id_fk";
ALTER TABLE "proposals" DROP CONSTRAINT "proposals_target_note_id_notes_id_fk";
ALTER TABLE "raw_notes" ADD COLUMN "archived_at" timestamp with time zone;
ALTER TABLE "links" ADD CONSTRAINT "links_source_note_id_notes_id_fk" FOREIGN KEY ("source_note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "links" ADD CONSTRAINT "links_target_note_id_notes_id_fk" FOREIGN KEY ("target_note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_note_id_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_target_note_id_notes_id_fk" FOREIGN KEY ("target_note_id") REFERENCES "public"."notes"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_type_check" CHECK ("actor_type" in ('user', 'agent', 'system'));
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_result_check" CHECK ("result" in ('ok', 'failed', 'partial'));
ALTER TABLE "links" ADD CONSTRAINT "links_type_check" CHECK ("type" in ('related'));
ALTER TABLE "links" ADD CONSTRAINT "links_origin_check" CHECK ("origin" in ('user', 'ai'));
ALTER TABLE "note_revisions" ADD CONSTRAINT "note_revisions_author_type_check" CHECK ("author_type" in ('user', 'agent', 'system'));
ALTER TABLE "note_tags" ADD CONSTRAINT "note_tags_origin_check" CHECK ("origin" in ('user', 'ai'));
ALTER TABLE "notes" ADD CONSTRAINT "notes_origin_check" CHECK ("origin" in ('user', 'ai'));
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_kind_check" CHECK ("kind" in ('note_update', 'link_create', 'link_delete', 'note_merge', 'bulk_organize', 'moc_update'));
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_status_check" CHECK ("status" in ('pending', 'approved', 'rejected', 'applied', 'failed', 'stale', 'cancelled'));
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_risk_level_check" CHECK ("risk_level" in ('low', 'medium', 'high'));
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_origin_check" CHECK ("origin" in ('user', 'ai'));

-- 0002_lovely_power_pack.sql
ALTER TABLE "notes" ADD COLUMN "deleted_at" timestamp with time zone;

-- 0003_lean_bloodscream.sql
ALTER TABLE "links" ADD COLUMN "deleted_at" timestamp with time zone;
```

---

## 八、⚠️ 中间态警告（复核中最重要的发现）

**`0000` 建的外键全部是 `cascade`，`0001` 才把它们改成 `restrict`。**

这意味着：**如果只执行 `0000` 而不执行 `0001`**，数据库会停留在一个**危险中间态**——删笔记会级联删掉修订、提议与正式关系（正是我们花了几轮决策要避免的行为），而且没有任何 CHECK 约束。

| 只执行 | 结果 |
|---|---|
| 仅 `0000` | ❌ **危险**：cascade 外键 + 无 CHECK + 无 `deleted_at` |
| `0000` + `0001` | ⚠️ 可用：RESTRICT + 11 个 CHECK，但没有墓碑列 |
| `0000` + `0001` + `0002` + `0003` | ✅ **完整目标状态** |

**因此：必须按序全部执行，不存在"先跑一部分看看"的安全选项。** 建议用 `drizzle-kit migrate` 一次性执行全部待应用迁移，而不是手工逐条执行。

---

## 九、执行前置条件（未执行，供授权后使用）

1. **确认目标分支**：`.neon` 的 `branch` 与 `.env.local` 的 `NEON_BRANCH` 都必须是 `dev`（当前已满足）。
2. **确认 `0000` 是否已在别处执行过**：若某环境已执行过 `0000`，`drizzle-kit migrate` 会依据 `__drizzle_migrations` 表跳过已应用项——**这依赖该表的存在**；若数据库里没有 `drizzle` schema，则视为全新库。**production 我不连接、不检查，此项由你确认。**
3. **数据预检（加 CHECK 前）**：目标库若已有数据，用 09 号文件第四节那组 `select` 检查违规行，**期望 0 行**。空库可跳过。
4. **使用直连串**（`DATABASE_URL_UNPOOLED`），不要用池化串执行迁移。
5. **保留执行输出**：`drizzle-kit migrate` 的输出要留存，作为"何时、对哪个分支执行了什么"的证据。

---

## 十、执行后验证（在 dev 上，供授权后使用）

1. 表数量：`select count(*) from information_schema.tables where table_schema='public'` → 期望 **11**
2. 迁移记录：`drizzle` schema 下 `__drizzle_migrations` 应有 **4** 条
3. CHECK：`select count(*) from pg_constraint where contype='c' and connamespace='public'::regnamespace` → 期望 **11**
4. 外键行为：`confdeltype` 对 `note_revisions` / `proposals` / `links`(两端) 应为 **`r`（restrict）**；`note_tags` / `note_ai_metadata` 为 `c`（cascade）；`notes.raw_id` 为 `r`
5. 新列：`raw_notes.archived_at`、`notes.deleted_at`、`links.deleted_at` 均存在且可空
6. 负向测试：插入非法 `proposals.status` → 必须报错；建笔记 + 修订后删笔记 → 必须报外键违例

---

## 十一、回滚限制

- **Drizzle 没有 down 迁移**。回滚需手写反向 SQL（删 11 个 CHECK、4 个外键改回 cascade、`DROP COLUMN` 三列），其中 `DROP COLUMN` 会丢数据（当前全空，实际无损）。
- **更省事的兜底**：因为目标库为空，直接删掉这 11 张表即可回到初始状态——**但这是破坏性操作，只能在 dev 上做**。
- 一旦有真实数据，回滚必须依赖备份或 Neon 即时恢复——**而免费套餐的即时恢复只有 6 小时窗口**（见 12 号文件），这是真实限制，请在授权前纳入考虑。

---

*本文档只做复核：未执行迁移、未连接任何数据库、未触碰 production。所有 SQL 与 metadata 均来自实际文件读取（含 SHA256 与 journal 原文）。*
