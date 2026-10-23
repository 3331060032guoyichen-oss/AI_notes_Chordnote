# AI Notes — Schema & API Contract

> English identifiers are the stable contract. 中文注解用于解释业务语义与设计取舍。
> 本文只描述**已实现**的状态；未实现的部分统一标注 `NOT IMPLEMENTED`，不要按本文当作已完成。
> 数据库：本机 **PGlite**（PostgreSQL 的 WASM 版，跑在应用进程内，数据在 `data/pglite`）· ORM：Drizzle · 迁移：`drizzle/`

---

## 1. Scope and Architecture

```
HTTP API (app/api/**/route.ts)   ← 只做解析、调用服务、映射错误
        ↓
Services (lib/services/*)        ← 业务规则 + 归属过滤的唯一落点
        ↓
Drizzle (lib/db/schema.ts)       ← 表定义、约束、枚举
        ↓
PGlite（本机，data/pglite）
```

**中文注解 · 为什么归属过滤必须在服务层**：路由只负责 HTTP 语义，MCP / 整理助手 / 网页前端都调用同一套服务函数。把 `user_id` 条件写在服务层，任何新入口都自动继承隔离规则；写在路由里就会漏。

`NOT IMPLEMENTED`：MCP server（本地 stdio / 远程 HTTP）、自动写入白名单策略引擎。

**已实现的两条 AI 写入路径**：整理助手（`POST /api/agent/organize`）与编辑助理（`POST /api/assistant/propose`）。两者都只**提议**——真正写库要等 `/api/proposals/:id` 批下来再 `apply`（见 §4）。

**已实现的一处审计写入**：修改原始记录正文（`PATCH /api/raw/:id`）会在同一事务里写一条 `audit_log`（`operation = 'raw.update'`，`detail = { before, after, version }`）作为修订记录。除此之外没有其他审计写入。

**jsonb 编码约定**：`concepts` / `key_points` / `keywords` / `detail` 等 jsonb 列，写入时**直接传数组或对象**，不要再手动 `JSON.stringify`——Drizzle 的 `jsonb` 列在 `mapToDriverValue` 里已经 stringify 一次，手动再包一层会让库里存下 jsonb 字符串（读的时候被 Drizzle 透明还原，所以不会报错，但 SQL 层 `->`、`?`、GIN 索引全都失效）。

---

## 2. Data Model

All business tables carry `user_id text NOT NULL`. 所有时间列为 `timestamptz`。主键为 `text`。

### `raw_notes` — 原始记录（用户可改 / AI 不可改）

| column | type | notes |
|---|---|---|
| `id` | text PK | `raw_<uuid>` |
| `user_id` | text NOT NULL | indexed |
| `text` | text NOT NULL | 长度上限在 API 层校验（50000）|
| `title` | text NULL | 用户起的名字（迁移 0004）；为空时界面显示「未命名 N」|
| `version` | integer NOT NULL DEFAULT 1 | 每次 `PATCH /api/raw/:id` +1 |
| `archived_at` | timestamptz NULL | 归档 = 普通"移除"；**没有** `deleted_at` |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | `updated_at` 由服务层显式写入 |

### `notes` — 知识页

| column | type | notes |
|---|---|---|
| `id` | text PK | `knowledge_<uuid>` |
| `user_id` / `raw_id` | text NOT NULL | `raw_id → raw_notes.id ON DELETE RESTRICT`（知识页必须有出处）。它只表示**主要来源**；一个 Raw 可以产出多张页，来源关系以 `note_sources` 为准 |
| `title` / `summary` / `content` | text NOT NULL | |
| `key_points` / `concepts` / `keywords` | jsonb NOT NULL DEFAULT `[]` | 用户确认后的结构化字段 |
| `version` | integer NOT NULL DEFAULT 1 | 乐观并发用；每次更新 +1 |
| `origin` | text NOT NULL DEFAULT `user` | CHECK: `user` \| `ai` |
| `archived_at` / `deleted_at` | timestamptz NULL | 收起 / 墓碑（常规查询排除 `deleted_at`）|

### `note_revisions` — 修订历史（不可变）

`id` · `user_id` · `note_id → notes.id ON DELETE RESTRICT` · `version` · `title/summary/content` · `key_points/concepts/keywords` · `author_type`（CHECK `user|agent|system`）· `author_id` · `proposal_id` · `created_at`

