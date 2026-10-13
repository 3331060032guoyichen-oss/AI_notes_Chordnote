# AGENTS.md — AI 助手入口手册

> 这是给 AI 编码工具（Claude Code、Codex、Cursor、Copilot 等）看的**唯一入口文件**。
> 读完这一份再动手，不要只读 `docs/` 里的某一份——那几份文档写于不同阶段，有些已经过时。

## 项目是什么

AI Notes：面向大学生的生长式 AI 知识系统（校赛 Demo）。

核心链路：`Raw（原始输入）→ Draft（AI 整理草稿）→ 用户确认 → Knowledge（知识页）→ Relation（关联）→ Graph（图谱）`。

**产品原则**：AI 只能提议、用户确认后才写入知识网络；Raw 允许用户修改但 AI 不得改写（详见下文「决策记录」）。

## 仓库与分支

| 项 | 值 |
|---|---|
| 仓库根 | 就是项目根目录，`package.json` / `app/` 等直接在这一层，**没有嵌套的子目录** |
| clone 后的目录名 | `ai-notes_demo`（取自仓库名）。某些本地副本名为 `ai-notes_demo-local`（含下划线），是同一份代码，不要去找这两个名字之外的路径 |
| 远端 | `https://github.com/3331060032guoyichen-oss/ai-notes_demo.git` |
| 默认分支 | `main`（稳定，基本不动） |
| 当前开发分支 | `develop-guozechen`（日常集成，所有新工作在这里） |
| 其他 | `feature/raw-storage` 是 Step 1 的历史分支。远端**没有** `develop` 分支 |

远端分支已用 `git ls-remote` 核实，只有 `main`、`develop-guozechen`、`feature/raw-storage` 三个。若本地还残留 `origin/develop` 引用，那是过期的远程跟踪引用，`git fetch --prune` 清掉即可。

⚠️ **先确认这一条再动手**：上表描述的是**远端仓库**，本机的工作副本可能和它不一致。动手前先执行一次 `git rev-parse --is-inside-work-tree` 确认当前目录的状态；不是仓库就不要用任何 git 命令判断改动或回滚。

**本机工作副本（2026-10-11 起）**：`C:\Users\guozechen\Desktop\ai-notes_demo-main` 已经是**真正的 git 克隆**（不是解压副本），`origin` 指向上面的仓库，跟踪 `main`，本地 `core.autocrlf=input`。改完**必须 `git push`**，否则线上一直跑旧代码（2026-10-11 就是这么掉线的，见决策记录）。

**部署链路**：`main` 有新提交 → Netlify 自动构建并发布站点 `https://hilarious-kheer-89a440.netlify.app`。该站点运行时读 `DATABASE_URL`（指向 Neon `dev` 分支的池化连接串），生产分支未迁移、未连接。

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY
pnpm dev                     # http://localhost:3000
```

- 包管理器是 **pnpm**（`package.json` 里 `packageManager: pnpm@11.25.0`），不要用 npm/yarn 装依赖，会破坏 lockfile 和 `node_modules` 的符号链接结构。
- 没有 `DEEPSEEK_API_KEY` 时：新建笔记、浏览知识库、图谱全部正常，**只有「AI 整理」和右侧 AI 问答会报错**。这是预期行为，不是 bug。
- 首次打开是空白状态（`data/*.json` 不进 Git），需要自己新建笔记。

可用命令：`pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`。

**验证与测试（2026-10-11 新增）**：

- `pnpm test` —— 回归测试（**需先跑 `pnpm dev`**）：覆盖全部 10 个 API 路由 + 跨用户归属隔离，带 pass/fail 与退出码；当前 **47/47 通过**。
- `pnpm verify:db` —— 表 / 约束 / 外键删除行为 / 枚举 CHECK / RESTRICT 验证（写入测试全部在事务内回滚，不需要服务）。
- `pnpm test:cleanup` —— 安全网：清理验证脚本可能遗留的测试数据。
- 契约文档：[`docs/schema.md`](docs/schema.md) —— 英文契约 + 中文注解，**只描述已实现状态**，未实现的统一标注 `NOT IMPLEMENTED`。
- **生产构建验证（2026-10-11）**：`pnpm build`（exit 0）→ `pnpm start` → `pnpm test` → **47/47 通过**，与 dev 一致。构建期**不依赖** `DATABASE_URL`（两处 env 读取都在函数内部，模块顶层不读），因此部署平台缺环境变量也不会让构建失败。

## 实际技术栈（只列真实在用的）

- **Next.js 15.5.26**（App Router）+ **React 19** + **TypeScript 5.9**
- 样式：**手写 CSS**，全部在 `app/globals.css`，用 CSS 自定义属性做设计令牌
- **`three@0.186.0`** —— 已安装，**只用于首屏的碎裂水晶场景**（`components/landing-crystal-scene.tsx`）。不要把它用到知识图谱或别的地方，体积和复杂度都不划算

**真实存在的 `components/`（不是空目录）**：

| 文件 | 作用 |
|---|---|
| `landing-page.tsx` | 首屏门禁。滚轮 96px / 触摸 48px / 回车或空格 三种揭示方式，`onlyOnce: true`；揭示进度写入 `--reveal-progress` |
| `landing-crystal-scene.tsx` | Three.js 水晶场景。WebGL 不可用时降级为海报图 |
| `interface-sound.tsx` | Web Audio 实时合成音效（不加载音频文件）、首次询问、`localStorage` 偏好、`SoundToggle` |

**没有安装**（不要使用，写了也不会生效）：

- ❌ Tailwind CSS —— 没有 `tailwind.config`，没有 `@tailwind` 指令，`clsx` 也没有
- ❌ shadcn/ui、Radix、任何 UI 组件库 —— `components/` 里的 3 个文件都是手写的
- ❌ `react-force-graph-2d` 等"图谱组件库" —— 布局/渲染/交互绑在一起，不采用
- ✅ **例外：`d3-force` 允许引入**（2026-10-10 决策），它只做力学计算、不含渲染；图谱渲染自绘 Canvas。见「决策记录：知识图谱对标 Obsidian」
- ❌ GSAP —— 现有动画全部是 CSS transition / requestAnimationFrame

写新 UI 时请沿用 `app/globals.css` 里已有的类名和 CSS 变量（`--paper` / `--ink` / `--accent` / `--line` / `--radius` 等），不要引入新的样式方案。

## 代码地图

```
app/
  page.tsx          ★ 唯一的页面。单页工作台，"use client"
  globals.css       ★ 约 2880 行，全部设计令牌和组件样式
  layout.tsx        根布局
  api/**/route.ts   10 个路由，每个都 export const runtime = "nodejs"
