# Purge（永久清除）流程设计

> 按项目方要求：先审查现状、只输出设计方案，**不改代码、不生成迁移、不执行迁移、不连接任何数据库**。
> production 不连接、不修改；dev 迁移一律等 SQL 复核 + 明确授权。

---

## 更新记录（2026-10-10 第二轮：七条决策已确认，设计已定稿）

七条决策全部确认，本文已据此定稿。**唯一新增的 schema 变更是 `links.deleted_at`**，迁移 `0003_lean_bloodscream.sql` 已生成但**未执行**（未连库、未触碰 production）。

| # | 决策 | 对本设计的影响 |
|---|---|---|
| 1 | 先软删除 / 移入回收站，再单独 purge | 两步走成为硬性前置条件 |
| 2 | MVP 不支持 Agent 提议 purge；Agent 只能建议归档；**不新增 `proposals.kind`** | **枚举迁移需求消失**；Agent 建议以"建议"形式呈现，不落提议表 |
| 3 | links 普通删除改为**可恢复软删除** | **需要新列** → 迁移 `0003` |
| 4 | purge 原因必填（简短） | 进 `audit_log.detail.reason`，无需新列 |
| 5 | 二次确认弹窗 + 永久删除按钮，不要求输入标题 | 纯 UI 行为，无需 schema 变更 |
| 6 | purge 笔记时不级联删除 `raw_notes` | 与本设计原判断一致（raw 独立 purge） |
| 7 | 允许保存标题快照 | manifest 保留 `note.title` |

---

## 〇、审查结论（实测事实，作为设计前提）

| 对象 | 现状 |
|---|---|
| **生命周期实现** | **完全没有**。全仓搜索 `archive / archived / purge / tombstone / softDelete`，只命中 `lib/db/schema.ts` 里的两个列定义——**没有任何服务层或 API 实现** |
| `notes` 的删除接口 | **不存在**。知识页目前没有 archive / soft-delete / restore / purge 任何入口 |
| 现存删除接口 | 只有 2 个，**都是硬删除**：`DELETE /api/raw`（→ JSON 层 `deleteRaw`，被知识页引用时返回 409）、`DELETE /api/relations/[id]`（→ `deleteRelation`，删掉一条正式关系）|
| schema 铺垫 | `notes.archived_at` + `notes.deleted_at` 已就位；`raw_notes.archived_at` 已就位（**未加** `deleted_at`，按决策随存储层重写一起做）|
| 外键现状 | `note_revisions` / `proposals` / `links`(两端) → notes：**RESTRICT**；`note_tags` / `note_ai_metadata` → notes：**CASCADE**；`audit_log`：**无任何外键** |
| 关键表的写入路径 | `note_revisions` / `proposals` / `links` / `audit_log` **都还没有写入代码**（服务层尚未实现）|

**由此得到两个设计前提**：

1. purge 与 archive / soft-delete / restore 是**同一批生命周期工作**，语义必须一起定义，否则会互相打架。
2. 现在定义 purge 的成本最低——因为这些表还没有任何生产数据和写入逻辑。

---

## 一、四个语义与权限边界

| 操作 | 语义 | 可逆 | 允许主体 | 入口 | 审计 |
|---|---|---|---|---|---|
| **archive** | 收起：从常规视图移入"已归档"，数据完整 | ✅ 可 unarchive | `user` | 普通业务 API | 记录（建议）|
| **soft-delete** | 墓碑：常规查询隐藏，行与全部历史保留 | ✅ 可 restore | `user` | 普通业务 API | **必须** |
| **restore** | 恢复：清空 `archived_at` / `deleted_at` | — | `user` | 普通业务 API | 记录（建议）|
| **purge** | **永久清除**：物理删除，**不可逆** | ❌ | **仅 `user`**，且需**独立高风险入口 + 显式确认** | 独立高风险端点 | **必须** |

**三条硬边界**：

1. **Agent（外部或内置）不得执行 purge。** 与已确认的 D3 一致：删除属高风险，必须显式确认 + 服务端强制校验；而给外部 Agent 抹除能力违反最小权限。Agent 若要表达删除意图，只能走提议（是否新增提议类型见"待确认 3"）。
2. **purge 仅限单个用户自己的数据**：全程带 `user_id` 条件，非本人数据一律 `403 FORBIDDEN_RESOURCE`，且**不产生任何删除**。
3. **purge 不是"更狠的删除按钮"，而是合规级操作**：默认路径永远是 archive / soft-delete；purge 只在确有必要时使用。

