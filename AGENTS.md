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
| 当前开发分支 | **`main`**（2026-10-17 核实：近期提交都在 main 上）|
| 其他 | `develop-guozechen`、`feature/raw-storage`、`docs/readme-rendered-visuals`、`backup/pre-align-20261015` 是历史分支，**不要往它们上面继续开发** |

多个人协作时再按 `docs/DEV_WORKFLOW.md` 走"从 main 开 feature 分支 → PR → 合并"；一个人做的时候直接提交 **main**，提交后立刻 `git push`。

⚠️ **先确认这一条再动手**：上表描述的是**远端仓库**，本机的工作副本可能和它不一致。动手前先执行一次 `git rev-parse --is-inside-work-tree` 确认当前目录的状态；不是仓库就不要用任何 git 命令判断改动或回滚。

**本机工作副本（2026-10-11 起）**：`C:\Users\guozechen\Desktop\ai-notes_demo-main` 已经是**真正的 git 克隆**（不是解压副本），`origin` 指向上面的仓库，跟踪 `main`，本地 `core.autocrlf=input`。改完**必须 `git push`**，否则线上一直跑旧代码（2026-10-11 就是这么掉线的，见决策记录）。

**运行形态（2026-10-17 起）**：应用跑在使用者本机，知识库也在本机。**没有部署链路，也没有要填的连接串**——不需要任何外部服务，`pnpm install && pnpm dev` 就能用。对外交付的是仓库本身，不是网址。理由见 `docs/adr/0003-local-embedded-postgres.md`。

## 快速开始

```bash
pnpm install
cp .env.example .env.local   # 可选：填入 DEEPSEEK_API_KEY
pnpm dev                     # http://localhost:3000
```

- 包管理器是 **pnpm**（`package.json` 里 `packageManager: pnpm@11.25.0`），不要用 npm/yarn 装依赖，会破坏 lockfile 和 `node_modules` 的符号链接结构。
- **零配置**：知识库是跑在应用进程内的 PGlite（PostgreSQL 的 WASM 版），数据落在 `data/pglite`，首次启动自动建目录并补齐 `drizzle/` 里的迁移。不需要数据库服务，也不需要联网。
- 没有 `DEEPSEEK_API_KEY` 时：新建笔记、浏览知识库、图谱全部正常，**只有「AI 整理」和右侧 AI 问答会报错**。这是预期行为，不是 bug。
- 首次打开是空白状态（本机库是新库，仓库里只有 `data/.gitkeep`），需要自己新建笔记，或者 `pnpm seed:demo` 播一批演示内容。

可用命令：`pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`。

**验证与测试（2026-10-17 用本地库重写）**：

- `pnpm test` —— 回归测试（**需先跑 `pnpm dev`**）：**75 条断言全绿**，覆盖全部 API 路由（含知识包导出/导入、归档视图、未知 id 的 404 面），带 pass/fail 与退出码；**断言只针对本次测试自己造的数据**，因此库里播了演示内容（`pnpm seed:demo`）也能跑绿。
- `pnpm test` 现在**完全不连数据库**（走纯 HTTP）。原因见「已知坑」第一条：PGlite 单写者，第二个进程连同一份目录会读到过期快照。副作用是它用完的数据只能**归档**清场，会在库里留下已归档行（日常视图看不到）；要彻底清空就 `pnpm seed:reset -- --yes`。
- `pnpm verify:db` —— 离线跑：在**干净的内存库**上按顺序执行 `drizzle/` 的迁移，然后断言表数量（11）、约束构成、外键删除行为、索引落地、jsonb 真为数组、非法关系类型被 CHECK 拒绝、同一对关系只能一行、**归属隔离在 SQL 层成立**、`raw_notes` 被知识页引用时删不掉。不需要 dev server，不碰本机数据。

**演示数据（2026-10-16 新增，2026-10-17 改为「少而密」）**：