components/
  landing-page.tsx          首屏门禁（滚动/触摸/键盘揭示）
  landing-crystal-scene.tsx Three.js 水晶场景（WebGL 降级海报）
  interface-sound.tsx       界面音效 + 声音偏好开关
lib/
  deepseek.ts       真实调用 DeepSeek（organize 草稿 + assistant 问答）
  services/             服务层（业务规则 + 归属过滤的唯一落点）
    sources.ts          原始记录：读 + 创建 / 归档
    notes.ts            知识页：读 + 手动提升 / 更新（版本检查 + 写修订）
    links.ts            正式关系：读 + 建立/复活 / 软删除
  auth/                 用户上下文与归属校验
  db/                   Drizzle schema / 枚举 / 连接工厂
types/              raw / organize / knowledge / relation / graph
data/
  raw.json          ❌ gitignore（运行时数据，首次写入时自动创建）
  knowledge.json    ❌ gitignore
  relations.json    ❌ gitignore
docs/               产品/设计/数据/流程文档，见下方"文档地图"
```

### `app/page.tsx` 的关键结构

页面靠一个 `Tab` 联合类型驱动标签页，**不是多路由**：

```ts
type Tab =
  | { kind: "view"; viewKey: "new-note" | "graph"; ... }   // 工具类视图
  | { kind: "raw"; rawId: string; ... }                    // 单条原始笔记
  | { kind: "knowledge"; knowledgeId: string; ... }        // 单条知识页
  | { kind: "draft"; rawId: string; ... }                  // Draft 审阅
```

- 左侧是 Raw / Knowledge **文件树**，点击某条 → `openXxxTab()` 在中间区域开一个标签页
- `navigate(viewKey)` 打开/激活工具类标签（新建笔记、图谱）
- 新增"某类内容"的详情页时，加一个 `Tab` 变体 + 一个 `renderXxxTab()`，**不要**加新路由或新的顶层视图

### API 路由一览

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/raw` | GET / POST / DELETE | 原始笔记。DELETE 时若已被 Knowledge 引用会返回 409 |
| `/api/organize` | POST | 调 DeepSeek 生成 `OrganizeDraft`（不写入） |
| `/api/knowledge` | GET / POST | 列表 / 确认 Draft 落库 |
| `/api/knowledge/[id]` | GET / **PATCH** | 单条读取 / 部分字段更新（标题、摘要、正文等） |
| `/api/knowledge/[id]/relations` | GET | 该知识的关联 |
| `/api/knowledge/[id]/backlinks` | GET | 反向链接（动态查询，不落表） |
| `/api/relations` | GET / POST | 关联列表 / 新建 |
| `/api/relations/[id]` | DELETE | 删除关联 |
| `/api/graph` | GET | 从 Knowledge + Relation 实时生成 nodes/edges |
| `/api/assistant` | POST | AI 问答。服务端按 `contextType` + `contextId` 重新读取真实内容 |

**所有存储层在文件不存在时返回空数组/空对象（`ENOENT` 分支），不抛异常。** 所以部署到 Vercel 这种只读文件系统时，读取不会 500，但**写入会失败**。

## 当前已实现