> **已确认（决策 1）**：删除分两步——先 soft-delete / 移入回收站，再由用户**单独**执行 purge。**purge 只允许作用于已处于软删除状态的笔记**，UI 与 API 两层都以此为前提。

> **适用范围（决策 3）**：`soft-delete` / `restore` 同时适用于 **`notes` 与 `links`**。关系的普通删除改为**可恢复软删除**，常规查询隐藏已删除关系（过滤 `deleted_at is null`）。`purge` 仍只针对笔记与原始记录，不针对单条关系。

---

## 二、各关联表的数据处理

以清除笔记 `N` 为例（`N` 属于当前用户）：

| 表 | 是否清除 | 方式 | 审计要记录什么 |
|---|---|---|---|
| `links`（`source_note_id = N` 或 `target_note_id = N`）| **清除** | **显式 DELETE**（不能靠级联）| 条数 + 每条 `id / source / target / type / origin` |
| `note_revisions`（`note_id = N`）| **清除** | **显式 DELETE** | 条数 + 版本范围 + `author_type` 分布 |
| `proposals`（`target_note_id = N`）| **清除** | **显式 DELETE** | 条数 + `kind` / `status` 分布 |
| `note_tags`（`note_id = N`）| 清除 | 显式 DELETE（便于计数；CASCADE 作兜底）| 条数 |
| `note_ai_metadata`（`note_id = N`）| 清除 | 显式 DELETE（同上）| 条数 + `status` |
| `notes`（`N`）| **清除** | 条件 DELETE，**校验影响行数 = 1** | 该行的元数据快照（见第四节）|
| **`audit_log`** | **保留** | 不动 | **新增一条 purge 审计记录** |
| `raw_notes` | **不连带清除** | 单独 purge（见下）| 若要清 raw，另开一次 purge |
| `tags` | 不清除 | 可能留下孤儿标签，另行清理（本次不处理）| — |
| `idempotency_keys` / `agent_tokens` | 无关 | — | — |

### 2.1 哪些历史必须保留，哪些允许清除

- **必须保留**：`audit_log` 中的审计链。它没有外键，purge 动不到它；而且 purge 本身要**新增**一条审计。
- **允许清除，但必须"说出来"**：`note_revisions`、`proposals`、`links` 在 purge 语义下**会被清除**——这是 purge 的定义。关键在于**不得静默**：必须先在清单里出现、经用户确认、再按固定顺序显式删除、并把计数与标识写进审计。**"不得静默丢弃"的兑现方式是"显式 + 计数 + 留痕"，不是"一律不能删"。**
- **不复制正文**：审计里只保留**元数据**（id、标题、版本、时间、类型），**不复制修订正文**——遵循项目文档"不要无理由复制大量敏感正文"的要求。

### 2.2 允许清除的条件（建议）

同时满足才允许：① 主体是 `user`；② `user_id` 匹配（归属校验）；③ 笔记**已处于墓碑状态**（见待确认 1）；④ 显式确认（见待确认 2/3）；⑤ 单条操作（批量另行设计）。

### 2.3 `raw_notes` 的 purge

`notes.raw_id → raw_notes.id` 是 **RESTRICT**，所以**只要还有笔记引用该原始记录，raw 就删不掉**。设计上：

- raw purge 前先统计引用它的笔记数；**若 > 0，直接返回明确错误**（例如 `RAW_STILL_REFERENCED`，附引用数量），**不要把裸外键报错抛给用户**。
- 只有引用数为 0 时才能 purge raw。
- **建议（待确认 5）**：purge 笔记时**不**连带 purge 它的 raw——两个操作分开，避免一次操作的影响面过大。

---

## 三、外键约束与事务顺序

因为三张关键表对 `notes` 都是 **RESTRICT**，删除顺序**不可颠倒**：必须先删依赖行，最后删笔记本身。

**全程单个事务**，顺序固定：

