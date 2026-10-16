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
| 当前开发分支 | **`main`**（2026-10-17 核实：近期的提交都在 main 上，Netlify 也只从 main 构建 —— 见 `docs/DEV_WORKFLOW.md` 的"当前事实"）|
| 其他 | `develop-guozechen`、`feature/raw-storage`、`docs/readme-rendered-visuals`、`backup/pre-align-20261015` 是历史分支，**不要往它们上面继续开发** |

多个人协作时再按 `docs/DEV_WORKFLOW.md` 走"从 main 开 feature 分支 → PR → 合并"；一个人做的时候直接提交 **main**，提交后立刻 `git push`。

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
- 首次打开是空白状态（数据在 Neon Postgres，仓库里没有内容），需要自己新建笔记，或者 `pnpm seed:demo` 播一批演示内容。

可用命令：`pnpm dev` / `pnpm build` / `pnpm start` / `pnpm lint`。

**验证与测试（2026-10-11 新增）**：

- `pnpm test` —— 回归测试（**需先跑 `pnpm dev`**）：覆盖 API 路由（含知识包导出/导入）+ 跨用户归属隔离，带 pass/fail 与退出码；**断言只针对本次测试自己造的数据**，因此库里播了演示内容（`pnpm seed:demo`）也能跑绿（2026-10-17 之前有一批"全表为 0 / 图谱只有两个节点"的绝对断言，一播演示数据就红）。
- `pnpm verify:db` —— 表 / 约束 / 外键删除行为 / 枚举 CHECK / RESTRICT 验证（写入测试全部在事务内回滚，不需要服务）。
- `pnpm test:cleanup` —— 安全网：清理验证脚本可能遗留的测试数据。

**演示数据（2026-10-16 新增，2026-10-17 改为「少而密」）**：

- `pnpm seed:demo` —— 按 `seed/demo-notes.json` 幂等写入演示内容（**需先跑 `pnpm dev`**，走 HTTP 复用服务层写入路径）。只增不删；可用 `SEED_BASE_URL` 打到线上站点。
- `pnpm seed:reset` —— 换一批演示内容时先清空业务表。**默认 dry-run**，只打印将要删除的行数；确认后加 `--yes` 真正执行，删除前会把九张表完整备份到 `.tmp/`（已 gitignore）。删除顺序由外键策略决定（`notes` 被 RESTRICT 引用，`raw_notes` 被 `notes` 引用），**不要手工调整**。
- **当前数据源只有 4 条**：4 条原始记录 / 4 张知识页 / 5 条关联，全部落在《数值分析》的「浮点数精度 → 误差传播 → 数值稳定性」这一条主线上。侧栏因此只有「原始记录 4 / 笔记 4」，图谱是一个几乎闭合的小簇（6 对关系连了 5 对）。
- **有意留一条不连**：`IEEE 754 双精度结构 ↔ 数值稳定性` 不建关联，而两页正文里都提到对方 —— 右栏「未链接提及」于是永远有一条可现场点的「＋ 建立关联」。这是演示「提到 ≠ 连上，连接要你点一下」的入口；连上之后六对关系全闭合。**不要再加第 5 条笔记**来凑演示点。
- 换数据前先 `pnpm seed:reset -- --yes` 再 `pnpm seed:demo`：seed **只增不删**，直接跑只会往旧数据上叠加。`seed/demo-notes.json` 的 `_设计意图` 写明了每个演示点（留一条待关联、孤立节点开关怎么演示、Agent 用哪条材料）。
- 契约文档：[`docs/schema.md`](docs/schema.md) —— 英文契约 + 中文注解，**只描述已实现状态**，未实现的统一标注 `NOT IMPLEMENTED`。
- **生产构建验证（2026-10-11）**：`pnpm build`（exit 0）→ `pnpm start` → `pnpm test` → **47/47 通过**，与 dev 一致。构建期**不依赖** `DATABASE_URL`（两处 env 读取都在函数内部，模块顶层不读），因此部署平台缺环境变量也不会让构建失败。