- 文件树导航 + 标签页工作台（Raw / Knowledge 各自成树，点击开标签）
- 新建笔记 → AI 整理 → 审阅编辑 → 确认入库（Raw → Knowledge）
- 原始记录可编辑：`PATCH /api/raw/:id`（服务端只允许 `user` 主体，每次改动留一条 `audit_log` 修订记录）——**接口已就绪，界面上的编辑入口尚未接**（当前界面只能新建 / 查看 / 移除原始记录）
- Knowledge 内联编辑：标题右键改名、摘要/正文/概念点击编辑（`PATCH /api/knowledge/:id`）
- AI 问答面板：输入 `@` 弹出候选列表，可把某条 Raw/Knowledge 作为提问上下文
- 关系图谱（节点卡片 + 边列表，CSS grid，非力导向）

## 已删除的功能 —— 不要重建

以下功能是**产品决策主动删除的**，不是遗漏。看到旧文档提到它们请忽略：

- ❌ **今日学习 / 复习 / 知识检查** 三个视图（曾经的 `renderToday` / `renderStudy` / `renderLint`）
- ❌ 新建笔记页的**「最近原始笔记」**列表
- ❌ AI 面板的 **5 个罐头按钮**（解释当前内容 / 提炼关键概念 / 生成学习卡片 / 生成小测验 / 检查知识状态）——已换成 `@` 提及问答
- ❌ **参考库（Wiki）整层**（2026-10-10 移除）：`types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts`、左侧"参考库"树、Wiki 标签页、`@` 提及里的 wiki 候选、`/api/assistant` 的 `wiki` 上下文类型，全部已删除。原因见「决策记录」：那 12 页内容本该是给 agent 的工作手册，不是给用户在界面里翻的演示内容

⚠️ **CSS 里还留着它们的死样式**，改动 `globals.css` 时可以顺手清掉（低风险）：`.primary-nav`、`.nav-item`、`.nav-label`、`.recent-link`、`.plugin-heading`、`.plugin-count`、`.plugin-item`、`.plugin-symbol`、`.plugin-arrow`、`.sidebar-section`、`.sidebar-label`、`.sidebar-empty` —— 这 12 个类在 CSS 中有定义，但在 `page.tsx` 里**零引用**。删除前用一次 `rg` 确认当前确实没人用。

另外 `.wiki-preview` / `.wiki-reading` / `.wiki-section` / `.wiki-layout` / `.wiki-tree` / `.wiki-tree-item` 这 6 组也是死样式（**在移除参考库之前就已经没人用了**，属于更早期的遗留），可以一起清掉。

## 决策记录

> 产品/设计决策记在这里，避免同一件事反复讨论，也避免文档之间互相矛盾。

### 2026-10-10：Raw 允许用户修改

**决定**：Raw **允许用户修改**。原先"Raw 不可变"的写法不再准确。

新的边界（两条要同时成立）：

1. **用户可改**：Raw 需要新增修改接口（`PATCH /api/raw`）与界面入口。
2. **AI 仍不可改**：AI 只能读、引用、在 Draft 里引用原文；**任何情况下都不能改写 Raw 的正文**。`lib/deepseek.ts` 的整理链路只能产出 Draft，这一点不变。
3. **修改要可追溯**：Raw 的正文变更需要留下修订记录（谁、何时、改了什么），否则"原始出处"的信任基础会消失。实现方式在 `docs/DATA_MODEL.md` 记。

### 2026-10-10：右侧栏改为「跟随当前标签的上下文面板」

**决定**：右栏（312px）不再是"全局 AI 聊天框"，改成**跟随当前标签**的上下文面板，自上而下四块：

1. 入链 Backlinks
2. 出链 Outgoing links
3. 未链接提及 Unlinked mentions
4. 编辑助理（现有 AI 能力，保留 `@` 追加材料）

理由：产品定位是"AI 增强知识管理"，不是聊天机器人。占满一整栏的聊天框会把产品做成聊天机器人。

### 2026-10-10：正文行高定为 1.75

**决定**：中文正文使用 **16px / 行高 1.75 / 段距 1em / 行宽上限 700px**。参考值是 Obsidian 1.14.4 的 16px / 1.5 / 1rem / 700px，其中行高按中文密度上调到 1.75。完整排版令牌见 `docs/DESIGN_SYSTEM.md`。

### 2026-10-10：不做「最近」列表

**决定**：**不实现**"最近编辑 / 最近查看"列表。左栏**只有四个分组**：原始记录 / 知识页 / 标签 / 参考库。

不要再提"最近"相关的方案或组件，左栏也不要为它预留位置。

### 2026-10-10：知识图谱对标 Obsidian

**决定**：知识图谱不再用"规则网格卡片 + 文字边列表"，改为**力导向图**，对标 Obsidian 1.14.4 的 Graph view。

要复刻的能力（依据是对本机 `obsidian-1.14.4.asar` 的静态分析与其官方文档）：