```
BEGIN
 1. 归属校验 + 状态校验（notes.user_id = 当前用户 且 deleted_at IS NOT NULL）
 2. 采集清单（计数与元数据）          -- 用于确认预览与审计 manifest
 3. DELETE FROM links            WHERE user_id = ? AND (source_note_id = ? OR target_note_id = ?)
 4. DELETE FROM note_revisions   WHERE user_id = ? AND note_id = ?
 5. DELETE FROM proposals        WHERE user_id = ? AND target_note_id = ?
 6. DELETE FROM note_tags        WHERE note_id = ?
 7. DELETE FROM note_ai_metadata WHERE note_id = ?
 8. DELETE FROM notes            WHERE id = ? AND user_id = ?      -- 断言影响行数 = 1
 9. INSERT INTO audit_log (...)  -- operation='note.purge'，detail=manifest
COMMIT
```

**四条实现约束**：

1. **不能依赖 CASCADE 完成关键清理**。`note_tags` / `note_ai_metadata` 虽是 CASCADE，也要显式删除——否则无法在删除前计数，审计会不准。
2. **第 8 步必须校验影响行数**。若非 1（并发、状态变化），**回滚整个事务**并返回明确错误，不能当作成功。
3. **顺序颠倒会立刻触发外键错误**（例如先删 notes 会被 revisions/proposals/links 挡住）。这是 RESTRICT 的保护，不是障碍——它保证"想删笔记必须显式处理历史"。
4. **所有语句都带 `user_id`**，避免任何跨用户删除的可能。

---

## 四、审计记录与追溯

### 4.1 写什么

purge 成功时新增**一条** `audit_log`：

| 字段 | 值 |
|---|---|
| `actor_type` / `actor_id` | `user` / 当前用户 id |
| `operation` | `note.purge` |
| `target_type` / `target_id` | `note` / 被清除的笔记 id |
| `result` | `ok`（失败时写 `failed`，见第六节）|
| `detail` | **manifest**（JSON，见下）|
| `idempotency_key` | 本次请求的幂等键 |

**manifest 内容**：

```json
{
  "note":        { "id", "title", "rawId", "version", "origin", "createdAt", "updatedAt", "archivedAt", "deletedAt" },
  "counts":      { "links", "revisions", "proposals", "noteTags", "aiMetadata" },
  "revisions":   [ { "version", "authorType", "authorId", "createdAt" } ],
  "proposals":   [ { "id", "kind", "status", "createdAt" } ],
  "links":       [ { "id", "sourceNoteId", "targetNoteId", "type", "origin" } ],
  "reason":      "用户填写的清除原因（建议必填）",
  "confirmation": { "method", "confirmedAt" }
}
```

**不含任何正文**（revision 的 title/summary/content、proposal 的 payload 都不进审计）。

### 4.2 目标笔记被清除后的追溯能力（边界必须写清楚）

- **能查到**：因为 `audit_log` 无外键、`target_id` 是裸 text，笔记行消失后**审计行依然存活**。可以回答"**谁、何时、清除了哪条 id、当时它有多少修订/提议/关系**"，并凭 manifest 里的 `title` 快照认出是哪条。
- **查不到**：**内容本身**。purge 的定义就是抹除，**内容不可恢复**。
- **要内容级恢复**：只能依赖 purge **之前**的 `pg_dump` 备份或 Neon 即时恢复——这也是为什么备份机制（决策 D9）是 purge 的前提条件，而不是可选项。
- **失败也要留痕**：purge 失败（`result='failed'`）同样写审计，因为"一次被拒绝或失败的清除尝试"本身是有价值的安全事件。

---

## 五、入口与统一规则（HTTP / Agent / MCP）

**规则只有一套，实现在服务层**（`lib/services/lifecycle.ts` + `lib/services/purge.ts`），三个入口都只是薄包装，判定发生在服务层，因此没有入口能绕过。

| 入口 | archive / soft-delete / restore | purge |
|---|---|---|
| 用户 HTTP API | ✅ 普通端点 | ✅ **独立高风险端点**（需显式确认参数）|
| 用户界面 | ✅ | ✅ 走同一端点，带二次确认 |
| 外部 Agent（HTTP）| ❌ 需走提议 | ❌ **无入口**（`403 FORBIDDEN_OPERATION`）|
| MCP 工具 | ❌ 不提供删除类工具；仅 `propose_*` | ❌ **不提供 purge 工具** |
| 内置 Agent | ❌ 同上 | ❌ 同上 |

