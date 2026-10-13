# AI Notes — Schema & API Contract

> English identifiers are the stable contract. 中文注解用于解释业务语义与设计取舍。
> 本文只描述**已实现**的状态；未实现的部分统一标注 `NOT IMPLEMENTED`，不要按本文当作已完成。
> 数据库：PostgreSQL（Neon）· ORM：Drizzle · 迁移：`drizzle/`

---

## 1. Scope and Architecture

```
HTTP API (app/api/**/route.ts)   ← 只做解析、调用服务、映射错误
        ↓
Services (lib/services/*)        ← 业务规则 + 归属过滤的唯一落点
        ↓
Drizzle (lib/db/schema.ts)       ← 表定义、约束、枚举
        ↓
Neon PostgreSQL
```

**中文注解 · 为什么归属过滤必须在服务层**：路由只负责 HTTP 语义，MCP / 内置 Agent / 网页前端将来都调用同一套服务函数。把 `user_id` 条件写在服务层，任何新入口都自动继承隔离规则；写在路由里就会漏。

`NOT IMPLEMENTED`：MCP server（本地 stdio / 远程 HTTP）、内置 Agent、自动写入白名单策略引擎、变更提议（proposals）流程。

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
| `version` | integer NOT NULL DEFAULT 1 | 预留 |
| `archived_at` | timestamptz NULL | 归档 = 普通"移除"；**没有** `deleted_at` |
| `created_at` / `updated_at` | timestamptz NOT NULL DEFAULT now() | `updated_at` 由服务层显式写入 |

### `notes` — 知识页

| column | type | notes |
|---|---|---|
| `id` | text PK | `knowledge_<uuid>` |
| `user_id` / `raw_id` | text NOT NULL | `raw_id → raw_notes.id ON DELETE RESTRICT`（知识页必须有出处）|
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

`id` · `user_id` · `source_note_id` / `target_note_id → notes.id ON DELETE RESTRICT` · `type`（CHECK: `related`）· `reason` · `origin`（CHECK `user|ai`）· `proposal_id` · `deleted_at` · `created_at`
唯一索引 `(user_id, source_note_id, target_note_id, type)`

**中文注解 · 两条关键约束**：① 两端外键是 RESTRICT，删笔记不会静默清掉已确认的关系；② 唯一索引是**完整索引、不是部分索引**，所以"重建一条已软删的关系"必须**复活原行**（清空 `deleted_at`），不能插入新行。

### `note_ai_metadata` — AI 候选元数据（与正文分离）

`id` · `user_id` · `note_id → notes.id ON DELETE CASCADE`（唯一）· `ai_summary` · `candidate_concepts` / `candidate_keywords` / `extracted_entities`（jsonb）· `classification` · `status` · `model_name` · `source_version` · `created_at` / `updated_at`

`status` **故意没有 CHECK**：合法值集与转换规则未确认，且当前**没有任何写入路径**。

### 其余表

- `proposals`（提议）：字段齐全，`kind` / `status` / `risk_level` / `origin` 均有 CHECK，`target_note_id → notes.id ON DELETE RESTRICT`。`NOT IMPLEMENTED`：流程与 API。
- `audit_log`：**没有任何外键**，因此任何级联都影响不到它。当前唯一写入方是 `PATCH /api/raw/:id`（原始记录修改的修订记录，见 §1 与 §4）。
- `idempotency_keys`：`PRIMARY KEY (user_id, key)`。`NOT IMPLEMENTED`：使用。
- `agent_tokens`：远程 MCP 凭据（`token_hash` 唯一）。`NOT IMPLEMENTED`：签发与校验。

**枚举的唯一来源是 `lib/db/enums.ts`**：数据库 CHECK、列的 TS 联合类型、以及后续 API 校验都从它引用。