- 力导向布局，四条可调参数：中心力 / 斥力 / 连线力 / 连线长度
- **节点大小与"被引用次数"成正比**
- 滚轮缩放、拖拽平移（键盘 `+` `-` 与方向键辅助）
- 筛选：按搜索词、按标签、是否显示孤立点
- 分组着色：按查询词把一组节点染成同一颜色
- **局部图谱**：只显示当前笔记的邻居，并支持调整深度（1 层 / 2 层……）
- 时间轴回放：按创建时间依次显示节点

**技术选型（这条覆盖原先的禁令）**：允许引入 **`d3-force`**（只做力学计算，不含渲染），**渲染用自绘 Canvas**。

- 仍未采用 `react-force-graph-2d` 这类"图谱组件库"——布局、渲染、交互绑在一起，定制成本高、体积大。
- `three` 仍然**不用于**图谱。
- 引入 `d3-force` 时登记到 `docs/THIRD_PARTY.md`。

**顺序**：**先做局部图谱**（邻居数量有限、永远可读、成本低），再做全库图谱。笔记少时全库图没有信息量。

### 2026-10-10：UI 方向定为「大气简约 + 苹果产品设计感」

**决定**：界面排版追求**大气、简约**，参考苹果产品的设计感。这是方向调整——之前的排版方案偏"信息密集"。

边界（与既有原则的取舍）：

1. **学苹果的**：大留白、强层级（字号跨度拉开）、严格对齐、少描线（用背景层次代替 1px 边框）、克制的动效（缓出、不弹跳）、浮层才用毛玻璃。
2. **不学的**：装饰性渐变、大面积玻璃拟态、为了好看牺牲信息量。
3. **密度底线**：导航与列表不再用 28px 的密排行高，字号上调到 15px、行高 34–36px；但**每屏可见条目数不低于 12 条**，避免"大气"变成"看着舒服但不好用"。
4. `docs/DESIGN_SYSTEM.md` 的「去 AI 味原则」继续有效，与之不冲突——苹果设计感本身就是克制、内容优先。
5. 毛玻璃**仅限浮层**：命令面板、弹层、抽屉。正文、侧栏、面板一律不透明。
6. 主色保持**钴蓝 `#4a5ac8`**，**不**往苹果系统蓝调（2026-10-10 确认）。
7. `d3-force` 依赖已确认引入（见「知识图谱对标 Obsidian」一条），需要时登记到 `docs/THIRD_PARTY.md`。

### 2026-10-10：使用范围定为「校赛：小范围可信用户」

**决定**：使用范围是**我、同组同学、审查老师**（大致 3–15 人，彼此可信），**不是**公开网络多用户。

**因此明确不做**（把成本省下来做功能）：

- ❌ 账号注册 / 登录体系 —— 改用**一个共享访问口令**保护整站
- ❌ 多租户数据隔离 —— 数据不加 `user_id`
- ❌ 按用户的 AI 配额与计费
- ❌ 完整隐私合规流程 —— 简化为界面上一句说明 + 演示时口头说明

**但必须做到**（否则老师打不开、或看到空数据）：

1. **部署到能持久写入的地方**。数据现在写在 `process.cwd()/data/*.json`：部署到 Vercel 这类只读文件系统会**写入失败**；容器重启或重新部署会**丢数据**。
2. **一个共享访问口令**。网址一旦外流，陌生人就能读写甚至清空演示数据。
3. **预置演示数据**。`data/raw.json` / `knowledge.json` / `relations.json` 都不进 Git，首次打开是空白页，审查前必须准备好内容。
4. **配好 `DEEPSEEK_API_KEY`**。缺失时"AI 整理"与右侧问答会直接报错，而这是评审最会点的地方。

**存储方案选择（按时间与未来野心取舍）**：

| 方案 | 改动量 | 代价 |
|---|---|---|
| 单机常开 + 现有 JSON | 最小 | `writeFile` 非原子操作，崩溃时可能写坏文件；无事务；日后要重做一次 |
| **单机常开 + SQLite**（推荐） | 中等 | 无（单文件但带事务，不需要额外数据库服务）|
| 托管 Postgres | 较大 | 对校赛偏重，但对将来真的公开最稳 |

**已核实的并发结论**：`lib/*-storage.ts` 每个模块都有一个 `writeChain` 写入队列，会把**同一进程内**的写操作串行化。所以几个人同时点保存不会互相覆盖。真正的问题不是并发，而是"文件放在哪里"——多实例部署（如 serverless 多副本）时该队列不起作用。

### 2026-10-10：`data/wiki.json` 的定位纠正 —— 它本该是给 agent 的工作手册

**背景纠正**：`data/wiki.json` 里那 12 页**不是演示数据**，而是把一个原本应该写成文档的东西，错误地实例化成了应用里的页面树。原始意图是：**以 LLM Wiki 作为笔记系统的 `schema.md`，供接入的 agent 当作工作手册**。

**已执行**：`data/wiki.json` 已从项目中移除。备份在 `work/ai-notes-removed/wiki.json`（SHA-256 `FB0E48615C0D055D0C6B67045DF68315A45839612C739029B09829862FA72C3F`，与原件一致，可随时还原）。

