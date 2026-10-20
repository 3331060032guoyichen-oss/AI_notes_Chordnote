# Chordnote Vault Schema v1

状态：草案。定稿后，文件布局、索引、Agent 与 UI 一律以此为准；与 `AGENTS.md` 冲突时先改本文再改代码。

本文只定义**数据契约**：文件怎么放、字段怎么写、身份与关系怎么解析、什么进索引。
文件读写、Watcher、并发与恢复见 [`STORAGE_LAYER.md`](STORAGE_LAYER.md)；权限模式与 Agent 工具另文。

---

## 0. 不变量

1. Vault 内的 Markdown 是知识内容的**唯一权威来源**。数据库中的知识索引可随时丢弃重建。
2. 应用状态（提议、审计、会话、幂等键）不是知识，**不写入 Vault**。
3. Raw 正文只允许两种写入：用户改写、系统在**末尾追加**。其余一律禁止。
4. 页面身份由 frontmatter `id` 决定，不由路径决定；重命名文件不改变身份。
5. 索引只存派生数据。任何一条索引记录都必须能从文件重新算出来。

---

## 1. 目录

```text
<Vault>/
├── CLAUDE.md                  # Vault 规则层，指导知识整理 Agent
├── .gitignore                 # 内容：.chordnote/
│
├── raw/                       # 原始来源层，用户所有
│   ├── inbox/                 # 应用新建的未整理笔记
│   ├── notes/                 # 手动笔记、课堂笔记
│   ├── papers/
│   ├── books/
│   ├── articles/
│   └── assets/                # 图片与附件
│
├── wiki/                      # 知识层
│   ├── home.md                # 知识库主页（可编辑）
│   ├── index.md               # 目录（应用生成，可重建）
│   ├── log.md                 # 维护日志（追加式）
│   ├── sources/
│   ├── concepts/
│   ├── entities/
│   └── notes/
│
└── .chordnote/                # 非知识数据，Watcher 与 Git 均忽略
    ├── index/                 # 可重建索引与缓存
    ├── trash/                 # 删除后的可恢复文件
    └── lock                   # 单实例锁
```

- Vault 根目录的 `CLAUDE.md` 与仓库里的 `AGENTS.md` / `CLAUDE.md` 是两份东西，互不覆盖。
- 初始化 Vault 时若不存在 `CLAUDE.md`，从 `lib/agent/Schema.md` 复制一份；用户已有旧 `Schema.md` 时一次性导入，之后只认 Vault 内这一份。
- `.chordnote/` 下只允许放可重建数据或本地运行状态。删掉它不损失任何知识。

---

## 2. 文件类型与命名

| 层 | 位置 | 身份 | 谁写 |
|---|---|---|---|
| Raw | `raw/**` | Vault 相对路径 | 用户；AI 仅在末尾追加 |
| Source 页 | `wiki/sources/` | frontmatter `id` | AI（受权限约束）/ 用户 |
| Concept 页 | `wiki/concepts/` | frontmatter `id` | 同上 |
| Entity 页 | `wiki/entities/` | frontmatter `id` | 同上 |
| Note 页 | `wiki/notes/` | frontmatter `id` | 同上 |
| Meta | `wiki/*.md` | frontmatter `id` 或固定路径 | 应用 / 用户 |

- Wiki 文件名使用标题派生的 slug：`PID Control.md` 可接受，`concept_pid.md` 也可接受。文件名不是身份，改名字只需重命名文件。
- 二进制来源与 Markdown 旁挂：`raw/papers/x.pdf` + `raw/papers/x.md`。同一目录下同名冲突时加 `-2`、`-3`，Lint 报告该冲突。
- 旁挂的 `.md` 是 **Raw 层**的文字记录，不是 `wiki/sources/` 里的 Source 页；两者都存在，职责不同。

---

## 3. Raw 文件规则

- Raw 文件**不要求 frontmatter**，用户可以直接写纯 Markdown。
- 应用新建的笔记落在 `raw/inbox/<标题>.md`。修改第一个 H1 **不自动重命名文件**；用户手动重命名由 Watcher 识别。
- Raw 的身份是 Vault 相对路径。文件重命名时，系统通过内容 hash 识别为同一文件，并更新对应 Source 页的 `source_path`（这是一次受审计的 Wiki 写入，不改 Raw 内容）。
- AI 只能在文件末尾追加，格式固定：

