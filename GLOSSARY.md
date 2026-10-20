# Chordnote

面向大学生的生长式 AI 知识系统（校赛 Demo）。本表只收 Chordnote 这个 context 专属的概念；通用编程概念（超时、错误类型、工具函数套路等）一律不收。

命名以**数据库表与服务层的既成事实**为准；DTO / 类型层的历史名字不构成第二个概念，一律列进 _Avoid_。

## 语言

**Source（原始记录）**：
用户随手写下的原始材料，未经 AI 整理。用户可以改，AI 永远不能改写它的正文。
在 Schema / LLM Wiki 语境下，这一层写作 `Raw/`；两者是同一个概念，不是两层数据。
_Avoid_：raw_notes、原始笔记（`Raw` 仅在 Schema 与目录语境下使用）

**Note（知识页）**：
由一条 Source 晋升而来的结构化知识页（标题 / 摘要 / 正文 / 概念 / 关键词）。晋升动作必须由用户确认。
在 Schema / LLM Wiki 语境下，这一层写作 `Wiki/`；`Wiki` 指知识层，不指单个页面。
_Avoid_：Knowledge、notes、知识（`Wiki` 仅在 Schema 与目录语境下使用）

**Link（关系）**：
两条 Note 之间的正式关联，唯一索引建在无序 ID 对上。删除是可恢复的软删除；重建同一关系时必须复活原行，不能插入新行。
_Avoid_：Relation、links、边、edge

**Draft（草稿）**：
AI 针对一条 Source 产出的整理结果，**不持久化**。用户确认后，它的内容才成为一条 Note 的初值。
_Avoid_：草稿、OrganizeDraft（后者仅作类型名保留）

**Proposal（提议）**：
AI 想要改变知识网络时提交的可审阅对象。**状态机**：`pending → approved → applied`（用户同意并执行）/ `rejected`（用户拒绝）/ `stale`（同意时目标已经变了，只能让 AI 重新生成）。服务在 `lib/services/proposals.ts`，接口在 `/api/proposals*`；`kind` 目前放行 `link_create` / `source_create` / `note_update` / `schema_preferences`。
**提议不是写入**：approved 只是"同意"，真正落库发生在 `apply`，两者分开是为了让"谁在什么时候同意了什么"可查。
_Avoid_：建议、suggestion

**Archive（归档）**：
把一条 Source 或 Note 从**日常视图**里收起来 —— 「我不想在日常里看到它」，不是「它不是我的数据」。原始记录与知识页都有这个状态（`archived_at`），都可以恢复。
导出**包含已归档内容**；归档不写修订历史（正文没变），只写审计。被归档的 Note 不再挡着它的 Source 被移除。
_Avoid_：删除、软删除（那是 `deleted_at` 与 `links` 的语义）、回收站

**Provider（模型提供者）**：
把统一请求送到某个模型服务、并把回复归一化的传输适配者。它不拥有提示词、Agent 权限或知识规则。
_Avoid_：模型、model、插件

**Model Profile（模型配置）**：
"用哪个 Provider、哪个模型名、哪个服务地址、什么凭据"的一组设定；由服务端保存，浏览器只看到脱敏状态。
_Avoid_：设置项、settings、API 配置

**Vault（知识库目录）**：
用户指定、由 Markdown 文件构成的知识库目录。目标是知识正文的权威来源，与整个产品所说的「知识库」不是一回事。
_Avoid_：知识库（指整体能力时不要用它）、folder、workspace

**Index（索引）**：
从 Vault 重建出来的派生数据（查找、全文检索、图谱投影）。可以删除并重建，不承载权威。
_Avoid_：缓存、数据库、存储

**Chord（和弦）**：
产品品牌名与营销隐喻（"一条笔记是音符，连起来才是和弦"）。**它不是领域概念**——数据模型里不存在这个实体，代码里也没有对应类型。
_Avoid_：把 Chord 当作实体名或类型名使用

**工作手册**：
一份写给 AI agent 的规范，规定它必须产出什么格式、允许做什么、禁止做什么（例如禁止编造来源 URL、禁止在正文里写推理过程）。**所有接入 Chordnote 的 agent 共用同一份**，不随界面变化、不是应用里给用户翻的页面。
_Avoid_：prompt、Wiki、参考库

**知识包（Bundle）**：
一次导出得到的自包含目录，纯 markdown + YAML frontmatter，可被任何读 markdown 的工具消费。它是对外兑现"数据是你的"的方式。
_Avoid_：导出文件、备份

**错题**：
一种 `Source`：学生做错那道题的原文（题干 + 自己的错解）。它**本身不晋升为 `Note`**，而是通过 `Link` 指向它考查的那些知识页。它是「知识盲区地图」能算出来的前提。
_Avoid_：题目、习题（暂不区分）、错题本（后者指独立视图，已决策不做）