**素材没丢，值得复用**。那 12 页的内容其实是工作手册的好素材：

- **三层架构**：Raw Sources（不可变来源层）/ Wiki Layer（可持续维护的页面层）/ **Schema（让 LLM 成为有纪律的维护者）**
- **三个工作流**：Ingest（来源摄取）/ Query（从 Wiki 产生新答案）/ Lint（知识库健康检查）
- Index 与 Log（导航与时间线）
- 人与 LLM 的分工、可选工具与演进边界
- 7 种有向链接语义：`contains` / `supports` / `operates_on` / `maintains` / `indexes` / `records` / `extends`

**已决定并执行（2026-10-10）**：参考库（Wiki）整层从项目里**拿掉**——它只服务于那份内容，留着就是个空壳。已删除：`types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts`；已从 `app/page.tsx` 移除"参考库"树、Wiki 标签页、`wikiKindLabels`、`getWikiDepth`、`wiki` 状态与 `openWikiTab`；已从 `/api/assistant` 移除 `wiki` 上下文类型。

**验证**：`pnpm install --frozen-lockfile` + `pnpm exec tsc --noEmit` 均通过，退出码 0、无类型错误（2026-10-10 实测）。数据库**不需要** wiki 相关表。剩余的死 CSS 见上文「已删除的功能」一节。

### 2026-10-10：数据库删除策略与枚举约束（批量决策）

**删除与历史保留**

- `notes` 与 `raw_notes` 都进入**归档优先**治理；普通业务 API 只做 archive / restore，**不做物理删除**。
- `note_revisions`、`proposals`、以及 `links` 两端对 `notes` 的外键一律 **RESTRICT**：任何删除都不会静默带走历史或正式关系。
- `audit_log` **没有外键**，天然不受任何级联影响。
- **必然结果（预期行为，不是 bug）**：每条笔记创建时都会写入 v1 修订，因此加了 RESTRICT 之后**笔记无法被物理删除**，除非先显式处理它的修订、提议与关系。
- **历史保留采用墓碑式软删（已确认）**：`notes.deleted_at` 为墓碑标记，普通删除只打标记；**笔记行、修订、提议、正式关系、审计链全部保留**；常规查询排除 `deleted_at is not null`；**恢复 = 清空 `deleted_at`**。`archived_at`（收起）与 `deleted_at`（墓碑）是两个独立状态。
- **永久清除（purge）另行设计**：必须走独立高风险流程（显式授权 + 单事务内按固定顺序显式删除 + 写审计），**不得靠外键级联静默完成**。接口形态与权限等级尚未设计。
- 待改造：`DELETE /api/raw` 目前是**硬删除**（被知识页引用时 409）。**已决定暂不修改旧 JSON 存储层**，随数据库存储层重写一起改成归档 / 墓碑机制。

**枚举与约束**

- 语义区分：`origin` = **内容来源**（`user | ai`）；`actor_type` / `author_type` = **操作主体**（`user | agent | system`）。不要机械把 `ai` 替换成 `agent`。
- `links.origin` 经项目方确认：**内容来源语义**，取值 `user | ai`（与其他三个 `origin` 字段一致：`notes.origin` / `note_tags.origin` / `proposals.origin`）。四个 `origin` 字段语义统一为"这条记录由谁产生"，**不是操作主体**；操作主体只用 `actor_type` / `author_type`（`user | agent | system`）。
- `links.type` 当前只允许 `related`（全仓无其它取值证据）。
- **枚举的唯一来源是 `lib/db/enums.ts`**：数据库 CHECK、列的 TS 联合类型、后续 API/服务层校验都从它引用。当前已加 11 个 CHECK。
- `note_ai_metadata.status` **故意不加 CHECK**：该表尚无任何写入路径、合法值集未确认。
- `updated_at` **没有触发器**，由服务层每次更新时显式写入；漏写不会报错（DEFAULT 只作用于 INSERT），因此必须有测试守卫。
- `notes` 索引暂缓，待真实查询计划与数据规模决定。

**迁移**

- 新增 `drizzle/0001_icy_starbolt.sql`（**追加迁移，不重写 `0000`**）：4 个外键改 RESTRICT、11 个 CHECK、`raw_notes.archived_at`。
- 新增 `drizzle/0002_lovely_power_pack.sql`：`notes.deleted_at`（墓碑列）。
- 新增 `drizzle/0003_lean_bloodscream.sql`：`links.deleted_at`（关系可恢复软删除）。
- 三个迁移**都未执行**：未连接任何数据库、未触碰 production 分支。

**删除生命周期（2026-10-10 二次确认，共 7 条）**