## 实际技术栈（只列真实在用的）

- **Next.js 15.5.26**（App Router）+ **React 19** + **TypeScript 5.9**
- 样式：**手写 CSS**，全部在 `app/globals.css`，用 CSS 自定义属性做设计令牌
- **`three@0.186.0`** —— 已安装，**只用于首屏那套视觉**（`components/landing-particle-field.tsx`）。不要把它用到知识图谱或别的地方，体积和复杂度都不划算
- **`d3-force`** —— 只做知识图谱的力学计算，渲染是自绘 Canvas（见「决策记录：知识图谱对标 Obsidian」）
- **`@tsparticles/*`** —— 只用于背景星尘（首屏与工作台共用一份配方，见 `components/landing-stardust.tsx`）
- **`drizzle-orm` + `@neondatabase/serverless`** —— 持久化。数据在 Neon Postgres，**不是本地文件**

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
| `/api/assistant/propose` | POST | 编辑助理针对一张知识页生成**改写提议**（`note_update`）。只落 `pending` 提议，不写正文 |
| `/api/agent/organize` | POST | Agent 工具循环，返回 `AgentRunTrace`（步骤 + 待确认提议） |
| `/api/proposals` | GET / POST | 提议列表（`status` / `targetNoteId` 过滤）/ 提交提议 |
| `/api/proposals/[id]/approve` `reject` `apply` | POST | 决议与执行（`apply` 需要已 `approved`，支持 `Idempotency-Key`） |
| `/api/export` | GET | 知识包导出。默认返回 JSON 全量快照；`?format=markdown` 返回 markdown + YAML frontmatter 打成的 zip |
| `/api/import` | POST | 导入知识包。`?dryRun=1` 只算数不写库；同名（原始记录没有标题时按正文）一律保留已有、跳过导入 |

**所有存储层在文件不存在时返回空数组/空对象（`ENOENT` 分支），不抛异常。** 所以部署到 Vercel 这种只读文件系统时，读取不会 500，但**写入会失败**。

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

> ⚠️ **这条的宽度门槛已被 2026-10-17 那条取代**：抽屉只在 ≤860px 才出现，861–1020px 恢复成常驻列 —— 那一档放得下右栏，藏起来就会被当成"主内容消失"。下面关于入口与实现要点的描述仍然成立，只是适用范围从 ≤1020px 缩到 ≤860px。

**实现要点**：抽屉 `z-index: 18`，低于移动端顶栏与底部导航（`z-index: 20`）；≤760px 时从顶栏下方开始（`top: 60px`），与左侧栏抽屉保持一致。样式全部复用现有令牌，未引入新方案。

### 2026-10-17：编辑助理可以提议改写正文（`note_update` 落地）

**背景**：`proposals.kind` 的枚举与数据库 CHECK 里一直有 `note_update`（见 `drizzle/0001`），但服务层的 `SUPPORTED_KINDS` 只放行 `link_create` / `source_create`——也就是说"编辑助理提一句改法"这件事没有可执行的载体。**本次没有新增 kind，只是把已存在的 `note_update` 接通**，因此不需要新迁移。

**决定**：右栏「编辑助理」多一个入口「提议改写正文」。它调 `POST /api/assistant/propose`，模型返回**改写后的完整正文**（不是片段），服务端把它落成一条 `pending` 提议；正文一个字都不动。用户在**正文底部**的 Diff 预览卡上点「确认写入正文」或「忽略」——`approve` → `apply` 两步，与服务层既有的状态机一致。

**版本安全**：建提议时把当时的 `notes.version` 记进 `proposals.base_version`。执行时用 `updateNoteInTx` 做版本比对，不一致就抛 `PROPOSAL_TARGET_STALE`，由 `markFailed` 把提议推进到 **`stale`**（而不是 `failed`）——过期提议不能重新执行，只能让助理重新生成。这条防的是"提议生成后用户自己改过这一页，确认时把用户的手改覆盖掉"。