**`.neon` 里另有 Neon Auth 的 9 张表，位于独立的 `neon_auth` schema**，与本契约无关。

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
| `POST /api/raw` | `{ text }` | `201 { raw }` | 空 / 超长 → 400 |
| `DELETE /api/raw` | `{ rawId }` | `200 { deleted, archived: true }` | **归档**，非物理删除；被知识页引用 → 409 |
| `PATCH /api/raw/:id` | `{ text }` | `200 { raw, changed }` | `user_edit`：只有 `user` 主体可用（Agent → `403 USE_PROPOSAL_FLOW`）；每次改动写一条 `audit_log` 修订记录；正文相同 → `changed: false` 且不写库；不存在 / 已归档 / 非本人 → `404 RAW_NOT_FOUND` |
| `GET /api/knowledge` | — | `200 { knowledges: Knowledge[] }` | 排除归档 / 墓碑 |
| `POST /api/knowledge` | `{ rawId, draft, origin? }` | `201 { knowledge, created: true }` | 幂等；已存在 → `200 created:false`；`origin` 默认 `user` |
| `GET /api/knowledge/:id` | — | `200 { knowledge, raw }` | `raw` 可能为 `null` |
| `PATCH /api/knowledge/:id` | 字段 + 可选 `version` | `200 { knowledge }` | 带 `version` 且不匹配 → `409 VERSION_CONFLICT`（不写入）|
| `GET /api/knowledge/:id/relations` | — | `200 { relations }` | |
| `GET /api/knowledge/:id/backlinks` | — | `200 { backlinks: Knowledge[] }` | 反查对端 |
| `GET /api/relations` | — | `200 { relations }` | 排除已软删 |
| `POST /api/relations` | `{ sourceId, targetId, type:"related", reason }` | `201 { relation, created: true }` | **无序对**去重；重复 → `200 created:false`；已软删则复活 |
| `DELETE /api/relations/:id` | — | `204` | **软删除**；不存在 → 404 |
| `GET /api/graph` | — | `200 { nodes, edges }` | 边仅保留两端都存在的笔记 |
| `POST /api/organize` | `{ rawId }` | `200 { draft }` | 需 `DEEPSEEK_API_KEY`；缺 → `503` |
| `POST /api/assistant` | `{ question, contextType, contextId? }` | `200 { answer }` | 同上；`contextType`: `knowledge \| raw \| draft \| none` |

`Knowledge` 响应字段：`id, rawId, title, summary, content, keyPoints[], concepts[], keywords[], version?, createdAt, updatedAt`。

---

## 5. Error Codes

`INVALID_JSON` · `INVALID_BODY` · `TEXT_REQUIRED` · `TEXT_EMPTY` · `TEXT_TOO_LONG` · `RAW_ID_REQUIRED` · `RAW_NOT_FOUND` · `RAW_REFERENCED_BY_KNOWLEDGE` · `USE_PROPOSAL_FLOW` · `INVALID_DRAFT` · `INVALID_ORIGIN` · `INVALID_TITLE` / `INVALID_SUMMARY` / `INVALID_CONTENT` / `INVALID_KEY_POINTS` / `INVALID_CONCEPTS` / `INVALID_KEYWORDS` · `EMPTY_PATCH` · `INVALID_VERSION` · `VERSION_CONFLICT` · `KNOWLEDGE_NOT_FOUND` · `SOURCE_ID_REQUIRED` / `TARGET_ID_REQUIRED` · `SELF_RELATION` · `RELATION_TYPE_INVALID` · `RELATION_REASON_REQUIRED` · `RELATION_NOT_FOUND` · `*_STORAGE_READ_FAILED` / `*_STORAGE_WRITE_FAILED` / `*_STORAGE_DELETE_FAILED` · `DEEPSEEK_CONFIG_MISSING` / `DEEPSEEK_TIMEOUT` / `DEEPSEEK_UPSTREAM_ERROR`

**中文注解**：错误消息面向用户（说明发生了什么、数据是否安全、下一步做什么），不暴露数据库原文、堆栈或凭据。

---

## 6. Versioning and Idempotency

- `notes.version` 每次更新 +1；`PATCH` 可带 `version` 做乐观并发（不匹配 → 409，不写入）。**当前界面尚未发送 `version`**（不带则 last-write-wins）。
- `POST /api/knowledge` 按 `raw_id` 幂等；`POST /api/relations` 按**无序对**幂等。
- `DELETE /api/raw` / `DELETE /api/relations/:id` 天然幂等：重复操作影响 0 行 → 404。
- `idempotency_keys` 表已建但**未被使用**。

---

## 7. Migration and Deployment

- 迁移文件：`drizzle/0000`–`0003`。**已在 dev 分支执行**；**production 分支未执行任何迁移**。
- 应用运行期使用**池化**连接串（`DATABASE_URL`）；迁移与 `pg_dump` 使用**直连**串（`DATABASE_URL_UNPOOLED`）。
- 环境变量：本地 `.env.local`（已 gitignore）；部署平台在站点设置里配置（不要写进仓库）。
- `NOT IMPLEMENTED`：部署、Neon 连接在生产环境的验证、备份机制（当前依赖 Neon 免费套餐的 6 小时即时恢复窗口）。

**中文注解 · 恢复能力的真实边界**：Neon 免费套餐的历史窗口上限是 **6 小时**（实测该项目 `history_retention_seconds = 21600`）。超过 6 小时的误操作没有内容级恢复手段，这也是 purge 必须有二次确认的原因。

---

## 8. Verification

| 脚本 | 作用 |
|---|---|
| `scripts/db-verify.mjs` | 表 / 约束 / 外键行为 / 新增列 / 枚举 CHECK / RESTRICT（写入测试全部回滚）|
| `scripts/b1–b4-verify.mjs` | 四个批次的端到端验证（需 `pnpm dev`）|
| `scripts/isolation-verify.mjs` | 跨用户归属隔离（覆盖全部入口）|
| `scripts/cleanup-verify-rows.mjs` | 安全网：清理验证遗留数据 |