**中文注解**：每次创建（v1）与更新（v+1）都写一条完整快照，因此单条修订自身即可读；外键是 RESTRICT，删笔记不会带走历史。

### `tags` / `note_tags`

`tags`: `id` · `user_id` · `name` · `normalized_name`（唯一 `(user_id, normalized_name)`）· `created_at`
`note_tags`: `note_id` · `tag_id` · `origin`（CHECK `user|ai`）· PK `(note_id, tag_id)`；两个外键都是 CASCADE

`NOT IMPLEMENTED`：标签的读写 API（表已建，服务层未实现）。

### `links` — 正式关系

`id` · `user_id` · `source_note_id` / `target_note_id → notes.id ON DELETE RESTRICT` · `type`（CHECK: `related` / `supports` / `contradicts` / `example` / `prerequisite`）· `reason` · `evidence` · `origin`（CHECK `user|ai`）· `proposal_id` · `deleted_at` · `created_at`
唯一索引 `(user_id, source_note_id, target_note_id, type)`

**方向语义**：`related` 无方向，A→B 与 B→A 视为同一条；其余四种有方向，按方向去重，且建立时必须带 `evidence`。

**中文注解 · 两条关键约束**：① 两端外键是 RESTRICT，删笔记不会静默清掉已确认的关系；② 唯一索引是**完整索引、不是部分索引**，所以"重建一条已软删的关系"必须**复活原行**（清空 `deleted_at`），不能插入新行。

### `note_ai_metadata` — AI 候选元数据（与正文分离）

`id` · `user_id` · `note_id → notes.id ON DELETE CASCADE`（唯一）· `ai_summary` · `candidate_concepts` / `candidate_keywords` / `extracted_entities`（jsonb）· `classification` · `status` · `model_name` · `source_version` · `created_at` / `updated_at`

`status` **故意没有 CHECK**：合法值集与转换规则未确认，且当前**没有任何写入路径**。

### 其余表

- `proposals`（提议）：字段齐全，`kind` / `status` / `risk_level` / `origin` 均有 CHECK，`target_note_id → notes.id ON DELETE RESTRICT`。流程与 API 都已实现（`/api/proposals*`，状态流转见 §4）。
- `audit_log`：**没有任何外键**，因此任何级联都影响不到它。当前唯一写入方是 `PATCH /api/raw/:id`（原始记录修改的修订记录，见 §1 与 §4）。
- `idempotency_keys`：`PRIMARY KEY (user_id, key)`。唯一使用方是 `/api/proposals/:id/apply`（幂等键优先取 `Idempotency-Key` 请求头，其次取请求体里的 `idempotencyKey`）。
- `agent_tokens`：远程 MCP 凭据（`token_hash` 唯一）。`NOT IMPLEMENTED`：签发与校验。

**枚举的唯一来源是 `lib/db/enums.ts`**：数据库 CHECK、列的 TS 联合类型、以及后续 API 校验都从它引用。

**本机库里只有 `public` 一个 schema、11 张表**（`pnpm verify:db` 在内存库上实测）。除 `drizzle/` 里的迁移外没有额外 schema、扩展或初始化脚本；换机器时把 `data/` 拷过去即可，无需再做任何数据库侧准备。

---

## 3. Ownership and Authorization

- 演示期为**隐式单用户**：`lib/auth/context.ts` 的 `getUserContext()` 从服务端环境变量 `DEFAULT_OWNER_ID` 取用户标识（默认 `demo-user`）。**绝不从请求参数取身份。**
- 服务层**所有**查询、更新、删除都带 `user_id` 条件；新建记录的 `user_id` 由服务端上下文赋值。
- `lib/auth/authorize.ts` 提供 `assertOwner()` 与 `requireUserActor()`。`requireUserActor()` 已由 `PATCH /api/raw/:id` 调用：非 `user` 主体（将来的 Agent）会被拒，返回 `403 USE_PROPOSAL_FLOW`。`assertOwner()` 仍未单独调用——归属过滤目前由服务层的 `user_id` 条件承担。
- `ACTOR_TYPES = user | agent | system`，但当前只有 `user` 会实际出现。