**落地物**：`app/api/assistant/propose/route.ts`、`lib/deepseek.ts` 的 `proposeNoteRevision`、`lib/services/proposals.ts` 的 `note_update` 分支、`lib/services/notes.ts` 新导出的事务内 `updateNoteInTx`、`lib/text-diff.ts`（逐行 LCS，供 Diff 卡用）、`app/page.tsx` 的 Diff 卡与三个处理函数。实体样式见 `app/globals.css` 的 `.diff-card` 系列。

**已知边界**：本机 `.env.local` 里 `DEEPSEEK_API_KEY` 为空时，这个入口返回 503（与「AI 整理」一致），Diff 卡则仍然可以靠已有的 `pending` 提议渲染出来——待办状态在库里，不在前端。

### 2026-10-17：界面文案去开发化（对齐界面预览稿第二版）

**决定**：面向学生的界面里不再出现开发者语汇。落点：

- **Agent 轨迹的步骤名改成学习语汇**：准备整理 / 查找笔记 / 比对脉络 / 建议一 · 串联概念 / 建议二 · 归档错题 / 等待你的最终拍板。来源是 `lib/agent/manual.ts` 的 `label` 与新增的 `hint`（步骤名下面那句人话）。**工具的代码名只留在 `AgentStep.tool` 数据里，界面不渲染**（仅挂在元素的 `title` 上供排查）。`hint` 由 `createStepRecorder` 按工具名自动补齐，新增工具时只改手册一处。
- **Agent 右栏从「本次运行审计 / 工具授权表」改为「整理摘要与复习提示」**：关联到的知识页、知识断层数、待确认建议、你已采纳建议全部从真实轨迹推导（读过的知识页 + 串联建议涉及的页面），并补一份平实语言的整理助手守则。不再展示运行计数器与逐工具授权表。
- **三套主题沿用原 id，名称改为学习场景**：暗室星图（夜间专注）/ 暖纸批注（书页深读）/ 实验工坊（高效整理）。`app/globals.css` 的令牌一行未动。
- **图谱右栏的力场术语改为「视图松紧调节」**：向心聚拢度 / 节点排斥间距 / 关联牵引强度 / 连线舒展长度。**取值范围刻意不照搬预览稿**——两边把参数映射到 d3 的方式不同（本项目内部对 repelForce 取负），照抄数值会打乱现有布局手感。
- **顺带修**：`@` 提及候选在原始记录有名字时改用名字（原来用正文预览，用户按自己起的「错题」去找会搜不到）。

**已知差异（别当成 bug）**：预览稿的第 1 步「考点分析 · 拆解题目与错因」在本项目里没有对应步骤——工具循环没有单独的分析步，那部分判断体现在「查找笔记」的关键词与「比对脉络」的结论里。另外「建议一 / 建议二」的编号来自预览稿，实际轨迹按模型调用顺序记录，所以「二」可能排在「一」前面。

**另一个顺带发现**：`boundary` 步骤不是工具调用，`hint` 为 null，界面按「没有副标题」渲染。

### 2026-10-17（补）：图谱拖动语义 —— 拖动即固定

**背景**：原来松手会把 `fx/fy` 置空（d3 官方拖拽示例的写法），节点随即被连线弹簧拉回原位 —— 实测把节点拖出 275px，4 秒后回到出发坐标，拖动等于白拖。力学上也不存在真正的"软着陆"：只要置空，合力就不为零，迟早被拉走。

**决定**：**拖动过就固定在落点**，`fx/fy` 保留。位移 ≥ `DRAG_MOVE_THRESHOLD`（4px）才算拖动，以下按点击处理，避免误钉。

**退出固定的三条路径**（都实测过）：

1. 节点外圈那道**极细的环**是"它现在钉在这里"的视觉状态；
2. **单击**它弹出的卡片里有「解除固定」；
3. 右栏「布局」块的「**重新布局（放开固定的节点）**」一次性放开，数量为 0 时按钮禁用。

