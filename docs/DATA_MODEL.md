# Data Model

本文区分**长期目标模型**与**当前实际持久化模型**。长期模型是设计目标，**代码中尚未实现**，不要当成已有的 schema 使用。

---

## 一、当前实际模型（已实现）

> ⚠️ **2026-10-17 现状纠正：存储层早已不是 JSON 文件，也不再依赖云端数据库。**
> 实际持久化在**本机 PGlite**（PostgreSQL 的 WASM 版，跑在应用进程内，数据在 `data/pglite`），
> 由 **Drizzle ORM** 读写：schema 在 `lib/db/schema.ts`，
> 迁移在 `drizzle/0000`–`0005`，服务层在 `lib/services/`（`sources` / `notes` / `links` / `proposals` / `bundle`）。
> 下面各条目的**字段形状**仍然准确（类型层 `types/` 与之一致），但凡是写着 `data/*.json`、
> `lib/*-storage.ts`、文件不存在返回空数组的句子，都是 2026-10 早期 JSON 时代的遗留，**以代码为准**。
> 契约与路由见 [`docs/schema.md`](schema.md)。

### Raw —— 原始输入（用户可改，AI 不可改）

```text
Raw {
  id: string          // raw_<uuid>
  title: string | null // 用户起的名字（迁移 0004 新增）；为空时界面显示「未命名 N」
  text: string        // 上限 50000 字符
  archivedAt: string | null
  createdAt: string
}
```

表 `raw_notes`。当前有创建（`POST /api/raw`）、列表（`GET`）、修订（`PATCH /api/raw/:id`，留 `audit_log`）
与「移除」—— 移除是**归档**（写 `archived_at`），不是物理删除。
若该 Raw 被一条**未归档的** Knowledge 引用，「移除」返回 `409 RAW_REFERENCED_BY_KNOWLEDGE`；
那一页归档之后即可移除（2026-10-17 修：此前不管页码状态一律 409，用户没有出口）。

> **2026-10-10 决策：Raw 允许用户修改。**
> 原先「Raw 不可变」的表述作废。新的边界是：**用户可改，AI 不可改**。

**当前实现（2026-10-18 核对）**：`PATCH /api/raw/:id` 已实现；每次修改把 `{ before, after, version }` 写进 `audit_log`（`operation = 'raw.update'`），`raw_notes.version` 同步 +1。没有独立的 `RawRevision` 表——修订历史存在 `audit_log.detail` 里。

三条约束仍然成立：

1. 用户可以修改 Raw 正文（`PATCH /api/raw/:id`）。
2. **AI 永远不能改写 Raw 的正文**；AI 只能在 Draft 里引用原文。整理链路只产出 `OrganizeDraft`，从不写 `raw_notes` 的正文列。
3. 每次修改留下修订记录（当前落在 `audit_log`），否则「原始出处」的信任基础会消失。

### Knowledge —— 用户确认后的知识页

```text
Knowledge {
  id: string          // knowledge_<uuid>
  rawId: string       // 必须指向真实存在的 Raw
  title: string
  summary: string
  content: string
  keyPoints: string[]
  concepts: string[]
  keywords: string[]
  version?: number    // 乐观并发；每次更新 +1
  archivedAt?: string | null
  createdAt: string
  updatedAt: string
}
```

存储于表 `notes`（就在本机 `data/pglite` 这份库里，不进 Git）。
同一个 `rawId` 重复确认不会创建第二条记录（`POST /api/knowledge` 返回 `created: false`）。
支持 `PATCH /api/knowledge/:id` 部分更新（`title` / `summary` / `content` / `keyPoints` / `concepts` / `keywords`，全部可选），更新时刷新 `updatedAt`。

### KnowledgeRelation —— 知识之间的关联

```text
KnowledgeRelation {
  id: string          // relation_<uuid>
  sourceId: string
  targetId: string
  type: "related"
  reason: string
  createdAt: string
}
```

存储于表 `links`（同一份本机库）。`related` 被当作**对称**关系处理：服务端以无序 ID 对去重，要求两端 Knowledge 都存在，并拒绝自连接。

### WikiPage / WikiLink —— 只读的 Wiki 结构

> ⚠️ **本节已于 2026-10-10 作废。** 参考库（Wiki）整层已从代码中移除：`types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts`、`data/wiki.json` 全部删除，界面上的"参考库"树与 Wiki 标签页也已移除。下面保留的只是**历史记录**，不要照着实现。数据库不需要 wiki 相关表。

```text
WikiPage {
  id: string
  title: string
  kind: "overview" | "concept" | "architecture" | "workflow" | "reference" | "practice"
  summary: string
  content: string
  tags: string[]
  parentId: string | null
  sourceRawId: string
  order: number
  createdAt: string
  updatedAt: string
}

WikiLink {
  id: string
  sourceId: string
  targetId: string
  type: "contains" | "supports" | "operates_on" | "maintains" | "indexes" | "records" | "extends"
  reason: string
}
```