```markdown
<已有字节>\n\n## AI append-1\n\n<内容>\n
```

规则：

| 项 | 规定 |
|---|---|
| 编号 | 取文件中已有 `AI append-N` 的最大值 +1，只增不重排 |
| 前置换行 | 文件末尾没有换行时，先补 `\n\n`；这不算覆盖已有字节 |
| 内容限制 | 追加内容中不得出现匹配 `^## AI append-\d+\s*$` 的行；出现即拒绝 |
| 元数据 | 标题只放编号。追加者、时间、来源写入 `audit_log`，不写入文件 |
| 用户处置 | 用户可以改写或删除追加块；v1 不做任何保护 |
| 并发 | 追加前校验文件当前 hash，与读取时不一致则拒绝（见 STORAGE_LAYER §3） |

---

## 4. Wiki 页面 Frontmatter

### 4.1 通用字段

```yaml
---
id: concept_pid-control        # 必填，稳定标识
type: concept                  # 必填：source | concept | entity | note | meta
created: 2026-10-20            # 必填，YYYY-MM-DD
updated: 2026-10-20            # 应用每次写入时更新；外部编辑可能过期，索引以 mtime 为准
aliases: [PID控制, 比例积分微分控制]
tags: [控制理论]
archived: false                # 可选；true 时不出现在日常视图，仍在 Settings → Archive
archived_at: 2026-10-21        # 可选，与 archived 成对
---
```

- 标题以**第一个 H1** 为准。frontmatter 的 `title` 是可选的镜像字段，存在时必须与 H1 一致，否则 Lint 报警。
- `id` 格式：`^(source|concept|entity|note)_[a-z0-9][a-z0-9-]{0,63}$`。前缀必须与 `type` 一致。
- `type` 必须与所在目录一致（`sources/` → `source`，`home.md` / `index.md` / `log.md` → `meta`）。不一致的页面不进入索引，由 Lint 报告。
- 未知 frontmatter 字段一律保留，不得静默删除。

### 4.2 各类型字段

```yaml
# wiki/sources/<slug>.md
id: source_pid-class-notes
type: source
source_path: raw/notes/PID课堂笔记.md     # 必填，指向 Raw 文件
source_kind: note                          # note | paper | book | article | web
```

```yaml
# wiki/concepts/<slug>.md
id: concept_pid-control
type: concept
sources:                                   # 必填，至少一项
  - "[[PID课堂笔记 (source)]]"
  - "[[自动控制原理 (source)]]"
relations:
  - type: prerequisite_of                  # related_to | prerequisite_of | part_of | derived_from
    target: "[[传递函数]]"
```

```yaml
# wiki/entities/<slug>.md
id: entity_zs
type: entity
entity_kind: person                        # person | organization | tool | book
aliases: [Ziegler, 齐格勒]
```

```yaml
# wiki/notes/<slug>.md
id: note_pid-tuning-comparison
type: note
question: "PID 三种整定方法分别在什么场景更合适？"
sources: ["[[PID Control]]"]
```

`wiki/home.md`、`log.md`：`type: meta`，可自由编辑。
`wiki/index.md`：`type: meta`，由应用生成，用户编辑会在下一次重建时被覆盖。

---

## 5. 身份、别名与解析

解析顺序（命中即停）：

1. `id` 精确匹配（`concept_pid-control`）
2. `aliases` 匹配（规范化后）
3. H1 标题匹配
4. Vault 相对路径（带或不带 `.md`）

规范化：NFC + 去首尾空白 + 大小写折叠 + 连续空白压成一个。

- 0 个命中 → 未解析（unresolved），不自动创建文件。
- 多个命中 → **视为歧义**，解析结果为空，Lint 列出全部候选。不猜。
- 同一 `id` 出现在两个文件 → 两个页面都不参与按 id 解析，Lint 报 `duplicate-id`。不自动改名、不自动合并。
- 重命名或移动文件不触碰其他文件；引用方无需改写。