**拖动期间不弹卡片**：拖动的意图是腾出空间，卡片会正好盖住刚理好的地方 —— 改为给该节点一圈 900ms 的焦点脉冲。

**加热方式**：拖动期间用 `alphaTarget(0.05)`（不是每次移动都 `alpha(...)`），同时把 `forceManyBody` 压到 25%；松手 `alphaTarget(0)` + 斥力还原。这样位移只影响直接相连的邻居，几跳以外的节点不会被唤醒（实测远端三个节点纹丝不动；原来给 `alpha(0.35)` 是整图重热 + 松手后自颤两三秒）。

**未采用**：对非拖拽的非邻居施加速度阻尼（`vx *= 0.2`）。它会与力求解器对抗，且压制斥力那一条已经达到同样效果。

**与预览稿的一处取舍**：预览稿建议"双击固定节点 = 解除固定"，但双击在本项目里已经是"打开知识页"（早期明确对齐过预览稿的交互）。这里保留双击打开，解除固定走上面三条路径，避免同一个手势有两种含义。

### 2026-10-17：界面声音从顶栏/侧栏搬进设置

**背景**：声音开关原来有两处（顶栏一颗 `sound-toggle-desktop`、侧栏底部一颗 `sound-toggle-sidebar`，靠断点切换显示），都占着"经常路过"的位置 —— 而它是**偏好**，不是常用动作。

**决定**：删掉 `SoundToggle` 组件与两处用法，开关移到「设置 → 主题」页底部的「界面声音」。开关与全局共用 `InterfaceSoundProvider`（在 `app/layout.tsx` 顶层）里的同一份状态，所以不存在"设置里关了、别处还亮着"。`.sound-toggle*` 的样式（包括那条只为它存在的 ≤760px 媒体查询）一并删掉。

### 2026-10-17（补二）：Agent 入口与 Agent 页面共用这把琴

- **两处助手入口的图标**换成那把琴的"指纹"：三根长短不一的弦 + 中弦上一粒音芯（`IconHarp`，左栏图标条与右边缘图标条共用）。试过把整把琴缩到 18px —— 琴颈、支柱、共鸣箱全糊成一团；留三根弦就够了，18px 下依然分得清。用星芒之类的通用 AI 符号，用户认不出"点进去是同一个助手"。
- **Agent 页面（中栏）里这把琴当主角**：`<AgentFigure size="hero" />`（104px）放在页头左侧，状态与右栏那两处同一套词（空闲 / 整理中 / 已出结果）。**点开时展开一次** —— `agent-unfold`，620ms 的缩放淡入（宽先展开、高随后跟上），像乐器被放到台前。
- 窄屏（≤760px）页头本来就竖排，`align-items: center` 只写在 ≥761px 里，不抢它的排法。

### 2026-10-17（补）：琴的动态；编辑助理补上美学

**动态**（全部只落在 `transform` / `opacity` 上，不触发布局）：

- **偶尔被拨一下**：空闲态一根弦的整周期是 9.6s，其中 56%–76% 是一小段衰减振动；三根弦相位错开（delay −3.2s / −6.4s），所以会不定时"响"一下。这是这块面板唯一会自己动的地方，也是"它是活的"最直接的证据。
- **看着它，它呼吸快一点**：`.agent-row:hover .agent-core` 把呼吸从 4.4s 提到 2.1s。
- **整理中**：弦振到 0.95s（中弦 0.8s），火星沿中弦走一轮 1.15s —— 位移给的是 `translate(-6.5px, 20px)`，因为弦本身是斜的（只给 `translateY` 会跑到弦外面）。
- **回复落下来**：`.ai-result.has-result p` 一次 420ms 的浮入（`agent-reply-in`）。

**编辑助理的美学**：这一格以前是"一片空白 + 一行 55px 高的占位"，所以显得空。现在：