（历史）存储于 `data/wiki.json`，进 Git，是固定的演示数据。该文件与对应的存储模块、API 路由均已于 2026-10-10 删除。

### OrganizeDraft —— 服务端返回的临时结构

```text
OrganizeDraft {
  title: string
  summary: string
  content: string
  keyPoints: string[]
  concepts: string[]
  keywords: string[]
  relatedKnowledge: { knowledgeId: string; reason: string }[]
}
```

**不持久化**。由 `POST /api/organize` 经 Provider 层（默认 DeepSeek）生成并校验形状；`relatedKnowledge` 中服务端确认不存在的 ID 会被过滤掉。
用户确认后，由 `POST /api/knowledge` 落库为 `Knowledge`。

### 关系图（运行时派生，不是存储）

`GET /api/graph` 从 `Knowledge` + `KnowledgeRelation` 实时生成 `{ nodes, edges }`，端点不存在的边会被过滤。
**没有 `graph.json`** —— Graph 只是展示层。

### 反向链接（运行时派生，不是存储）

`GET /api/knowledge/:id/backlinks` 根据当前 Relation 反查相关 Knowledge。
由于不单独存储，Relation 增删后查询结果立即反映最新状态。

---

## 二、长期目标模型（未实现）

以下是产品设计目标。**当前代码中不存在这些实体**，不要据此写代码。

### 核心节点

系统核心节点规划为 `Note`、`Question`、`Concept`、`Card`。每个节点至少包含 `id`、`type`、`title`、`content`、`tags`、`createdAt` 与 `updatedAt`。

- **Note**：用户学习笔记，可来自手动输入、图片识别或 Markdown。
- **Question**：题目，包含学科、章节、题型、难度，并区分 `primaryConcept` 与 `relatedConcepts`。
- **Concept**：知识网络中的核心知识点，可拥有别名，用于匹配已有概念。
- **Card**：用于学习和复习的知识卡片，通常由 Concept、Note、Question 共同产生。

### Edge

边规划包含 `id`、`source`、`target`、`relation`、`createdAt`，关系可为 `contains`、`examines`、`related_to`、`explains`、`derived_from` 或 `references`。

对比当前实现：只有 `KnowledgeRelation`，且 `type` 恒为 `"related"`，没有方向性，也没有上述关系类型。

### Proposal

AI 对知识关系的创建或修改先生成 Proposal，状态为 `proposed`、`accepted` 或 `rejected`。只有用户接受后才进入正式知识图谱。

**当前状态：已实现，状态名与上面不同。** `proposals` 表 + `/api/proposals`（列表 / 提交）+ `/api/proposals/:id`（approve / reject / apply）都已落地，取值是 `pending` / `approved` / `rejected` / `applied` / `failed` / `stale` / `cancelled`（唯一来源 `lib/db/enums.ts`）。对应关系：长期模型的 `proposed → accepted` ≈ 当前的 `pending → approved → applied`，`rejected` 两边同名。

**仍然成立的那条边界**：AI 自己只写 `pending` 提议，正式数据一律等用户批准后由 `apply` 落库（见 `docs/adr/0001`）。

---

## 三、长期模型 ↔ 当前实现 映射

| 长期模型 | 当前实现 | 差距 |
|---|---|---|
| `Note` | `Raw`（原始输入，用户可改 / AI 不可改）+ `Knowledge`（整理结果，可 PATCH） | 一个 `Note` 被拆成两层的痕迹：Raw 与 Knowledge 都可改，但只有 Knowledge 是「整理结果」。四类节点未实现 |
| `Question` | 无 | **未实现**。当前没有题目相关的字段（学科/章节/题型/难度/primaryConcept） |
| `Concept` | `Knowledge.concepts`（字符串数组）| 只是标签，**不是**可关联、可别名匹配的核心节点（原 `WikiPage` 的 kind = `concept` 已随 Wiki 层移除）|
| `Card` | 无 | **未实现** |
| `Edge`（多类型） | `KnowledgeRelation`（只有 `related`，无向） | 关系类型单一、无方向 |
| `Proposal` | `proposals` 表 + `/api/proposals*`（`pending → approved → applied`，另有 `rejected` / `stale` / `cancelled`）| 已实现；状态命名与长期模型不同，语义等价 |
| `Wiki`（承载四类节点） | 无（原 `WikiPage` / `WikiLink` 已于 2026-10-10 移除）| 未实现，需要以新形态重新设计 |

**另外注意**：「出链」（Outlink）是规划中的特有功能，当前代码里没有对应概念 —— 现有 Relation 是对称的，无法表达"从 A 指向 B"。做这项功能时需要先决定是给 Relation 加方向，还是新增有向链接类型。详见 `ROADMAP.md`。