1. **两步走**：先 soft-delete / 移入回收站，再由用户**单独**执行 purge；**purge 只允许作用于已软删除的笔记**。
2. **Agent 没有 purge 路径**：MVP **不新增 `proposals.kind`**；Agent 最多**建议归档**（以建议形式呈现，不落 proposals 表）；**永久清除只能由用户在 UI 手动发起**。
3. **`links` 普通删除 = 可恢复软删除**（`deleted_at`），常规查询隐藏已删除关系。**关键约束**：`links_pair_idx` 是完整唯一索引、**不是部分索引**，所以重新建立同一关系时必须**复活已有行**（清空 `deleted_at`），不能插入新行。
4. purge **必填简短原因**（写入 `audit_log.detail.reason`）。
5. 确认方式：**明确的二次确认弹窗 + 永久删除按钮**，**不要求**输入标题。
6. purge 笔记时 **`raw_notes` 不级联删除**，独立保留。
7. 审计 manifest **允许保留标题快照**。

完整设计见 `outputs/10-purge永久清除设计.md`（含事务顺序、manifest 字段、幂等与并发策略、13 条测试用例）。

### 2026-10-10：本轮实施范围、批次与基础设施口径

**范围（本轮只做这些）**

- 把 10 个路由从本地 JSON 存储切到**统一服务层 + Drizzle**，并修复切换导致的回归；保证核心 CRUD 与现有页面正常。
- **不新增**搜索、图谱、UI 规范相关功能。
- **知识页只能"从原始记录手动提升"创建**：`notes.raw_id` 保持 `NOT NULL` + RESTRICT，**不新增迁移 `0004`**。
- **AI 端点（`/api/organize`、`/api/assistant`）改用新数据层并保持可用**，不扩展 AI 功能。

**批次（每批结束时该批路由必须全部切换完，不留半切换状态）**

| 批次 | 内容 | 状态 |
|---|---|---|
| B1 | 数据访问层 + 纯只读文件（graph / backlinks / knowledge[id]/relations / organize / assistant）| ✅ 已完成并实测 |
| B2 | `raw_notes` 写路径（创建；`DELETE /api/raw` 改**归档**）| ✅ 已完成并实测 |
| B3 | `notes` 写路径（手动提升 + 版本检查 + 写 `note_revisions`）| ✅ 已完成并实测 |
| B4 | `links` 写路径（创建 / 软删 / **复活**）| ✅ 已完成并实测 |

**B1–B4 全部完成（2026-10-11）**：10 个路由全部走服务层 + Drizzle，全仓已无 `*-storage` 引用；每批都有独立验证脚本（`scripts/b1–b4-verify.mjs`）与安全网脚本（`scripts/cleanup-verify-rows.mjs`），全部实测通过、库内清零。旧存储模块已无人引用但**尚未删除**（目录无 git，删除不可恢复）。

**旧存储模块已删除（2026-10-11）**：`lib/raw-storage.ts`、`lib/knowledge-storage.ts`、`lib/relation-storage.ts` 已删除；删前备份到工作区之外（`work/ai-notes-removed/legacy-storage/`，SHA256 与原件一致），并完成全局审计（静态引用仅存在于文档、无动态导入、旧函数名无调用方）。删除后 `tsc` 与 `pnpm build` 均退出码 0。

**归属过滤已覆盖全部读写路径**：`lib/services/{sources,notes,links}.ts` 的查询、更新、删除共 11 处都带 `user_id` 条件；`scripts/isolation-verify.mjs` 用另一 `user_id` 造数据后实测——他人数据在所有入口都读不到、改不动、删不掉，且对方数据未被改动。

**批次划分原则（执行 B1 时修正）**：按**文件整体切换**，不按"只读入口"切换。含写方法的文件若只切 GET，会出现"读走数据库、写走 JSON"，导致写进去的读不出来。

**已知待办**：服务层读路径**尚未按 `user_id` 过滤**（演示期单用户下行为等价，但归属隔离是 Phase D 目标之一）；`raw_notes` **没有 `deleted_at`**，raw 目前只有归档、没有墓碑（要加需一次新迁移）。

**B3 要点**：`POST /api/knowledge` 仍接收 `{ rawId, draft }`（draft 可由界面手工组装，即"手动提升"），新增可选 `origin`（默认 `user`，AI 流程应传 `ai`）；PATCH 支持可选 `version` 做乐观并发（不匹配 → `409 VERSION_CONFLICT`，不写入）；`Knowledge.version` 现在会随响应返回。验证脚本：`scripts/b1/b2/b3-verify.mjs`、安全网 `scripts/cleanup-verify-rows.mjs`。

**备份与恢复（不自行建设）**

- 使用 Neon 现有能力，**不自建备份系统**。
- 实测：组织套餐 **`free`**；项目 `history_retention_seconds = 21600`（**6 小时**）；免费套餐历史窗口上限即 6 小时 / 1 GB（来源：Neon 官方 *History window* 文档，2026-10-10）。
- **后果（必须知道）**：**超过 6 小时没有内容级恢复手段**。这正是 purge 必须有二次确认 + 必填原因 + 审计留痕的原因。升级套餐可延长（Launch 上限 7 天、Scale 上限 30 天），属成本决策。

**迁移状态（2026-10-11 更新）**：