- `pnpm seed:demo` —— 按 `seed/demo-notes.json` 幂等写入演示内容（**需先跑 `pnpm dev`**，走 HTTP 复用服务层写入路径）。只增不删；可用 `SEED_BASE_URL` 打到线上站点。
- `pnpm seed:reset` —— 换一批演示内容时先清空业务表。**必须先停掉 `pnpm dev`**（PGlite 单写者，脚本会探测 3000 端口并拒绝运行）。**默认 dry-run**，只打印将要删除的行数；确认后加 `--yes` 真正执行，删除前会把九张表完整备份到 `.tmp/`（已 gitignore）。删除顺序由外键策略决定（`notes` 被 RESTRICT 引用，`raw_notes` 被 `notes` 引用），**不要手工调整**。这是唯一的物理删除入口——界面上没有，归档不算删除。
- **当前数据源只有 4 条**：4 条原始记录 / 4 张知识页 / 5 条关联，全部落在《数值分析》的「浮点数精度 → 误差传播 → 数值稳定性」这一条主线上。侧栏因此只有「原始记录 4 / 笔记 4」，图谱是一个几乎闭合的小簇（6 对关系连了 5 对）。
- **有意留一条不连**：`IEEE 754 双精度结构 ↔ 数值稳定性` 不建关联，而两页正文里都提到对方 —— 右栏「未链接提及」于是永远有一条可现场点的「＋ 建立关联」。这是演示「提到 ≠ 连上，连接要你点一下」的入口；连上之后六对关系全闭合。**不要再加第 5 条笔记**来凑演示点。
- 换数据前先 `pnpm seed:reset -- --yes` 再 `pnpm seed:demo`：seed **只增不删**，直接跑只会往旧数据上叠加。`seed/demo-notes.json` 的 `_设计意图` 写明了每个演示点（留一条待关联、孤立节点开关怎么演示、Agent 用哪条材料）。
- 契约文档：[`docs/schema.md`](docs/schema.md) —— 英文契约 + 中文注解，**只描述已实现状态**，未实现的统一标注 `NOT IMPLEMENTED`。
- **生产构建验证（2026-10-11，当时还是云库）**：`pnpm build`（exit 0）→ `pnpm start` → 回归通过，与 dev 一致。切到本地库之后这条要重新跑一遍才算数。

## 实际技术栈（只列真实在用的）

- **Next.js 15.5.26**（App Router）+ **React 19** + **TypeScript 5.9**
- 样式：**手写 CSS**，全部在 `app/globals.css`，用 CSS 自定义属性做设计令牌
- **`three@0.186.0`** —— 已安装，**只用于首屏那套视觉**（`components/landing-particle-field.tsx`）。不要把它用到知识图谱或别的地方，体积和复杂度都不划算
- **`d3-force`** —— 只做知识图谱的力学计算，渲染是自绘 Canvas（见「决策记录：知识图谱对标 Obsidian」）
- **`@tsparticles/*`** —— 只用于背景星尘（首屏与工作台共用一份配方，见 `components/landing-stardust.tsx`）
- **`drizzle-orm` + `@electric-sql/pglite`** —— 持久化。数据在**本机** `data/pglite`（PostgreSQL 方言，WASM，进程内）

**真实存在的 `components/`（不是空目录）**：

| 文件 | 作用 |
|---|---|
| `landing-page.tsx` | 首屏门禁。滚轮 96px / 触摸 48px / 回车或空格 三种揭示方式，`onlyOnce: true`；揭示进度写入 `--reveal-progress` |
| `landing-constellation.tsx` / `landing-particle-field.tsx` | 首屏的星座与 Three.js 粒子场（`landing-crystal-scene.tsx` 已被它们取代）|
| `landing-stardust.tsx` | 五彩星尘（tsParticles）。首屏与工作台共用一份配方：`LANDING_TUNING` / `APP_TUNING` |
| `interface-sound.tsx` | Web Audio 实时合成音效（不加载音频文件）、首次询问、`localStorage` 偏好。**开关在「设置 → 主题」里，顶栏与侧栏底部都不放**（见决策记录） |
| `graph-view.tsx` | 知识图谱。`d3-force` 力学 + Canvas 自绘；单击选中出卡片、双击打开知识页、拖动即固定 |
| `settings-panel.tsx` | 设置抽屉（主题 / 模型 / API / 数据）。**数据页是知识包导出与导入的唯一入口** |

**没有安装**（不要使用，写了也不会生效）：