`id` 生成：Ingest 时取标题的可读 slug（`concept_pid-control`）；无法得到合法 slug 或已被占用时，退化为 `<type>_<8位十六进制>`。

---

## 6. 链接与关系的两级表示

| 层 | 语法 | 方向 | 是否存储 |
|---|---|---|---|
| Wikilink | `[[目标]]`、`[[目标\|别名]]`、`[[目标#小节]]` | 有向（A 正文提到 B） | 不存，实时解析 |
| Semantic Relation | frontmatter `relations:` | 除 `related_to` 外均有向 | 存在声明方页面 |

- 反向链接由两者合并派生：谁正文里 wikilink 了我，谁 frontmatter 里指向了我。
- `related_to` 在查询时按无向处理；其余类型保留方向。
- 自连接、重复边（同一 from/to/type）在索引阶段忽略，Lint 报告。
- Wikilink 永远不自动创建目标。未解析链接只能由用户显式创建，或由 Ingest 在权限允许时创建。
- 图谱需要区分两类边：`edge.kind = wikilink | relation`。

---

## 7. Source ↔ Concept 规则

- Source 页与 Raw 文件 **1:1**。一个 Raw 文件有且只有一个 Source 页，由 `source_path` 唯一确定。重复由 Lint 报告。
- Concept 页与 Source 页 **N:N**，由 Concept 的 `sources` 数组声明；反向索引由程序生成。
- Concept 允许且应当融合多个 Source。Source 页只忠实描述单一来源，不做跨来源综合。

Ingest 时的建页/更新判定（代码判定，不交给模型打分）：

| 检索结果 | 动作 |
|---|---|
| 规范化标题或别名精确命中 1 个同类页面 | 更新该页面 |
| 命中 0 个 | 新建页面 |
| 命中 ≥2 个 | 不新建、不合并；输出冲突清单，交给用户或 Lint |
| 已有页面 `type` 不同 | 不跨类型更新 |

- 页面合并只能作为提议（`note_merge`），v1 不自动合并。
- 多个来源结论冲突时，双方并列保留在 `## 观点分歧` 小节并分别标注来源，禁止静默覆盖。

---

## 8. 什么进 Markdown，什么进索引

| 数据 | Markdown | 索引 | 应用状态（PGlite） |
|---|---|---|---|
| 正文与标题 | ✅ 权威 | 摘要/标题副本 | — |
| id / type / aliases / tags / sources / relations | ✅ 权威 | ✅ 派生 | — |
| 文件路径 / hash / mtime / size | — | ✅ | — |
| 反向链接、图谱边、来源反向索引 | — | ✅ 派生 | — |
| 归档标记 | ✅ frontmatter | ✅ 派生 | — |
| 提议、审批、审计、会话、幂等键 | — | — | ✅ 权威 |
| 追加者与追加来源 | —（只有 `AI append-N` 标题） | — | ✅ `audit_log` |
| 修订历史（旧 `note_revisions`） | — | — | ✅ 只读历史 |

---

## 9. 旧数据迁移映射

| 现状 | 迁移后 |
|---|---|
| `raw_notes`（未归档） | `raw/inbox/<标题>.md`（原 path 为 `raw/inbox/` 的）或 `raw/notes/<标题>.md`，正文原样 |
| `notes` | `wiki/sources/<标题> (source).md`，`source_path` 指向对应 Raw；**不自动生成 Concept** |
| `links` | 写在 `source` 一端的 `relations:`，类型 `related_to` |
| `note_revisions` | 保持为应用状态只读历史，不拆分到文件 |
| `proposals` / `audit_log` | 保持原样 |
| `canvases` | 暂保持应用状态，不进 Vault |

迁移完成后，旧列（`notes.content` / `raw_notes.text` 等）不再作为权威来源；文件缺失时**不得**从旧列静默重建。

---

## 10. v1 明确不做

- 段落锁定、人工编辑归属识别、三方合并。
- 自动合并重复页面。
- 多 Vault 同时打开。
- PDF 内容解析；v1 只做同名旁挂与文字记录。
- `wiki/index.md` 的内容格式稳定承诺（它是生成物）。
