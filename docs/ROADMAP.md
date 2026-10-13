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

### 已完成并有真实代码

| 模块 | 实现位置 |
|---|---|
| Raw 原始笔记：创建、列表、删除（输入校验、长度上限 50000） | `app/api/raw/route.ts`、`lib/raw-storage.ts` |
| AI 整理：调用 DeepSeek 生成结构化 Draft | `app/api/organize/route.ts`、`lib/deepseek.ts` |
| Knowledge：列表、确认入库（Draft 落库）、**字段修改（PATCH）** | `app/api/knowledge/route.ts`、`app/api/knowledge/[id]/route.ts` |
| KnowledgeRelation：关联的创建、列表、删除 | `app/api/relations/route.ts`、`app/api/relations/[id]/route.ts` |
| Backlink **接口**：动态反查相关 Knowledge | `app/api/knowledge/[id]/backlinks/route.ts` |
| Graph **接口**：从 Knowledge + Relation 实时生成 nodes/edges | `app/api/graph/route.ts` |
| ~~Wiki 只读结构~~ | **已于 2026-10-10 整层移除**（`types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts`、`data/wiki.json`）。原因见 `AGENTS.md` 的「决策记录」 |
| AI 问答：`@` 提及式单轮问答，服务端按引用重读真实内容 | `app/api/assistant/route.ts` |
| 工作台 UI：Raw / Knowledge 文件树 + 标签页 | `app/page.tsx` |
| Knowledge 内联编辑：标题右键改名、摘要/正文/概念可改 | `app/page.tsx` + `PATCH /api/knowledge/:id` |
| 首屏门禁：滚轮 / 触摸 / 键盘三种揭示方式 + Three.js 水晶场景 | `components/landing-page.tsx`、`components/landing-crystal-scene.tsx` |
| 界面音效：Web Audio 实时合成、首次询问、偏好持久化 | `components/interface-sound.tsx` |

### 工程与协作

- 存储层统一 `node:fs/promises` 读写 `data/*.json`，文件缺失（`ENOENT`）时返回空而非抛错
- 全部 API 路由 `export const runtime = "nodejs"`
- 样式为 `app/globals.css` 手写 CSS + CSS 变量，**未引入** CSS 框架或 UI 组件库
- 无自动化测试；验证方式是 `pnpm build` + 手动走查 + 接口实测

---

## 三、差距清单

按"当前是否能算达成目标"分档。**这是后续排期的主要依据。**

### A. 与阶段一目标直接相关的缺口（优先级最高）

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| A1 | 笔记能**修改** | Raw 只有 `GET`/`POST`/`DELETE`，**无 PATCH**；Knowledge 有 PATCH | **决策已定（2026-10-10）：允许用户修改 Raw。** 缺口因此变成一个具体的实现项：新增 `PATCH /api/raw` + `RawRevision` 修订记录 + 界面入口。注意 AI 仍**不能**改写 Raw 正文，见 `AGENTS.md` 的「决策记录」 |
| A2 | **出链** | 无此概念 | 代码里只有无向的 `KnowledgeRelation`（服务端按无序 ID 对去重）。要做出链，需要明确"出链 = Relation 的方向化"，或新增有向链接类型 |
| A3 | **反向链接**在界面上一等公民 | 有 `/api/knowledge/:id/backlinks` 接口 | UI 里只有"相关关系"列表，**没有独立的反向链接面板**；接口能力没有被界面用起来 |
| A4 | 反向链接支持**勾选内容进行链接** | 无 | **完全未实现**。当前唯一的建链接路径是：AI 在 Draft 里提建议 → 用户勾选 → 写入。用户主动圈选正文片段建链接的能力不存在 |

### B. 阶段二目标的缺口

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| B1 | 知识图谱可视化笔记间链接 | `GET /api/graph` + `app/page.tsx` 用 `node-position-${index % 6}` 的**规则网格卡片**渲染 | 是静态网格，不是图谱：**不能拖动、缩放、聚焦，也不画连线**。`DESIGN_SYSTEM.md` 要求的"自然布局、知识簇、密度差异"完全没有。**实现方式已定（2026-10-10）：对标 Obsidian 力导向图，`d3-force` + 自绘 Canvas，先局部图谱后全库图谱**，见 `AGENTS.md` 的「决策记录」 |
| B2 | DeepSeek **agent 插件**（工具调用） | `POST /api/assistant` 单轮问答 | **没有工具调用循环**。`agent简易模板.docx` 要求的 `search_notes`/`read_note`/`create_note`/`update_note`/`delete_note`/`get_note_links` 一个都没有；也没有"模型提建议 → 宿主执行 → 结果回传 → 继续推理"的 agent loop |
| B3 | 两套主题 | 只有 `prefers-color-scheme` 跟随系统自动切换 | 没有手动切换的多主题机制 |
| B4 | OCR 图片转 Markdown | 无 | 未实现（MinerU 尚未引入） |
| B5 | 网页剪切 | 无 | 未实现（Clipper 尚未引入） |

### C. UI 阶段一目标的缺口

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| C1 | 首次滑动出现的边框（控灵敏度） | ✅ **已实现** | `components/landing-page.tsx`：滚轮 96px / 触摸 48px / 回车空格 三种揭示方式，`onlyOnce: true` |
| C2 | 边框内的欢迎标语与进入窗口 | ✅ **已实现** | 同文件：`landing-intro` 标语 + `landing-welcome` 面板；首屏还带 Three.js 水晶场景与界面音效 |

### D. 数据模型层面的长期欠账

| # | 目标 | 现状 | 缺口 |
|---|---|---|---|
| D1 | `Note` / `Question` / `Concept` / `Card` 四类节点 | 实现的是 `Raw` / `Knowledge`（原先还有 `WikiPage`，已于 2026-10-10 移除）| 四类节点**完全未实现**，只有概念设计。见 `DATA_MODEL.md` 的映射表 |
| D2 | `Proposal` 机制（`proposed`/`accepted`/`rejected` 三态） | 无 Proposal 实体 | 当前用"AI 在 Draft 里给建议 → 用户勾选 → 直接写入"做了**部分替代**，但没有 Proposal 这个可追溯的中间对象 |

---

## 四、排期建议

1. **先补 A2 / A3 / A4**（出链、反向链接面板、勾选内容建链接）——这是阶段一明确要求且当前缺口最大的一块，且都建立在已有的 Relation 接口上，改造成本相对低。
2. **A1 决策已定**（用户可改、AI 不可改），可以直接排实现：`PATCH /api/raw` + `RawRevision` 修订记录 + 界面入口。
3. **B1 图谱**是阶段二的重点。方案已定：`d3-force`（力学）+ 自绘 Canvas（渲染），先做局部图谱再扩到全库，见 `AGENTS.md` 的「决策记录」。改动量比 A 类大，建议单独排期。
4. **B2 agent 插件**是独立工程量，建议单独排期。注意 `agent简易模板.docx` 中的安全底线：**写操作默认进入审查模式，用户确认后才真正写入**；笔记内容视为不可信数据，需在系统提示词中防御 Prompt Injection。
5. **C1 / C2 / B3** 属 UI 线，可与知识库线并行。