- 顶上放**同一把琴**（同一个助手：一处负责整理、一处负责对话，看久了会认得它）+ 一句状态（准备就绪 / 正在查阅 / 已回答）—— `isAsking`、`aiMessage` 直接映射到三个 mood；
- 回复区改成**左侧一道细线**（像对话引言），去掉上下两条横线与 `min-height: 55px`；有回复时那道线转强调色；
- 「提议改写正文」从一颗实心按钮改成与「提出整理稿」同一套**快捷词**（虚线胶囊）—— 两处都是"对助手说的一句话"，不是一个必须按的按钮；
- 底部原来的 `.ai-trace`（状态点 + 小字，审计感）换成一句 `.agent-hint`。

### 2026-10-17：整理助手的形象 —— 一把会呼吸的竖琴

**背景**：右栏「整理助手」那一格需要一个有辨识度的助手形象。约束：极简、克制、安静；形象要有**生命感**（内联 SVG / CSS 实现，**不要普通头像或发光圆球**）；避免常见三栏 AI 聊天模板与大面积渐变光晕；所有代码与视觉资产内联，不引外部图片 / 字体 / CDN；并且要与产品名有关。

**决定**：形象取自产品名本身 —— **Chordnote · 和弦**（一条笔记是音符，连起来才是和弦）。助手是一把**会呼吸的小竖琴**，纯内联 SVG、全是细线、零渐变零光晕：

- 剪影是真的竖琴：左边短的共鸣箱、斜挑向右上的琴颈、右边一柱、底下一横；
- **三根弦 = 三个音**，越靠右越长，合起来才是和弦；
- 中弦上挂一粒「音芯」当呼吸点（不是发光圆球）；
- 四个状态，动静都很小：空闲（三根弦各自慢慢摆、相位错开 −2.1s / −4.2s）→ **整理中**（弦振到 0.9s，一粒火星顺着中弦斜着往下走）→ 已收录（几乎不动）→ 已归档（整把琴静止）。

**这块面板的其余部分**：形象 + 一句状态 + 一句人话说明 + 「提出整理稿」快捷词；文案里不出现工具名。动效只落在 `transform` / `opacity` 上（不触发布局），`prefers-reduced-motion` 下整体停掉。

**一个布局坑**：`.rail-body` 是 grid，里面只有一块内容时默认会被拉伸摊满整高，形象与文案就被推散 —— `.agent-panel { align-content: start }` 收掉。同理，火星沿斜弦走要用 `translate(x, y)`，只给 `translateY` 会跑到弦外面。

### 2026-10-17：新建只写原始记录；原始记录页只剩「读」与「改原文」；右边缘图标条

**背景**：两处行为要收口 —— ①「新建笔记」之后不该在「笔记」栏里立刻多出一页（知识页应当由整理助手提议、用户确认之后才出现），而未命名的新笔记应当在「原始记录」栏里显示成「未命名 1 / 2 / 3」；②原始记录页上的 提出整理稿 / 编辑原话 / 移除记录 三颗按钮都是多余的。

**决定**：

1. **新建只写 Raw**：`submitNote()` 改成 `POST /api/raw`。那条一次写完 raw + knowledge 的路径 `/api/notes` **已删除**（服务层的 `createNoteFromText` / `titleFromText` 一并删掉），并把「它必须不存在」写进回归测试（`POST /api/notes → 404`），防止被重新加回来。AGENTS.md 的「核心链路」（Raw → Draft → 用户确认 → Knowledge）本来就是这么写的 —— 是代码里那条捷径在绕过它。
2. **未命名 N**：目录与标签页里，没有 title 的原始记录按**创建顺序**显示成「未命名 1、未命名 2…」（`unnamedNumbers` + `rawLabel`；只影响显示，`raw.title` 仍然是空的）。不这么做，目录里显示的是一堆以正文开头的条目，分不清谁是谁。
3. **原始记录页只剩两件事**：正文改成**点击即编辑**（与知识页同一套 `editable-field` 手感），三颗按钮全部拿掉。「提出整理稿」搬到右栏 —— 原始记录页的右栏新增「整理助手」块，里面是**快捷词**（虚线胶囊 `.quick-word`）。删除走左栏右键那条记录的菜单；已收录时页面只留一颗「打开知识页 ↗」。
4. **在星空中读写**：`.content-section` 与 `.capture-panel` 的背景改成 42% 半透明（写作区的位置、内边距、圆角一律不动，只是"透"）；`.inline-edit-field` / `.title-edit-input` 与新建面板那两个输入：边框**只换颜色**（宽度不动，否则文字落点会挪）、底色与内阴影去掉，聚焦时才浮出一道强调色细边。
5. **右边缘图标条**：右栏收起时不再留空白，而是留 56px 站一条图标条（与左栏那条对称：同一个 56px 列、同一套 38px 图标按钮）—— 开合按钮 + 入链 / 出链 / 未链接提及 / 编辑助理，右上角角标是那一块的计数（>0 才显示，不摆一排 0）。**计数与右栏共用 `railContext` 一份数据**：两处各算一遍，迟早会出现"图标上写 2、点开只有 1"。点图标 = 展开面板 + 滚到对应那一块（`.blk` 上的 id）。