- ✅ **已在 dev 分支执行成功**：`0000`–`0003` 四份全部应用（`drizzle-kit migrate`，使用直连串），`drizzle.__drizzle_migrations` = 4 条。
- **`production` 分支仍未执行任何迁移**，本会话从未连接或修改它。
- 验证脚本：`scripts/db-verify.mjs`（可重复运行；写入测试全部在事务内回滚，不留数据）。实测结果：`public_tables=11`、CHECK=11、外键=8 且删除行为全部符合设计（`note_revisions` / `proposals` / `links` 两端 / `notes.raw_id` = restrict，`note_tags` / `note_ai_metadata` = cascade）、三个新增列均为可空、非法枚举被拒（`23514`）、有修订时删笔记被拒（`23001`）、验证后四张表行数为 0。
- ⚠️ **发现：项目已开通 Neon Auth**，其 9 张表位于独立的 `neon_auth` schema（`tables_per_schema=… neon_auth:9 public:11`），与我们的 `public` 表互不干扰；本轮不使用，但需知晓它占用少量存储。
- **注意**：`0000` 建的外键是 `cascade`，由 `0001` 改成 `restrict`——**必须按序全部执行，只跑 `0000` 会留下危险中间态**。

### 2026-10-11：原始记录可编辑（补齐"未完成 A"）+ jsonb 编码修复

**背景**：此前记录的决策「Raw 允许用户修改」只有决策、没有代码——`app/api/raw` 只有 GET / POST / DELETE，用户改不了原文。

**已实现**：`PATCH /api/raw/:id`（`{ text }`）+ 服务层 `updateSource()`。

- `user_edit` 语义：用户在界面上改自己的原话，不需要提议、不需要自我审批；正文相同视为无改动（`changed: false`，不写库）。
- 只有 `user` 主体可调用：`requireUserActor()` 是这次第一次真正被调用，Agent 主体 → `403 USE_PROPOSAL_FLOW`（不允许借普通用户编辑接口绕过提议机制）。
- 修订记录写在 **`audit_log`**（`operation='raw.update'`、`detail={before,after,version}`），与正文更新同一事务；`raw_notes.version` 每次修改 +1。**没有新增表、没有新增迁移**。若将来要做"逐版本对比 / 回滚到某版"的界面，再单开 `raw_revisions` 表并追加迁移。
- 长度上限抽成 `MAX_RAW_TEXT_LENGTH`（`lib/services/sources.ts`），POST 与 PATCH 共用，避免两处各写一个数字。

**顺带修掉一个潜在数据缺陷（jsonb 二次编码）**：Drizzle 的 jsonb 列在 `mapToDriverValue` 里已经 `JSON.stringify` 一次，而服务层又手动 stringify 了一次，导致 `notes.concepts` / `key_points` / `keywords`（以及 `note_revisions` 的副本）在库里实际是 **jsonb 字符串**而不是数组。读路径因为 Drizzle 的 `mapFromDriverValue` 会 `JSON.parse` 而看不出问题，但 SQL 层（`concepts ? 'x'`、`jsonb_array_elements`、GIN 索引）全都失效——这会直接卡住后续"按概念检索 / Agent 用 SQL 找相关笔记"。已改为直接传数组 / 对象；dev 库当时是 0 行，**没有历史数据需要修**。

**测试**：`scripts/regression.mjs` 扩到 60 项断言，新增 raw 修改的成功 / 固定形状 / 空文本 / 超长 / 缺字段 / 不存在 / 相同内容不写修订、修订记录含改前原文、知识页出处跟随新正文、跨用户改他人原话 404、jsonb 列类型是真数组，并在清理时把 `audit_log` 一并清零。实测 60/60 通过（本地 dev + 生产构建模式）。

**未接的部分**：界面还没有"编辑原话"的入口（接口已可用）。

### 2026-10-11：线上掉线复盘 —— 部署的代码版本与工作副本

**现象**：线上站点读取永远返回空、写入全部 500（`RAW_STORAGE_WRITE_FAILED`），而本地一切正常。

**根因**：Netlify 构建自 GitHub 仓库，而仓库里**一直是旧的文件存储版**（`lib/raw-storage.ts` / `lib/knowledge-storage.ts` / `lib/relation-storage.ts` 都在，`lib/db/`、`lib/services/`、`drizzle/` 全都不存在）。Phase D 的存储层切换只存在于本机解压副本里，**从未推送**。旧版把数据写进服务器本地 JSON 文件，而 Netlify 函数目录只读，所以写入必然失败、读取必然为空；数据库从头到尾没被碰过。

**已修复**：把当前代码推到 `main`（`4bcf944`），Netlify 自动重建后线上回归 47/47 通过（10 个路由的真实读写 + 跨用户隔离）。

**工作副本改造**：`C:\Users\guozechen\Desktop\ai-notes_demo-main` 现在是真正的 git 克隆（`origin` = 仓库，跟踪 `main`），本地 `core.autocrlf=input`。

