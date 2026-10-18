# Roadmap 与差距分析

本文是项目**目标 ↔ 现状 ↔ 差距**的对照表，用于排期和判断"某功能能不能做"。
来源：`任务分工.docx`（3 条工作线 × 2 阶段规划）与当前代码实现的实际核对结果。

---

## 一、项目目标

AI Notes 是面向大学生的生长式 AI 知识系统：把原始学习材料逐步转化为可复用、可连接、可复习的结构化知识。
核心原则是 **AI 提议、用户确认**；Raw 允许用户修改，但 AI 不得改写原始内容。

`任务分工.docx` 把工作拆成三条线，各分两个阶段。

### 1. 知识库和图谱搭建

**阶段一（10.8 – 10.16）**

- 符合笔记的基准能力：能**建立**、**删除**、**修改**
- 确保特有功能：
  - **出链**（Outlink）：从当前笔记指向其他笔记
  - **反向链接**（Backlink）：显示哪些笔记指向了当前笔记，并支持**勾选内容进行链接**

**阶段二**

- **知识图谱**：可视化显示笔记之间的链接

参考实现：Obsidian（先跟着构建一遍）、[`nashsu/llm_wiki`](https://github.com/nashsu/llm_wiki)、[`Tencent/WeKnora`](https://github.com/Tencent/WeKnora)

### 2. UI 界面

**阶段一（10.8 – 10.16）**

- 设计"第一次滑动时出现的边框"，重点控制**灵敏度**
- 边框内自行设计**欢迎标语**和**进入窗口**

**阶段二**

- 美化笔记界面：排版、鼠标触感
- 设计**两套主题**（参考 Obsidian 的主题仓库）

参考：illoca – Architectural design at the speed of thought；辅助 skills：[`Leonxlnx/taste-skill`](https://github.com/Leonxlnx/taste-skill)、[`pbakaus/impeccable`](https://github.com/pbakaus/impeccable)

### 3. Skills 和插件设计

**阶段一（10.8 – 10.16）**

- **agent 插件**：连接 DeepSeek 模型，能调用 DeepSeek API

**阶段二**

- **图像识别转 Markdown（OCR）**：把图片读给 AI 用，参考 [`opendatalab/MinerU`](https://github.com/opendatalab/MinerU)
- **剪切 skill**：一键剪切网页内容，参考 [Obsidian Clipper](https://obsidian.md/clipper)

---

## 二、当前实现状态

> **2026-10-18 按代码核对并更正**：补齐桌面版、Provider 层、Proposal 状态机、Agent 工具循环与知识包；同步首屏与图谱的现状。历史描述不再保留。

### 已完成并有真实代码

| 模块 | 实现位置 |
|---|---|
| Raw 原始笔记：创建、列表、归档、修改（输入校验、长度上限 50000） | `app/api/raw/route.ts`、`lib/services/sources.ts` |
| AI 整理：生成结构化 Draft（Provider 层，默认 DeepSeek） | `app/api/organize/route.ts`、`lib/ai/provider.ts`、`lib/ai/tasks.ts` |
| Knowledge：列表、确认入库（Draft 落库）、**字段修改（PATCH）** | `app/api/knowledge/route.ts`、`app/api/knowledge/[id]/route.ts` |
| KnowledgeRelation：关联的创建、列表、删除 | `app/api/relations/route.ts`、`app/api/relations/[id]/route.ts` |
| Backlink **接口**：动态反查相关 Knowledge | `app/api/knowledge/[id]/backlinks/route.ts` |
| Graph **接口**：从 Knowledge + Relation 实时生成 nodes/edges | `app/api/graph/route.ts` |
| ~~Wiki 只读结构~~ | **已于 2026-10-10 整层移除**（`types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts`、`data/wiki.json`）。原因见 `AGENTS.md` 的「决策记录」 |
| AI 问答：`@` 提及式单轮问答，服务端按引用重读真实内容 | `app/api/assistant/route.ts` |
| 提议状态机：`pending → approved → applied`，另有 `rejected` / `stale` / `cancelled` | `lib/services/proposals.ts`、`app/api/proposals*` |
| Agent 工具循环：检索 → 通读 → 提议；blocked 工具不交给模型 | `lib/agent/loop.ts`、`lib/agent/manual.ts`、`app/api/agent/organize/route.ts` |
| 模型 Provider：DeepSeek / Ollama / 自定义共用 OpenAI 兼容协议，密钥只在服务端 | `lib/ai/`、`app/api/settings/model*` |
| 知识包：JSON 全量快照、markdown zip 导出、dry-run 导入 | `lib/services/bundle.ts`、`app/api/export`、`app/api/import` |
| Windows 桌面版：Tauri 2 宿主 + standalone Next.js + NSIS 安装包 | `src-tauri/`、`scripts/prepare-desktop.mjs`、`scripts/verify-desktop-runtime.mjs` |
| 本机来源防护：`/api/*` 只接受回环 Host，写请求校验 Origin | `middleware.ts` |
| 工作台 UI：Raw / Knowledge 文件树 + 标签页 | `app/page.tsx` |
| Knowledge 内联编辑：标题右键改名、摘要/正文/概念可改 | `app/page.tsx` + `PATCH /api/knowledge/:id` |
| 首屏落地页：Hero + 特点 + 工作方式 + 收尾；Three.js 粒子场 / Canvas 星丛 / tsParticles 星尘 | `components/landing-page.tsx`、`landing-particle-field.tsx`、`landing-constellation.tsx`、`landing-stardust.tsx` |
| 界面音效：Web Audio 实时合成、首次询问、偏好持久化 | `components/interface-sound.tsx` |

### 工程与协作

- 存储层是 Drizzle ORM + 本机 PGlite（PostgreSQL 方言，跑在应用进程内），数据在 `data/pglite`；迁移随启动自动增量补齐
- 全部 API 路由 `export const runtime = "nodejs"`
- 样式为 `app/globals.css` 手写 CSS + CSS 变量，**未引入** CSS 框架或 UI 组件库
- 自动化验证：`pnpm test`（75 条 HTTP 断言，3000 端口空闲时自起临时 dev server）、`pnpm test:unit`（Provider / 配置离线单测）、`pnpm verify:db`（内存库跑迁移并验证表 / 约束 / 外键 / 归属隔离）、`pnpm build`、`pnpm desktop:verify:runtime`（打包运行时健康检查）。界面改动仍必须手动走查

---

## 三、差距清单

按"当前是否能算达成目标"分档。**这是后续排期的主要依据。**

### A. 与阶段一目标直接相关的缺口（优先级最高）

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| A1 | 笔记能**修改** | ✅ 已实现：`PATCH /api/raw/:id`，每次修改写一条 `audit_log`（改前 / 改后 / 版本） | 无缺口。AI 仍**不能**改写 Raw 正文（Agent 调用返回 403 / 只能走提议）。没有独立的 `RawRevision` 表——历史存在 `audit_log.detail` |
| A2 | **出链** | `links` 表保留 `source/target`，但服务层按**无序对**去重，A→B 与 B→A 视为同一条 | 仍无有向语义。要做出链，需要先决定"关系是否方向化" |
| A3 | **反向链接**在界面上一等公民 | ✅ 已实现：右栏「入链 / 出链 / 未链接提及」三块，接口 `/api/knowledge/:id/backlinks` 与 `/api/graph` 均被界面使用 | 无缺口 |
| A4 | 反向链接支持**勾选内容进行链接** | 正文中的标题内联标记可点击建立关联（未链接提及 → 一键建立） | 圈选任意正文片段建链接仍不存在 |

### B. 阶段二目标的缺口

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| B1 | 知识图谱可视化笔记间链接 | ✅ 已实现：`components/graph-view.tsx`，`d3-force` 力学 + 自绘 Canvas；可拖动、滚轮缩放、点节点出卡片、双击打开、拖动即固定 | 无缺口 |
| B2 | **agent 插件**（工具调用） | ✅ 已实现：`lib/agent/loop.ts` 工具循环 + `lib/agent/manual.ts` 权限手册；只读工具直接执行，写意图一律生成 `pending` 提议 | 模型层已抽成可替换 Provider（`lib/ai/`）；Ollama 的真实工具调用待本机验证 |
| B3 | 两套主题 | ✅ 已实现三套主题：暗室星图 / 暖纸批注 / 实验工坊，`<html data-studio>` 切换并持久化 | 无缺口 |
| B4 | OCR 图片转 Markdown | 无 | 未实现（MinerU 尚未引入） |
| B5 | 网页剪切 | 无 | 未实现（Clipper 尚未引入） |

### C. UI 阶段一目标的缺口

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| C1 | 首次滑动出现的边框（控灵敏度） | ✅ **已实现（形态已改）** | `components/landing-page.tsx`：完整滚动落地页；点击「进入编辑室」进入工作台，`localStorage(chordnote:entered)` 记住选择 |
| C2 | 边框内的欢迎标语与进入窗口 | ✅ **已实现** | 同文件：Hero 标语与主按钮 + 特点区 + 工作方式 + 收尾；Hero 右侧 Three.js 粒子场，底层 Canvas 星丛与 tsParticles 星尘 |

### D. 数据模型层面的长期欠账

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| D1 | `Note` / `Question` / `Concept` / `Card` 四类节点 | 实现的是 `Raw` / `Knowledge`（原先还有 `WikiPage`，已于 2026-10-10 移除）| 四类节点**完全未实现**，只有概念设计。见 `DATA_MODEL.md` 的映射表 |
| D2 | `Proposal` 机制（`proposed`/`accepted`/`rejected` 三态） | ✅ 已实现：`proposals` 表 + `/api/proposals*`，状态为 `pending → approved → applied`，另有 `rejected` / `failed` / `stale` / `cancelled` | 无缺口。`apply` 前必须 `approved`，支持 `Idempotency-Key` |

---

## 四、排期建议

1. **A2 出链** 仍是唯一需要先做产品决策的项：`links` 现在按无序对去重，要出链必须先决定关系是否方向化。
2. **A4 圈选片段建链接**：内联标记已能按标题点击建关系，圈选任意正文片段还不存在。
3. **B4 OCR / B5 网页剪切**：都未引入，属于 Skills 线阶段二。
4. **Markdown 权威迁移**（ADR-0006）：方向已定、未实施；完成前不要对外宣称"支持本地 Markdown 文件夹"。
5. 校赛收口优先于新功能：所有对外材料必须与当前实现一致（桌面版、三套主题、图谱、提议链路已可用；错题回流仍是规划中）。