- ❌ Tailwind CSS —— 没有 `tailwind.config`，没有 `@tailwind` 指令，`clsx` 也没有
- ❌ shadcn/ui、Radix、任何 UI 组件库 —— `components/` 里的每个文件都是手写的
- ❌ `react-force-graph-2d` 等"图谱组件库" —— 布局/渲染/交互绑在一起，不采用
- ✅ **例外：`d3-force` 允许引入**（2026-10-10 决策），它只做力学计算、不含渲染；图谱渲染自绘 Canvas。见「决策记录：知识图谱对标 Obsidian」
- ❌ GSAP —— 现有动画全部是 CSS transition / requestAnimationFrame

写新 UI 时请沿用 `app/globals.css` 里已有的类名和 CSS 变量（`--paper` / `--ink` / `--accent` / `--line` / `--radius` 等），不要引入新的样式方案。

## 代码地图

```
app/
  page.tsx          ★ 唯一的页面。单页工作台，"use client"
  globals.css       ★ 约 5500 行，全部设计令牌和组件样式
  layout.tsx        根布局
  api/**/route.ts   每个路由都 export const runtime = "nodejs"；清单见上面的「API 路由一览」
components/
  landing-page.tsx          首屏门禁（滚动/触摸/键盘揭示）
  landing-constellation.tsx 首屏星座
  landing-particle-field.tsx 首屏 Three.js 粒子场
  landing-stardust.tsx      五彩星尘（首屏 + 工作台共用配方）
  interface-sound.tsx       界面音效 + 声音偏好开关
  graph-view.tsx            知识图谱（d3-force + 自绘 Canvas）
  settings-panel.tsx        设置抽屉（主题 / 模型 / API / 数据）
lib/
  deepseek.ts       真实调用 DeepSeek（organize 草稿 + assistant 问答 + 改写提议）
  inline-refs.ts    正文里的内联知识点标记（按标题匹配，与右栏同一口径）
  text-diff.ts      逐行 LCS，供「编辑助理」的 Diff 卡用
  zip.ts            手写 zip 写入器（store 模式、零依赖），只给 markdown 知识包用
  agent/            Agent 工具循环（loop.ts）与工具手册（manual.ts，步骤名用学习语汇）
  services/             服务层（业务规则 + 归属过滤的唯一落点）
    sources.ts          原始记录：读 + 创建 / 归档
    notes.ts            知识页：读 + 手动提升 / 更新（版本检查 + 写修订）
    links.ts            正式关系：读 + 建立/复活 / 软删除
    proposals.ts        提议状态机（pending → approved → applied / rejected / stale）
    bundle.ts           知识包导出 / 导入（JSON 快照 + markdown zip）
  auth/                 用户上下文与归属校验
  db/                   Drizzle schema / 枚举 / 连接工厂
types/              raw / organize / knowledge / relation / graph / proposal / agent
seed/               demo-notes.json + 播种 / 重置脚本
drizzle/            迁移 0000–0005（**已迁到 Postgres，不再有本地 JSON 数据层**）
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
| `/api/raw` | GET / POST / DELETE | 原始笔记。`?scope=archived` 读已归档的（与 knowledge 同口径）；DELETE 时若被**在用的** Knowledge 引用会返回 409 |
| `/api/organize` | POST | 调 DeepSeek 生成 `OrganizeDraft`（不写入） |
| `/api/knowledge` | GET / POST | 列表 / 确认 Draft 落库 |
| `/api/knowledge/[id]` | GET / **PATCH** | 单条读取 / 部分字段更新（标题、摘要、正文等） |
| `/api/knowledge/[id]/relations` | GET | 该知识的关联 |
| `/api/knowledge/[id]/backlinks` | GET | 反向链接（动态查询，不落表） |
| `/api/relations` | GET / POST | 关联列表 / 新建 |
| `/api/relations/[id]` | DELETE | 删除关联 |
| `/api/graph` | GET | 从 Knowledge + Relation 实时生成 nodes/edges |
| `/api/assistant` | POST | AI 问答。服务端按 `contextType` + `contextId` 重新读取真实内容 |
| `/api/assistant/propose` | POST | 编辑助理针对一张知识页生成**改写提议**（`note_update`）。只落 `pending` 提议，不写正文 |
| `/api/agent/organize` | POST | Agent 工具循环，返回 `AgentRunTrace`（步骤 + 待确认提议） |
| `/api/proposals` | GET / POST | 提议列表（`status` / `targetNoteId` 过滤）/ 提交提议 |
| `/api/proposals/[id]/approve` `reject` `apply` | POST | 决议与执行（`apply` 需要已 `approved`，支持 `Idempotency-Key`） |
| `/api/export` | GET | 知识包导出。默认返回 JSON 全量快照；`?format=markdown` 返回 markdown + YAML frontmatter 打成的 zip |
| `/api/import` | POST | 导入知识包。`?dryRun=1` 只算数不写库；同名（原始记录没有标题时按正文）一律保留已有、跳过导入 |

**存储是 PostgreSQL 方言（PGlite），不存在"文件不存在时返回空数组"那套分支。**本地库首次启动即建好表结构，所以读取不会因为没有数据库而 500；真出问题请先看 dev server 终端里迁移那一段的报错。

## 当前已实现

- 文件树导航 + 标签页工作台（Raw / Knowledge 各自成树，点击开标签）
- 新建笔记 → AI 整理 → 审阅编辑 → 确认入库（Raw → Knowledge）
- 原始记录可编辑：`PATCH /api/raw/:id`（服务端只允许 `user` 主体，每次改动留一条 `audit_log` 修订记录）——**接口已就绪，界面上的编辑入口尚未接**（当前界面只能新建 / 查看 / 移除原始记录）
- Knowledge 内联编辑：标题右键改名、摘要/正文/概念点击编辑（`PATCH /api/knowledge/:id`）
- 知识页归档 / 恢复：归档后不再出现在日常目录与图谱入口里，左栏「已归档 N」分组可恢复（`GET /api/knowledge?scope=archived`、`PATCH /api/knowledge/:id { archived }`）。归档**不写修订历史**（它没改正文），但写审计
- 知识包导出 / 导入（设置 → 数据）：JSON 全量快照（含修订历史，可导回来）+ markdown 知识包（zip，任何 markdown 工具都能读）
- AI 问答面板：输入 `@` 弹出候选列表，可把某条 Raw/Knowledge 作为提问上下文
- 知识图谱：`d3-force` 力学 + Canvas 自绘（不是节点卡片列表）。单击选中出卡片、双击打开知识页、拖动即固定（详见「图谱拖动语义」）

## 已删除的功能 —— 不要重建

以下功能是**产品决策主动删除的**，不是遗漏。看到旧文档提到它们请忽略：

- ❌ **今日学习 / 复习 / 知识检查** 三个视图（曾经的 `renderToday` / `renderStudy` / `renderLint`）
- ❌ 新建笔记页的**「最近原始笔记」**列表
- ❌ AI 面板的 **5 个罐头按钮**（解释当前内容 / 提炼关键概念 / 生成学习卡片 / 生成小测验 / 检查知识状态）——已换成 `@` 提及问答
- ❌ **参考库（Wiki）整层**（2026-10-10 移除）：`types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts`、左侧"参考库"树、Wiki 标签页、`@` 提及里的 wiki 候选、`/api/assistant` 的 `wiki` 上下文类型，全部已删除。原因见「决策记录」：那 12 页内容本该是给 agent 的工作手册，不是给用户在界面里翻的演示内容
- ❌ **`POST /api/notes`（一次写出 raw + knowledge）**（2026-10-17 移除）：它让「新建」直接产出知识页，绕过了「整理助手提议 → 用户确认」这一步 —— 而那是整个产品主张本身。新建只准写 Raw（`POST /api/raw`）；知识页只能由 `POST /api/knowledge`（整理稿确认后）产生。回归测试里有一条 `POST /api/notes → 404` 守着它

⚠️ **CSS 里还留着它们的死样式**，改动 `globals.css` 时可以顺手清掉（低风险）：`.primary-nav`、`.nav-item`、`.nav-label`、`.recent-link`、`.plugin-heading`、`.plugin-count`、`.plugin-item`、`.plugin-symbol`、`.plugin-arrow`、`.sidebar-section`、`.sidebar-label`、`.sidebar-empty` —— 这 12 个类在 CSS 中有定义，但在 `page.tsx` 里**零引用**。删除前用一次 `rg` 确认当前确实没人用。

另外 `.wiki-preview` / `.wiki-reading` / `.wiki-section` / `.wiki-layout` / `.wiki-tree` / `.wiki-tree-item` 这 6 组也是死样式（**在移除参考库之前就已经没人用了**，属于更早期的遗留），可以一起清掉。

## 决策记录

> 产品/设计决策记在这里，避免同一件事反复讨论，也避免文档之间互相矛盾。

### 2026-10-17：知识库落到本机（PGlite 取代云 Postgres），可分享的网址退场

**背景**：这条要跟「把网址发给评委打开」做交换。纯 Web 部署下，函数文件系统只读，数据只能放云端，"留在用户本机"就做不到。产品主张里「原始记录是你的」占的权重更大，所以选择让数据留在本机，放弃可分享的网址。

**决定**：存储层换成 **PGlite**——编译成 WASM 的 PostgreSQL，跑在应用进程内，数据落在 `data/pglite`。**换掉的只有 `lib/db/client.ts`**：五个服务层文件与六份迁移一行未改，因为 SQL 方言没变。

**为什么不是 SQLite 或 `data/*.json`**：项目把并发与完整性交给了 Postgres 语义（`version` 乐观并发、枚举 `CHECK`、`links_pair_idx` 唯一索引、`RESTRICT` 挡住删除、`jsonb` 真数组）。换方言等于把这些不变量重写一遍，75 条回归断言要全部重新推导。

**后果**：

- **单写者**：同一份数据目录同一时刻只允许一个进程写。这决定了工具链形态——回归测试不再连数据库（改纯 HTTP），重置脚本要求先停 `pnpm dev`，验证脚本改为在内存库上跑。
- 不再有 `DATABASE_URL`，也不再有 Neon / Netlify 相关的配置与脚本。
- **对外可以写**：「数据存本机、可完整导出、不被平台锁定」。**不要写**「支持多端同步」或「云端备份」——没有这回事。
- 详见 `docs/adr/0003-local-embedded-postgres.md`（该文件取代了原来的 0003「存储层不搬到本地」）。

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

### 2026-10-16：右栏在窄屏改为抽屉，不再直接隐藏

**背景**：此前 `@media (max-width: 1020px)` 里写着 `.ai-rail { display: none }`，而桌面顶栏没有任何入口——761–1020px（笔记本常见宽度）整块反链面板凭空消失，`docs/reports/13` 第 4 条记录过这个问题。它承载的入链 / 出链 / 未链接提及 / 编辑助理是产品主张本身，不能没有入口。

**决定**：≤1020px 时右栏变成**固定抽屉**，由两个入口开合——桌面顶栏的「上下文」按钮（`.rail-toggle`），以及 ≤760px 时底部导航的「上下文」项。收起方式：抽屉内的 ×、Esc 键、点开任意标签（`openTab` 会收起它），或再点一次入口按钮。

> ⚠️ **这条的宽度门槛已被「2026-10-17：界面约定」取代**：抽屉只在 ≤860px 才出现，861–1020px 是常驻列。下面关于入口与实现要点的描述仍然成立，只是适用范围从 ≤1020px 缩到 ≤860px。

**实现要点**：抽屉 `z-index: 18`，低于移动端顶栏与底部导航（`z-index: 20`）；≤760px 时从顶栏下方开始（`top: 60px`），与左侧栏抽屉保持一致。样式全部复用现有令牌，未引入新方案。

### 2026-10-17：界面约定（改版时别推翻）

> 这些是产品侧已经拍板的界面规则，**不是建议**。推翻之前先确认是有意为之 —— 每一条都对应过实测出来的问题。

| 约定 | 一句话 |
|---|---|
| 左栏折叠 = 功能图标条 | 收起来是「一个功能一个图标」（新建笔记 / 知识网络 / Agent），不是把目录压成一列重复图标；展开按钮就在图标条里，不要再用凸到边界外的小把手 |
| 右栏收起 = 右边缘图标条 | 收起时留 56px：开合 + 入链 / 出链 / 未链接提及 / 编辑助理，角标是计数；点图标 = 展开面板并滚到那一块 |
| 右栏「退化成抽屉」的断点 | **860px**（不是 1020px）。861–1020px 放得下右栏，就该是常驻列 —— 藏起来会被当成「主内容消失」 |
| 写作区 | 位置、内边距、圆角、边框宽度**一律不动**，只改颜色。要去掉框就把 `border-color` 与背景改成透明（改宽度或内边距会让文字落点移动） |
| 纸面 | `.content-section` / `.capture-panel` 半透明（surface 42%），星尘从纸后面透出来；正文那一片保持可读 |
| 新建笔记 | 只写**原始记录**：没有「创建笔记」按钮，停笔 2 秒自动收下；知识页只能由整理助手提议、用户确认后产生 |
| 未命名 | 没有 title 的原始记录，目录与标签页里按创建顺序显示成「未命名 1 / 2 / 3」 |
| 助手形象 | 一把会呼吸的竖琴（内联 SVG，纯细线、无渐变）。左栏 Agent 入口、右栏编辑助理、Agent 页面主角位共用它；不要换回星芒、头像或发光圆球 |
| 助手状态 | 空闲 / 整理中 / 已收录 / 已归档四态，只动 `transform` 与 `opacity`；`prefers-reduced-motion` 下整体停掉 |
| 界面声音 | 开关在「设置 → 主题」里，顶栏与侧栏底部都不放 |

**接口侧的对应约定**（细则见 `docs/schema.md`）：`DELETE /api/raw` 是归档语义，且只被**未归档**的知识页挡住；「新建」只走 `POST /api/raw`；知识包导出 / 导入是 `GET /api/export` 与 `POST /api/import`。

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
6. 主色**不是钴蓝**。工作台已整体转为深色：底色**深海军蓝 `#030712`**、强调色**紫 `#7c3aed`**（提交 `32b5665` / `4dd5f61`）。此条**取代** 2026-10-10「主色保持钴蓝 `#4a5ac8`」的旧决定，详见 `docs/adr/0005`。原先 `@media (prefers-color-scheme: dark)` 里还留着更早的深色变体（`#1d2026` / `#9aa7ff`），造成"同一份代码两种外观"，**已于 2026-10-16 整块删除**——全文件现在只有一套深色令牌。
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

**B1–B4 全部完成（2026-10-11）**：10 个路由全部走服务层 + Drizzle，全仓已无 `*-storage` 引用。每批当时配过一个一次性验证脚本（`b1–b4-verify.mjs`）与安全网脚本，**这些脚本已随 2026-10-17 的本地化改动删除**——它们靠"另开一个进程直接写库"造夹具，而本地 PGlite 是单写者，那条路走不通了。现在的验证入口是 `pnpm test`（HTTP 断言）与 `pnpm verify:db`（内存库结构与隔离）。

**旧存储模块已删除（2026-10-11）**：`lib/raw-storage.ts`、`lib/knowledge-storage.ts`、`lib/relation-storage.ts` 已删除；删前备份到工作区之外（`work/ai-notes-removed/legacy-storage/`，SHA256 与原件一致），并完成全局审计（静态引用仅存在于文档、无动态导入、旧函数名无调用方）。删除后 `tsc` 与 `pnpm build` 均退出码 0。

**归属过滤已覆盖全部读写路径**：`lib/services/{sources,notes,links}.ts` 的查询、更新、删除共 11 处都带 `user_id` 条件。这条口径现在由 `pnpm verify:db` 在 SQL 层断言（两个 `user_id` 各看各的）；接口层没有第二个身份可用（演示版单用户），回归测试改为断言"未知 id 一律 404、且不存在的越权尝试不会改动任何既有数据"。

**批次划分原则（执行 B1 时修正）**：按**文件整体切换**，不按"只读入口"切换。含写方法的文件若只切 GET，会出现"读走数据库、写走 JSON"，导致写进去的读不出来。

**已知待办**：服务层读路径**尚未按 `user_id` 过滤**（演示期单用户下行为等价，但归属隔离是 Phase D 目标之一）；`raw_notes` **没有 `deleted_at`**，raw 目前只有归档、没有墓碑（要加需一次新迁移）。

**B3 要点**：`POST /api/knowledge` 仍接收 `{ rawId, draft }`（draft 可由界面手工组装，即"手动提升"），新增可选 `origin`（默认 `user`，AI 流程应传 `ai`）；PATCH 支持可选 `version` 做乐观并发（不匹配 → `409 VERSION_CONFLICT`，不写入）；`Knowledge.version` 现在会随响应返回。当时用的验证脚本已删除（见上），现有入口是 `pnpm test`。

**备份与恢复（不自行建设）**

- 知识库就是本机一个目录（默认 `data/pglite`），**备份 = 拷走它**，或者走「导出知识包」(`GET /api/export`)。
- **代价（必须知道）**：没有云端副本，也没有自动快照。机器坏了、目录被删了，就真没了——所以"导出知识包"这条路要一直能跑。数据不出本机这件事的另一面，就是没人替你兜底。
- 界面上没有物理删除入口（归档不等于删除）。唯一的物理删除是 `pnpm seed:reset -- --yes`，它删除前一定会把九张表备份到 `.tmp/`。

**迁移状态（2026-10-17 更新）**：

- 迁移不再需要人工执行：`lib/db/client.ts` 在首次打开数据目录时调用 `migrate()`，按 `drizzle/meta/_journal.json` 增量补齐，已应用的会跳过。当前共 6 份（`0000`–`0005`），落成 11 张表。
- `pnpm verify:db` 在干净的内存库上跑同一批迁移并断言结果：`public_tables=11`、CHECK=11、外键=8 且删除行为全部符合设计（`note_revisions` / `proposals` / `links` 两端 / `notes.raw_id` = restrict，`note_tags` / `note_ai_metadata` = cascade）、关键列可空性、非法枚举被拒、非法关系类型被拒、同一对关系只能一行、jsonb 真为数组、归属隔离成立。
- **注意**：`0000` 建的外键是 `cascade`，由 `0001` 改成 `restrict`——**必须按序全部执行，只跑 `0000` 会留下危险中间态**。这也是迁移只能增量、不能手改历史文件的原因。

### 2026-10-11：原始记录可编辑（`PATCH /api/raw/:id`）

**决定**：Raw 可改，但只能由用户改，且每次改动都留痕。

- `user_edit` 语义：用户在界面上改自己的原话，不需要提议、不需要自我审批；正文相同视为无改动（`changed: false`，不写库）。
- 只有 `user` 主体可调用：Agent 主体 → `403 USE_PROPOSAL_FLOW`。不允许借普通用户编辑接口绕过「AI 只能提议」这条边界。
- 修订记录写在 **`audit_log`**（`operation='raw.update'`、`detail={before,after,version}`），与正文更新同一事务；`raw_notes.version` 每次修改 +1。**没有新增表、没有新增迁移**。若将来要做"逐版本对比 / 回滚到某版"的界面，再单开 `raw_revisions` 表并追加迁移。
- 长度上限抽成 `MAX_RAW_TEXT_LENGTH`（`lib/services/sources.ts`），POST 与 PATCH 共用，避免两处各写一个数字。
- **界面上还没有"编辑原话"的入口**（接口已可用）。

**jsonb 列一律直接传数组 / 对象，不要手动 `JSON.stringify`**：Drizzle 的 jsonb 列在 `mapToDriverValue` 里已经 stringify 过一次，服务层再 stringify 会写成"jsonb 字符串"而不是数组——读路径看不出来（`mapFromDriverValue` 会 parse 回来），但 SQL 层的 `jsonb_array_elements`、`?`、GIN 索引全部失效。`pnpm verify:db` 有断言盯着这条（`jsonb_types=array/array/array`）。

**顺带修复**：`.gitignore` 从只忽略 `.env` / `.env.local` / `.env.*.local` 改成忽略所有 `.env*`（保留 `.env.example`），避免 `.env.production` 这类文件被误提交到公开仓库。

## 改动边界

- **Raw 用户可改、AI 不可改**：用户可以通过 `PATCH /api/raw/:id` 直接修改（不需要提议），每次修改都在同一事务里写一条 `audit_log` 修订记录（含改前 / 改后原文）；Agent 主体调用会被 `requireUserActor()` 拒绝（`403 USE_PROPOSAL_FLOW`），永远不能改写 Raw 的正文。详见上文「决策记录」。
- **AI 不自动写入**：AI 只生成草稿或回答，落库必须经过用户确认。
- **右栏是上下文面板**：入链 / 出链 / 未链接提及 / 编辑助理四块，跟随当前标签。不要把它退回成全局聊天框，也不要为 AI 单独做一套视觉语言。
- **不要再重建参考库 / Wiki 层**：它已按 2026-10-10 决策整层移除。将来若要做"Wiki 承载四类节点"，以新形态重新设计，不要恢复旧结构。
- **知识库不是仓库内容**：`data/` 整个目录都不进版本库（只留 `data/.gitkeep`）。它是使用者的数据，不是项目资产；不要为了"让演示开箱即用"而把库文件提交上去，演示内容由 `pnpm seed:demo` 负责。
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
| `docs/reports/01`–`12` | ⚠️ 阶段性报告（竞品研究 / 审计 / 选型 / 架构 / 迁移复核 / 存储层切换），记录当时的判断与依据，**描述的是历史状态，不要当成当前代码说明** |
| `README.md` | ✅ 面向人的简述 |

**文档里不写"修了哪些 bug"。** 修过什么、哪里坏过、怎么复盘的，git 提交历史就是那份日志，不必在文档里再记一遍。决策记录只记**还在生效的约定与理由**（例如"jsonb 一律直接传数组"），不记"曾经哪里写错了"。同理，不要在文档里留问题清单式的内容——待办进 issue，历史进提交信息。

## 已知坑

1. **PGlite 是单写者 —— 同一份数据目录只能有一个进程写**。这是 WASM 版 Postgres 的固有约束，不是配置问题。具体表现：`pnpm dev` 正在跑时，另开一个进程去 `new PGlite("data/pglite")` 不会报错，但它读到的是打开那一刻的快照，它写进去的东西随后会被应用覆盖——**"删了像没删""改了没生效"多半是这一条**。所以：验证数据请走 `pnpm verify:db`（内存库）或 HTTP 接口；重置数据必须先停 `pnpm dev`（脚本会探测 3000 端口并拒绝运行）；不要写"另开脚本直接连库造夹具"的工具，那种工具在这个架构下不可靠（`b1–b4-verify.mjs` / `isolation-verify.mjs` 就是因为这个被删掉的）。
2. **`@electric-sql/pglite` 必须留在 `next.config.ts` 的 `serverExternalPackages` 里**。它自带 `.wasm` 与 worker 文件，交给打包器会把路径搅乱，运行时报"找不到 WASM"。改动构建配置时别把它挪出来。
3. **数据目录是使用者的，不是仓库的**。`data/` 已被 gitignore（只留 `.gitkeep`）。不要提交库文件，也不要把演示数据塞进 `data/` 当作"默认内容"——演示内容走 `pnpm seed:demo`。
4. **目录名有多个写法**：clone 出来是 `ai-notes_demo`；本机可能叫 `ai-notes_demo-local`（含下划线）。常被写错成全连字符的 `ai-notes-demo-local` —— 那个路径不存在，`cd` 会直接失败。
5. **行尾假象**：本机克隆已设 `core.autocrlf=input`。若 `git status` 突然列出一大片"被修改"、但 `git diff` 没有任何内容差异（本仓库文件是 LF），那是索引 stat 缓存过期，跑一次 `git add -A` 即可清干净，不要用 `git checkout -- .` 去"修"。
6. **`tsconfig.tsbuildinfo`** 是 TypeScript 增量构建缓存，已在 `.gitignore` 中，不要提交。
7. **`pnpm build` 会打印一条 ESLint 报错**（`Cannot find module 'eslint-plugin-react-hooks'`）。构建仍然成功退出（exit 0），这是已知的 lint 插件缺失，不影响产物。
8. **不要跑 `pnpm build` 的同时开着 `pnpm dev`** —— 两者共用 `.next/` 目录，会互相覆盖导致 dev server 报 `Cannot find module './xxx.js'`。
9. 在 Windows + Git Bash 下，路径含中文用户名时 `cd` 偶尔会因编码失败；把 `cd` 和后续命令写在同一条命令里，或用相对路径。