**结论**：**规则统一，入口可用性不同**——这与已确认的 D3（`user_edit` / `agent_auto_write` / `agent_proposal` 三类主体分流）完全一致：purge 属高风险，只有 `user` 主体能执行。

> **已确认（决策 2）**：MVP **不新增 `proposals.kind`**。Agent **不得提议 purge**；Agent 最多**建议归档**，且以"建议"形式呈现（走 AI 建议/元数据通道，**不落 proposals 表**）。**永久清除只能由用户在 UI 手动发起。**

---

## 六、失败、重试、重复请求与"部分清除"

| 场景 | 策略 |
|---|---|
| **部分清除** | **不存在**。purge 是单事务：要么全部完成，要么完全不做。这是刻意的设计选择，也是它比"逐条删除"更安全的原因 |
| 事务中途失败 | **全部回滚**；笔记与其修订/提议/关系**原样保留**；写一条 `result='failed'` 审计；返回可读错误（不回传数据库原文）|
| 网络超时后重试 | 安全：单事务 + 幂等键，重试不会产生第二次副作用 |
| **重复请求** | **必须带 `Idempotency-Key`**。第二次请求返回**第一次的结果**（成功或失败），而不是报"笔记不存在"——否则客户端无法区分"我删成功了"和"本来就没了" |
| 并发两次 purge | 第二条在条件删除时影响 0 行 → 回滚 → 返回冲突/幂等结果；审计只应有**一条**成功记录（建议在事务开头对目标行 `SELECT ... FOR UPDATE` 以串行化）|
| 批量 purge | **本期不支持**。若将来需要，必须另行设计"逐项事务 + 准确的部分失败报告"，不得把部分成功报成全部成功 |

> **已确认（决策 4）**：purge **必填简短原因**；该原因写入 `audit_log.detail.reason`。
> **已确认（决策 5）**：确认方式为**明确的二次确认弹窗 + 永久删除按钮**（不要求用户输入笔记标题）。
> **已确认（决策 7）**：manifest **允许保留标题快照**（`note.title`），便于事后识别被清除的是哪条。

---

## 七、测试用例

需要先引入测试框架（项目目前**没有任何测试**，Phase D 已列入计划）。

| # | 用例 | 期望 |
|---|---|---|
| T1 | purge 一条有 links + revisions + proposals + tags + metadata 的笔记 | 依赖行全部消失、note 行消失、**审计新增 1 条且 counts 与事实一致** |
| T2 | purge 一条无任何依赖的笔记 | 成功；counts 全为 0 |
| T3 | purge 不存在的 id | `404`（或幂等返回首次结果）|
| T4 | 同一 `Idempotency-Key` 重复 purge | **只执行一次**；审计只有 1 条；两次响应一致 |
| T5 | 并发两次 purge | 一次成功、一次冲突；审计仅 1 条成功记录 |
| T6 | 用别人的 `user_id` / 别人的笔记 id | `403`；**什么都删不掉** |
| T7 | Agent 主体调用 purge 端点 | `403`；**什么都删不掉** |
| T8 | 在事务中注入失败 | **全部回滚**；笔记与依赖行仍在；写 `failed` 审计 |
| T9 | purge 后按 `target_id` 查审计 | 能查到那条 purge 记录，且 manifest 含 title 与 counts |
| T10 | raw purge：仍有笔记引用 | 明确业务错误（含引用数），**不是裸外键报错**，且不删任何行 |
| T11 | raw purge：引用为 0 | 成功；写审计 |
| T12 | 静态守卫 | 断言 purge 路径对 links / revisions / proposals 是**显式 DELETE**，不存在依赖 CASCADE 的静默路径 |
| T13 | archive / soft-delete / restore 与 purge 互不干扰 | 三个状态迁移各自独立正确 |

---

## 八、迁移影响

**结论：整个删除生命周期只需要一次新增列的迁移。**