### 2026-10-17：新建笔记去掉「创建笔记」按钮（停笔自动收下）+ 字段只去框、不动版式

**背景**：面板上有「笔记名」+「写下你现在想保存的内容」两个带框输入块与一颗「创建笔记」按钮。要的是：字段不要看得见的框、背景透明（让星尘透出来），但**文字书写的位置一格都不能动**，并且**不要那颗按钮**。

**决定**：

1. **字段只换颜色、不换尺寸**：`.capture-panel` 里两个输入 `border-color: transparent; background: transparent`。边框宽度（0.667px）、内边距（标题 12/14，正文 13px）、字号、圆角、行高全部原样 —— 所以文字的落点与改动前逐像素一致。样式**必须写在那组"输入统一外观"之后**（同类选择器、后写的赢），否则会被盖回去。聚焦时上面那条 `:focus` 规则照样生效，会浮出一道强调色细边：字段都没有框时，用户得知道光标在哪一格。
2. **面板半透明**：`.capture-panel` 背景 `color-mix(in srgb, var(--surface) 74%, transparent)`，星尘从纸**后面**透出来（与知识页那张卡同一档透明度）。
3. **去掉「创建笔记」按钮**：改成**停笔 2 秒自动收下**（`AUTO_SAVE_DELAY_MS`），走的是与表单提交**完全同一条路径**（`submitNote()`）—— "自动"与"手点"不会有第二种行为。只在停在「新建笔记」这一页时计时：切去别的标签页就不该在背后偷偷建东西，回来接着写会重新计时。页脚写明会发生什么（"停下两秒会自动收下并打开"），否则用户会一直等一个不存在的按钮。
4. 版式与文案一律没动：页头、「新建笔记 / 原始出处会自动保留」、两个 label、字数统计全部原位；只有标题框的占位文字改成「未命名」（它同时就是"可以修改"的那个名字）。

**顺带修掉一个既有 bug**：`/api/notes` 一直**忽略 `title`**，服务层的 `createNoteFromText` 也从不给原始记录写标题 —— 也就是说面板上那个「笔记名」输入框一直是装饰（实测：填了名字，建出来的笔记标题仍是正文首行）。现在两侧都认这个名字：`createNoteFromText(text, title?)` 让原始记录与知识页同名，没给才回落到从正文首行推。回归测试补了三条断言（采用给定标题 / 未给时回落 / 标题类型非法 400）。

**这里改的是颜色，不是盒模型（别再往回走）**：把两个字段并成一个标题加一片正文、让正文随内容长高，看着更像"一张纸"，但文字会整体上移、内边距被抹平 —— 与"文字落点不变"直接冲突。结论：**只改颜色，不碰盒模型**，文字落点必须逐像素不变。

### 2026-10-17：进入工作台的默认布局、内容卡去描边、背景星尘

**决定**（三条，都是外观）：