**教训（改完必须推送）**：不推送 = 线上永远跑旧代码，而且表面上一切正常（首页 200、读取返回空列表，不像故障）。以后判断"线上是不是最新代码"，用"往 dev 库插一条行、看线上接口能否读到"这种交叉验证，不要只看页面能不能打开。

**顺带修复**：`.gitignore` 从只忽略 `.env` / `.env.local` / `.env.*.local` 改成忽略所有 `.env*`（保留 `.env.example`），避免 `.env.production` 这类文件被误提交到公开仓库。

## 改动边界

- **Raw 用户可改、AI 不可改**：用户可以通过 `PATCH /api/raw/:id` 直接修改（不需要提议），每次修改都在同一事务里写一条 `audit_log` 修订记录（含改前 / 改后原文）；Agent 主体调用会被 `requireUserActor()` 拒绝（`403 USE_PROPOSAL_FLOW`），永远不能改写 Raw 的正文。详见上文「决策记录」。
- **AI 不自动写入**：AI 只生成草稿或回答，落库必须经过用户确认。
- **右栏是上下文面板**：入链 / 出链 / 未链接提及 / 编辑助理四块，跟随当前标签。不要把它退回成全局聊天框，也不要为 AI 单独做一套视觉语言。
- **不要再重建参考库 / Wiki 层**：它已按 2026-10-10 决策整层移除，`data/*.json` 三个文件都是运行时数据（不进 Git，不要提交）。将来若要做"Wiki 承载四类节点"，以新形态重新设计，不要恢复旧结构。
- **API Key 只在服务端**：`DEEPSEEK_API_KEY` 从环境变量读，永远不要传到浏览器或写进代码。`.env.local` 已被 gitignore。
- 改 Knowledge 的字段结构时，要同时改 `types/knowledge.ts`、`lib/services/notes.ts` 的映射、以及 `PATCH` 路由的校验。

## 文档地图

| 文件 | 状态 |
|---|---|
| `AGENTS.md`（本文件） | ✅ **权威**，冲突时以这里为准 |
| `docs/ROADMAP.md` | ✅ 有效（目标 / 现状 / 差距对照，排期依据） |
| `docs/PROJECT_RULES.md` | ✅ 有效（产品方向与四类节点的长期模型） |
| `docs/DATA_MODEL.md` | ✅ 有效（区分长期模型 vs 当前实际 schema，注意别混） |
| `docs/DESIGN_SYSTEM.md` | ✅ 有效（视觉规范，含与当前实现的差距说明） |
| `docs/DEV_WORKFLOW.md` | ✅ 有效（分支与提交规范） |
| `docs/PROJECT_CONTEXT.md` | ⚠️ 阶段性状态记录，可能滞后于代码 |
| `docs/THIRD_PARTY.md` | ✅ 有效（第三方依赖登记表） |
| `docs/CODEX_AI_LEARNING_UI_BRIEF.md` | ⚠️ **历史 brief，已过时**。文中要求做 Study / Lint / 力导向图谱，这些已被推翻。仅作背景参考，**不要照着做** |
| `docs/HANDOVER.md` | ✅ 有效（交接给协作者的操作说明：环境、红线、验证流程、任务清单、可直接粘贴给 AI 的提示词） |
| `docs/reports/01`–`12` | ⚠️ 阶段性报告（竞品研究 / 审计 / 选型 / 架构 / 迁移复核 / 存储层切换），记录当时的判断与依据，**描述的是历史状态，不要当成当前代码说明** |
| `docs/reports/13-界面走查问题清单与下一步.md` | ✅ 有效（2026-10-11 界面走查的问题清单与后续计划，配 `docs/screenshots/`） |
| `README.md` | ✅ 面向人的简述 |

## 已知坑

1. **目录名有多个写法**：clone 出来是 `ai-notes_demo`；本机可能叫 `ai-notes_demo-local`（含下划线）。常被写错成全连字符的 `ai-notes-demo-local` —— 那个路径不存在，`cd` 会直接失败。
2. **行尾假象**：本机克隆已设 `core.autocrlf=input`。若 `git status` 突然列出一大片"被修改"、但 `git diff` 没有任何内容差异（本仓库文件是 LF），那是索引 stat 缓存过期，跑一次 `git add -A` 即可清干净，不要用 `git checkout -- .` 去"修"。
3. **`tsconfig.tsbuildinfo`** 是 TypeScript 增量构建缓存，已在 `.gitignore` 中，不要提交。
4. **`pnpm build` 会打印一条 ESLint 报错**（`Cannot find module 'eslint-plugin-react-hooks'`）。构建仍然成功退出（exit 0），这是已知的 lint 插件缺失，不影响产物。
5. **不要跑 `pnpm build` 的同时开着 `pnpm dev`** —— 两者共用 `.next/` 目录，会互相覆盖导致 dev server 报 `Cannot find module './xxx.js'`。
6. 在 Windows + Git Bash 下，路径含中文用户名时 `cd` 偶尔会因编码失败；把 `cd` 和后续命令写在同一条命令里，或用相对路径。