| 迁移 | 内容 | 原因 |
|---|---|---|
| `0003_lean_bloodscream.sql` | `ALTER TABLE "links" ADD COLUMN "deleted_at" timestamp with time zone;` | 决策 3：links 需要可恢复软删除 |

**不需要的迁移（逐条说明为什么）**：

- **枚举迁移：不需要。** 决策 2 明确 MVP 不新增 `proposals.kind`，因此 `lib/db/enums.ts` 与 11 条 CHECK 全部不变。
- 其余所需列与约束都已就位：`notes.deleted_at`（迁移 `0002`）、`notes.archived_at`、`raw_notes.archived_at`；`note_revisions` / `proposals` / `links` 对 `notes` 已是 **RESTRICT**；`audit_log` **无外键**。
- purge 原因（决策 4）、确认信息（决策 5）、标题快照（决策 7）全部放进 `audit_log.detail`（jsonb），**不需要新列**。
- 幂等复用已有的 `idempotency_keys` 表。

**数据影响**：`ADD COLUMN` 可空、无默认值 → 不重写表、不影响既有行、**无破坏性语句**。

**⚠️ 一个必须由服务层消化的约束**：`links_pair_idx` 是 `(user_id, source_note_id, target_note_id, type)` 的**完整唯一索引，不是部分索引**。因此一条关系被软删除后，若用户再建立"同样的关系"，直接 INSERT 会**撞唯一约束**。

**MVP 处理方式：复活已有行** —— 查到同四元组的行（含已软删除的），把 `deleted_at` 清空即可，不插入新行。备选是把该索引改成部分唯一索引（`where deleted_at is null`），但那要额外改索引，MVP 不采用。

---

## 九、需要修改的文件（未来实施时）

| 文件 | 变更 |
|---|---|
| `lib/services/lifecycle.ts` | **新增**：archive / unarchive / soft-delete / restore 的状态迁移函数（与 purge 同族）|
| `lib/services/purge.ts` | **新增**：purge 事务、清单采集、manifest 构造 |
| `lib/services/audit.ts` | **新增**：统一审计写入入口（失败与成功都走它）|
| `lib/auth/authorize.ts` | 增加"高风险操作仅 `user` 主体"的判定（可复用 `requireUserActor`，但需区分错误码）|
| `app/api/notes/[id]/archive` `.../restore` `.../delete`（或统一 PATCH 状态）| **新增**：普通生命周期端点 |
| `app/api/notes/[id]/purge/route.ts` | **新增**：独立高风险端点，要求显式确认 + 幂等键 |
| 测试文件 | **新增**：第七节用例（需先引入测试框架）|
| `AGENTS.md` / `docs/*` | 记录 purge 语义、权限边界与审计格式 |
| **不修改** | `app/api/raw/route.ts` 与 `app/api/relations/[id]/route.ts`（两者的归档 / 软删随存储层重写一起改）、现有 `lib/*-storage.ts`（旧 JSON 层）|

---

## 十、待确认问题（全部已确认，2026-10-10）

| # | 问题 | 结论 |
|---|---|---|
| 1 | purge 是否必须先软删除 | ✅ **是**，两步走 |
| 2 | purge 是否必填原因 | ✅ **必填简短原因** |
| 3 | Agent 是否可提议 purge | ✅ **不可**；MVP 不新增 `proposals.kind`；Agent 只能建议归档 |
| 4 | 是否要求输入标题二次确认 | ✅ **不要求**；用二次确认弹窗 + 永久删除按钮 |
| 5 | purge 笔记时是否连带删 raw | ✅ **不连带**，raw 独立保留 |
| 6 | links 普通删除是否可恢复 | ✅ **是**，可恢复软删除（决策 3）|
| 7 | 审计是否保留标题快照 | ✅ **允许保留** |

**一处遗留口径（未阻塞）**：`app/api/relations/[id]/route.ts` 目前操作**旧 JSON 层**，仍是**硬删除**。按与 `DELETE /api/raw` 相同的口径，旧 JSON 层本次不改，关系的软删除随数据库存储层重写一起落地；新模型（`links.deleted_at`）已经就位。

---

*本文档只做设计与审查：未改代码、未生成迁移、未执行迁移、未连接任何数据库。production 未触碰。*