1. **进来时左栏展开、右栏收起**：`sidebarOpen` 默认 `true`，`railHidden` 默认 `true`。左栏是"我手上有哪些材料"的地图，先给出来；右栏是"我现在关心入链 / 出链 / 编辑助理"时才要的上下文，要看就点顶栏那颗「上下文」。窄屏侧栏仍是抽屉（`mobileNavOpen` 默认 false），不受影响。
2. **内容卡片去掉 1px 描边**：`.content-section`（原始记录页、知识页、Agent 页的正文卡）从共享的 `border: 1px solid var(--line)` 那条规则里拿出来，只留背景色差 + 那层极轻的面板阴影。1px 浅灰描边铺在大面积深色底上会把版面切碎、显小气。padding / 圆角 / 阴影一律不动。
3. **背景加星尘**：把首屏那颗 tsParticles 星尘做成两处共用的一份配方 —— `components/landing-stardust.tsx` 里 `buildOptions(tuning)` + 四组 `*_TUNING`。工作台新增 `AppStardust`，铺在 `.app-shell` 自己的背景之上、所有内容之下（`.app-stardust { z-index: -1 }`，配合 `.app-shell { isolation: isolate }` 建立层叠上下文，否则负 z-index 会掉到页面背后）。工作台那一档**关掉鼠标引力**、粒子更少更暗更慢：那边一直在写字、拖图谱，光点跟着光标是干扰。笔记卡片本身不透明，所以读到正文那一片始终干净。

**为什么可以让两个 provider 各挂一份**：首屏与工作台不会同时挂载（一进编辑室首屏就卸载），不存在两个引擎抢着跑的情况。

### 2026-10-17：右栏「退化成抽屉」的断点从 1020px 下调到 860px

**背景**：一个反复出现的问题 —— 窗口窄于 1021px 时，右栏按 2026-10-16 那条决策变成抽屉，要额外点一次「上下文」才出现；在笔记本常见的窗口宽度里，这看起来就是**主内容凭空消失**。同一个坑踩过两次：761–1020px 这一档最早是直接 `display: none`（`docs/reports/13` 第 4 条），改抽屉是第一次修，这次是第二次。

**决定**：把"右栏退化成抽屉"的断点从 **1020px 下调到 860px**。861–1020px（普通笔记本窗口）这一档**放得下**右栏 —— 侧栏默认收起 56px，正文仍留 549px —— 就让它像宽屏一样当常驻列；只有 ≤860px 才变抽屉。顺带把 ≤1220px 那一档的右栏宽度收回原来的 280px，给正文多留 32px。

**取舍**：在 861–1020 这一档，如果手动展开侧栏（216px），正文只剩约 370px，会显得挤。这是用户自己的动作、且侧栏默认收起，暂不为它加"窄屏自动收起侧栏"这类联动。

**教训**：给"布局降级"标断点时，要问这个宽度**到底放不放得下**，而不是沿用相邻模块的数字。也说明这次要补的不是入口（入口本来就有两个），而是"能放下就别藏"。

### 2026-10-17：数据可带走 —— 知识包导出 / 导入 + 归档

**背景**：对外介绍时容易写成「笔记的稳定性、不受平台影响」，但这条口径**不能照写**：数据在 Postgres 里，不是本地存储，写"本地 / 离线可用"就是假的（见 `docs/adr/0003`）。

**决定**：换成一句能兑现的话 —— **数据可完整导出、不被锁定**，并把它做成两个动作：

- **知识包 JSON**（`GET /api/export`）：原始记录 + 知识页 + 关联 + 修订历史，全量。这是"导回来用"的快照。
- **知识包 markdown**（`GET /api/export?format=markdown`）：`README.md` + `notes/*.md` + `sources/*.md`，YAML frontmatter 带概念、关键词、出处与双向链接，打成 zip。任何读 markdown 的工具都能消费，不需要本应用在场。
- **导入**（`POST /api/import`，设置 → 数据 → 选文件）：`?dryRun=1` 只算数不写库。

**为什么用 title 当可移植的键**：`id` 是 build-local 的（`raw_<uuid>` 本机生成），换台机器、换一个库就失去意义；title 是用户自己认得的名字。