**中文注解**：将来接入真实登录时，只需替换 `getUserContext()` 的实现，业务层不动。

---

## 4. HTTP API Contract

错误响应统一为 `{ "error": { "code": string, "message": string } }`。

| Method & Path | Request | Success | Notes |
|---|---|---|---|
| `GET /api/raw` | — | `200 { raws: Raw[] }` | 排除已归档 |
| `GET /api/raw?scope=archived` | — | `200 { raws: Raw[] }` | 只返回已归档的原始记录（左栏「已归档」分组用），与 `/api/knowledge?scope=archived` 同口径 |
| `POST /api/raw` | `{ text, title? }` | `201 { raw }` | 空 / 超长 → 400；`title` 可选，非字符串或超长 → 400 |
| `DELETE /api/raw` | `{ rawId }` | `200 { deleted, archived: true }` | **归档**，非物理删除；被**未归档的**知识页引用 → `409 RAW_REFERENCED_BY_KNOWLEDGE`（那一页归档后即可移除）|
| `PATCH /api/raw/:id` | `{ text }` | `200 { raw, changed }` | `user_edit`：只有 `user` 主体可用（Agent → `403 USE_PROPOSAL_FLOW`）；每次改动写一条 `audit_log` 修订记录；正文相同 → `changed: false` 且不写库；不存在 / 已归档 / 非本人 → `404 RAW_NOT_FOUND` |
| `GET /api/knowledge` | — | `200 { knowledges: Knowledge[] }` | 排除归档 / 墓碑 |
| `GET /api/knowledge?scope=archived` | — | `200 { knowledges: Knowledge[] }` | 只返回已归档的页（左栏「已归档」分组用）|
| `POST /api/knowledge` | `{ rawId, draft, origin? }` | `201 { knowledge, created: true }` | 幂等；已存在 → `200 created:false`；`origin` 默认 `user` |
| `GET /api/knowledge/:id` | — | `200 { knowledge, raw }` | `raw` 可能为 `null` |
| `PATCH /api/knowledge/:id` | 字段 / `{ archived }` + 可选 `version` | `200 { knowledge }` | `archived: true/false` 即归档 / 恢复（不写修订，只写审计）；带 `version` 且不匹配 → `409 VERSION_CONFLICT`（不写入）|
| `GET /api/knowledge/:id/relations` | — | `200 { relations }` | |
| `GET /api/knowledge/:id/backlinks` | — | `200 { backlinks: Knowledge[] }` | 反查对端 |
| `GET /api/relations` | — | `200 { relations }` | 排除已软删 |
| `POST /api/relations` | `{ sourceId, targetId, type:"related", reason }` | `201 { relation, created: true }` | **无序对**去重；重复 → `200 created:false`；已软删则复活 |
| `DELETE /api/relations/:id` | — | `204` | **软删除**；不存在 → 404 |
| `GET /api/graph` | — | `200 { nodes, edges }` | 边仅保留两端都存在的笔记 |
| `POST /api/organize` | `{ rawId }` | `200 { draft }` | 需已配置 provider；缺凭据 → `503 DEEPSEEK_CONFIG_MISSING` |
| `POST /api/assistant` | `{ question, contextType, contextId? }` | `200 { answer }` | 同上；`contextType`: `knowledge \| raw \| draft \| none` |
| `POST /api/assistant/propose` | `{ knowledgeId, question? }` | `200 { proposal }` | 编辑助理对一张知识页提出**改写正文**的提议（`note_update`），只落 `pending`，不写正文 |
| `POST /api/agent/organize` | `{ question, contextType, contextId?, draftContext?, sessionId? }` | `200 { trace }` | Agent 工具循环，返回 `trace.sessionId`；服务端保留最近完整对话轮次，写操作只创建 pending 提议 |
| `POST /api/agent/session` | `{ sessionId }` | `200 { ended: true }` | 追加结束日志并清除当前用户会话；忙碌返回 409，不存在或失效返回 404 |
| `GET /api/audit` | `?limit=1–200` | `200 { events }` | 只读操作日志，供 Wiki Log 使用；按用户隔离，默认 50 条 |
| `GET /api/proposals` | `?status=&targetNoteId=` | `200 { proposals }` | 提议列表 |
| `POST /api/proposals` | 提议内容 | `201 { proposal }` | 提交提议 |
| `POST /api/proposals/:id/approve` `reject` `apply` | — | `200` | 决议与执行；`apply` 需要已 `approved`，支持 `Idempotency-Key`；目标版本变了 → 提议推进到 `stale` |
| `GET /api/export` | `?format=markdown` | `200` JSON 全量快照 / `application/zip` | 默认 JSON（原始记录 + 知识页 + 关联 + 修订历史）；`format=markdown` 返回 README + notes/*.md + sources/*.md 的 zip |
| `POST /api/import` | 知识包 JSON | `200 { dryRun, result }` | `?dryRun=1` 只算数不写库；同名（原始记录没有标题时按正文）一律保留已有、跳过导入 |
| `GET /api/health` | — | `200 { status:"ok", database:"ok" }` / `503` | 桌面宿主轮询；首次调用会触发 PGlite 初始化与迁移 |
| `POST /api/desktop/shutdown` | header `x-chordnote-shutdown-token` | `200 { status:"shutting_down" }` | 仅 Tauri 宿主；令牌不匹配 → `404` |

`/api/*` 在进入路由前经过 `middleware.ts`：Host 必须是回环地址；写请求（POST / PATCH / PUT / DELETE）还要求 Origin 来自本机页面（桌面模式下固定 `127.0.0.1:3210`）。

`Knowledge` 响应字段：`id, rawId, title, summary, content, keyPoints[], concepts[], keywords[], version?, createdAt, updatedAt`。

> **没有 `POST /api/notes`。** 它曾经是一次写出 raw + knowledge 的捷径，2026-10-17 删除 —— 那等于绕过「整理助手提议 → 用户确认」这一步。新建只写 Raw。

---

## 5. Error Codes

`INVALID_JSON` · `INVALID_BODY` · `TEXT_REQUIRED` · `TEXT_EMPTY` · `TEXT_TOO_LONG` · `RAW_ID_REQUIRED` · `RAW_NOT_FOUND` · `RAW_REFERENCED_BY_KNOWLEDGE` · `USE_PROPOSAL_FLOW` · `INVALID_DRAFT` · `INVALID_ORIGIN` · `INVALID_TITLE` / `INVALID_SUMMARY` / `INVALID_CONTENT` / `INVALID_KEY_POINTS` / `INVALID_CONCEPTS` / `INVALID_KEYWORDS` · `EMPTY_PATCH` · `INVALID_VERSION` · `VERSION_CONFLICT` · `KNOWLEDGE_NOT_FOUND` · `SOURCE_ID_REQUIRED` / `TARGET_ID_REQUIRED` · `SELF_RELATION` · `RELATION_TYPE_INVALID` · `RELATION_REASON_REQUIRED` · `RELATION_NOT_FOUND` · `*_STORAGE_READ_FAILED` / `*_STORAGE_WRITE_FAILED` / `*_STORAGE_DELETE_FAILED` · `DEEPSEEK_CONFIG_MISSING` / `DEEPSEEK_TIMEOUT` / `DEEPSEEK_UPSTREAM_ERROR`

**中文注解**：错误消息面向用户（说明发生了什么、数据是否安全、下一步做什么），不暴露数据库原文、堆栈或凭据。

---

## 6. Versioning and Idempotency

- `notes.version` 每次更新 +1；`PATCH` 可带 `version` 做乐观并发（不匹配 → 409，不写入）。**当前界面尚未发送 `version`**（不带则 last-write-wins）。
- `POST /api/knowledge` 按 **（`raw_id`, 标题, 正文）** 幂等：同一份材料提交同一标题与同一正文返回已有页（`created: false`）；否则新建，标题重复时自动追加 1、2 编号。`POST /api/relations` 按**无序对**幂等。
- `DELETE /api/raw` / `DELETE /api/relations/:id` 天然幂等：重复操作影响 0 行 → 404。
- `idempotency_keys` 的唯一使用方是 `/api/proposals/:id/apply`：首次执行会记下 `(user_id, key)` 与响应，同键重放直接返回当时的响应，不会重复写正式数据。

---

偏好更新使用 `schema_preferences` 提议，payload 为 `{ content, schemaHash, evidence }`；只替换 Schema 的用户偏好区块。确认前不写文件，hash 过期转为 `stale`。上下文与审批细节见 [Agent 上下文](AGENT_CONTEXT.md)。

## 7. Migration and Local Database

- 迁移文件：`drizzle/0000`–`0008`（9 个 SQL）。应用启动时由 `lib/db/client.ts` 的 `migrate()` 按 journal **增量**执行，已应用过的跳过。0008 为提议类型增加 `schema_preferences`，不新增记忆表。
- 数据目录：`data/pglite`（可用 `PGLITE_DATA_DIR` 改）；桌面安装包版是 `%LOCALAPPDATA%\Chordnote\db`。本机数据不进版本库，仓库里只有 `data/.gitkeep`。
- **单写者**：同一份数据目录同一时刻只能有一个进程写。不要一边跑 `pnpm dev` 一边让别的进程去连同一目录 —— 它读到的是打开那一刻的快照，写回去的内容还会被应用随后的写入覆盖（"删了像没删"）。脚本要跟库打交道，要么走 HTTP 接口（`scripts/regression.mjs`），要么自己起一份内存库（`scripts/db-verify.mjs`）。
- 备份与恢复：**拷走 `data/` 目录就是完整备份**；界面里的「导出知识包」（`GET /api/export`）给出可读、可再导入的快照。没有云端历史窗口，恢复能力等于你手上那份拷贝。
- 环境变量都可选：`DEEPSEEK_API_KEY`（旧名，provider=deepseek 时仍生效）、`CHORDNOTE_PROVIDER` / `CHORDNOTE_MODEL` / `CHORDNOTE_BASE_URL` / `CHORDNOTE_API_KEY` / `CHORDNOTE_TIMEOUT_MS`、`CHORDNOTE_SETTINGS_FILE`、`PGLITE_DATA_DIR`。桌面宿主还会注入 `CHORDNOTE_DESKTOP` / `CHORDNOTE_SHUTDOWN_TOKEN` / `CHORDNOTE_MIGRATIONS_DIR` / `CHORDNOTE_LOG_DIR`。**没有任何连接串**。
- `NOT IMPLEMENTED`：多设备 / 多人共享同一份知识库的同步机制。

**中文注解 · 为什么 purge 要二次确认**：本地库没有历史窗口，误删之后只能靠之前的 `data/` 拷贝或知识包还原，中间没有"回滚 6 小时"这种东西。

---

## 8. Verification

| 脚本 | 命令 | 作用 |
|---|---|---|
| `scripts/db-verify.mjs` | `pnpm verify:db` | 在**内存库**上跑一遍迁移，断言 11 张表 / 11 个 CHECK / 8 个外键（含 RESTRICT 行为）/ 索引落地 / jsonb 真为数组 / 非法关系类型被拒 / 归属隔离在 SQL 层成立。不需要 dev server，也不碰本机数据 |
| `scripts/regression.mjs` | `pnpm test` | 端到端：**纯 HTTP** 打全部路由（含知识包导出 / 导入、归档视图、404 面），当前 75 条断言。3000 端口空闲时自起临时 dev server |
| `scripts/verify-desktop-runtime.mjs` | `pnpm desktop:verify:runtime` | 用临时数据目录启动打包后的 standalone 服务，验证 `/api/health` 与 `/api/desktop/shutdown` |
| `scripts/seed-demo.mjs` | `pnpm seed:demo` | 按 `seed/demo-notes.json` 幂等写入演示数据。需先 `pnpm dev` |
| `scripts/reset-demo-data.mjs` | `pnpm seed:reset` | 清空业务表。默认 dry-run，`-- --yes` 才执行；**必须先停掉 `pnpm dev`**，删除前把九张表备份到 `.tmp/` |

回归脚本**不连数据库**，因为 PGlite 是单写者（见 §7）。副作用：它造的数据只能归档清场，会在库里留下已归档行（日常视图看不到）。

验证入口是 `pnpm test` / `pnpm test:unit` / `pnpm verify:db` / `pnpm desktop:verify:runtime`；`pnpm seed:*` 两条只负责准备与清理演示数据。2026-10-17 之前那种"另开一个进程直接写库造夹具"的一次性脚本已随存储层改动一并删除——本地库不允许第二个写者，那条路走不通了。