**合并规则**：同名**保留已有、跳过导入**，永不覆盖当前内容。原始记录**没有标题时按正文判重** —— 课堂随手记大多没有标题，只按标题判重会让"导出再导回"把原始记录整批翻倍（写回归测试时实测到的）。

**导入不重建修订历史**：修订里的版本号与写入者是当时的事实，事后补造等于伪造审计。导出仍然带上它，是为了让人拿到完整快照去归档或迁库。

**zip 是手写的**（`lib/zip.ts`，store 模式不压缩、零依赖，理由写在文件头）：只需要"把几个文本文件打成任何工具都能打开的包"这一件事，为此装一个 archiver/jszip 会同时带来 lockfile 变动与供应链面积。实测 Windows 自带 `Expand-Archive` 能正常解开，中文文件名正常（UTF-8 标志位）。

**归档的定位**：归档是"我不想在日常里看到它"，不是"它不是我的数据"。所以目录与图谱入口里不再出现，但**导出包含已归档内容**；归档不写修订历史（正文没变），只写审计。

### 2026-10-17：左栏折叠 = 功能图标条；右栏也能收起

**背景**：用户拿参考图指出三个问题 —— ①折叠后整列是**重复的同一个图标**（每条原始记录 / 知识页都画「≡」，认不出哪条是哪条），而且没有任何**功能**入口；②收起侧栏的开关是**凸在边界外**的小把手，位置与热区都不对；③右栏（上下文面板）在宽屏**根本没有收起入口**。

**决定**：

- 折叠后的左栏**不再渲染目录**，改渲染 `.rail-nav`：圆形 logo 徽标 → 展开按钮 → 分隔线 → **一个功能一个图标**（新建笔记 / 知识网络 / Agent 调用），底部仍是齿轮（设置）。要按名字找某一篇，就展开侧栏 —— 图标条第一项就是展开。
- 凸出的把手换成图标条里的普通按钮（38px，与其它图标同排）；展开后的侧栏顶部另有一个同款收起按钮（`.sidebar-collapse-btn`），不再骑在分隔线上。
- 右栏的收起入口：栏内右上角一颗圆形按钮（`.rail-drawer-close`，宽窄屏共用外观），顶栏那颗「上下文」负责再调出来。这两颗按钮**以前只在 ≤1020px 存在**，宽屏的常驻右栏反而没有出口。

**"收列"而不是"藏内容"**（这个坑踩过两次）：右栏收起时把 `--rail-col` 置 0，并在 ≥1021px 把元素 `display: none`；否则列宽还在，正文旁边留一条空白。左栏同理。

**两个状态而不是一个**：窄屏抽屉默认收起、宽屏常驻列默认展开，默认值相反，一个布尔量表达不了。`railOpen`（抽屉）/ `railHidden`（常驻列），顶栏那颗按钮一次同时翻转两者。

**顺带修掉两个实测出来的"点不到"**（都量过坐标）：

1. 折叠后底部那块 `.sidebar-bottom` 是 `width: max-content` 被 flex 居中，量出来 `x=-30 / w=116`：左半截溢出屏幕外、右半截压在正文栏下面，齿轮中心命中 `.workspace-main` —— **设置根本打不开**（导出入口就藏在里面）。改成按列宽对齐（`align-self: stretch`）。
2. 窄屏抽屉的高度是 `calc(100dvh - 60px)`，最后 67px 被固定底部导航盖住：齿轮中心 y=868 落在导航的 833–900 里，点下去命中的是「Agent」标签，表现成"点设置 → 抽屉被关掉"。抽屉下沿改到 `bottom: calc(67px + env(safe-area-inset-bottom))`；右栏抽屉同样处理（它滚到底的那一截内容原本也够不着）。

**删掉的死样式**：`.sidebar-toggle`（凸出的把手）与一整套"把目录压成图标"的规则（`.workspace-sidebar.is-collapsed .tree-item` 等 5 组）—— 图标条不再看目录，它们永远不会生效。

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
