# AGENTS.md

给 AI 编码助手看的项目手册。改代码前请先读完本文件。

## 1. 项目概览

AI Notes 是面向大学生的 AI 知识系统（校赛 Demo）。应用运行在使用者本机，数据存于本机，不依赖外部数据库或云服务。

核心链路：

```
Raw（原始记录）→ Draft（AI 整理草稿）→ 用户确认 → Knowledge（知识页）→ Relation（关联）→ Graph（图谱）
```

## 2. 不可违反的约束

以下规则是产品的根本边界，任何改动都不得破坏：

- **AI 只能提议，用户确认后才能写入知识网络。** `/api/organize` 只返回草稿，不落库。知识页只能由用户确认后的草稿或手动提升产生。
- **Raw 的正文 AI 永远不能改写。** 用户可以通过 `PATCH /api/raw/:id` 修改自己的原话，每次修改写入一条审计记录（改前、改后、版本）。Agent 主体调用该接口会返回 403（`USE_PROPOSAL_FLOW`）。
- **不新增 `POST /api/notes`。** 新建笔记只写 Raw（`POST /api/raw`）。知识页只能经 `POST /api/knowledge` 产生。回归测试中有一条断言守着这一点。
- **同一数据目录同一时刻只允许一个进程写。** 存储是 PGlite（WASM 版 PostgreSQL），单写者。
- **API Key 只在服务端。** `DEEPSEEK_API_KEY` 从环境变量读取，不得传到浏览器或写进代码。`.env*` 文件已被忽略（保留 `.env.example`）。
- **删除只做归档。** 界面和普通 API 没有物理删除入口。唯一的物理删除是 `pnpm seed:reset -- --yes`，它在删除前会备份数据。

## 3. 技术栈

实际在用的依赖：

- Next.js 15（App Router）+ React 19 + TypeScript 5.9
- 样式：手写 CSS，全部在 `app/globals.css`，使用 CSS 自定义属性作为设计令牌
- 持久化：`drizzle-orm` + `@electric-sql/pglite`，数据目录 `data/pglite`
- 知识图谱：`d3-force` 只做力学计算，渲染为自绘 Canvas
- 背景星尘：`@tsparticles/*`
- 首屏粒子：`three`，仅用于 `components/landing-particle-field.tsx`，不要用于图谱或其他地方

**未安装、不要引入：**

- Tailwind CSS、shadcn/ui、Radix 或任何 UI 组件库。所有组件均为手写。
- `react-force-graph-2d` 等图谱组件库。
- GSAP。现有动画使用 CSS transition 或 requestAnimationFrame。

新 UI 请沿用 `app/globals.css` 中已有的类名和变量（如 `--paper`、`--ink`、`--accent`、`--line`、`--radius`），不要引入新的样式方案。

## 4. 运行与验证

包管理器是 **pnpm**（`pnpm@11.25.0`）。不要用 npm 或 yarn，否则会破坏 lockfile 和 node_modules 结构。

```bash
pnpm install
cp .env.example .env.local   # 可选，填入 DEEPSEEK_API_KEY
pnpm dev                     # http://localhost:3000
```

常用命令：

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建与运行 |
| `pnpm lint` | 代码检查 |
| `pnpm test` | HTTP 回归测试，需先启动 `pnpm dev`，共 75 条断言 |
| `pnpm verify:db` | 在内存库上执行全部迁移并断言结构、约束、外键行为、归属隔离。不需要 dev server，不碰本机数据 |
| `pnpm seed:demo` | 幂等写入演示数据（`seed/demo-notes.json`），需先启动 dev。只增不删 |
| `pnpm seed:reset` | 清空业务表。必须先停止 `pnpm dev`。默认 dry-run，加 `--yes` 才真正执行，执行前备份到 `.tmp/` |

注意：

- 没有 `DEEPSEEK_API_KEY` 时，笔记、知识库、图谱都正常，只有「AI 整理」和右侧 AI 问答会报错。这是预期行为。
- 首次启动数据库为空。迁移在首次打开数据目录时自动执行（`lib/db/client.ts` 调用 `migrate()`）。
- `pnpm test` 不连接数据库，只走 HTTP。它只针对自己造的数据断言，因此库中有演示数据也能通过。

## 5. 目录结构

```
app/
  page.tsx            唯一页面，单页工作台，"use client"
  globals.css         全部设计令牌与组件样式
  layout.tsx          根布局
  api/**/route.ts     每个路由均声明 runtime = "nodejs"
components/
  landing-page.tsx            首屏门禁（滚轮/触摸/键盘揭示）
  landing-constellation.tsx   首屏星座
  landing-particle-field.tsx  首屏 Three.js 粒子场
  landing-stardust.tsx        星尘配方（首屏与工作台共用）
  interface-sound.tsx         Web Audio 实时合成音效，偏好存 localStorage
  graph-view.tsx              知识图谱（d3-force + Canvas）
  settings-panel.tsx          设置抽屉（主题 / 模型 / API / 数据）
lib/
  deepseek.ts         DeepSeek 调用：整理草稿、问答、改写提议
  inline-refs.ts      正文内联知识点标记（按标题匹配）
  text-diff.ts        逐行 LCS，供编辑助理的 Diff 卡使用
  zip.ts              手写 zip 写入器（store 模式），仅用于 markdown 知识包
  agent/              Agent 工具循环（loop.ts）与工具手册（manual.ts）
  services/           服务层，业务规则与归属过滤的唯一落点
    sources.ts        原始记录：读、创建、归档、编辑
    notes.ts          知识页：读、手动提升、更新（版本检查 + 修订）
    links.ts          正式关系：读、建立/复活、软删除
    proposals.ts      提议状态机
    bundle.ts         知识包导出 / 导入
  auth/               用户上下文与归属校验
  db/                 Drizzle schema、枚举、连接工厂
types/                raw / organize / knowledge / relation / graph / proposal / agent
seed/                 演示数据与播种 / 重置脚本
drizzle/              迁移文件 0000–0005，只能增量追加
docs/                 产品、设计、数据文档（见第 9 节）
```

## 6. 前端约定

**单页工作台与 Tab 结构。** 页面不是多路由，而是由 Tab 联合类型驱动：

```ts
type Tab =
  | { kind: "view"; viewKey: "new-note" | "graph"; ... }   // 工具类视图
  | { kind: "raw"; rawId: string; ... }                    // 单条原始记录
  | { kind: "knowledge"; knowledgeId: string; ... }        // 单条知识页
  | { kind: "draft"; rawId: string; ... }                  // Draft 审阅
```

- 左侧为 Raw / Knowledge 文件树，点击后用 `openXxxTab()` 打开标签。
- 工具类视图通过 `navigate(viewKey)` 打开或激活。
- 新增某类详情页：加一个 Tab 变体和一个 `renderXxxTab()`。不要新增路由或顶层视图。

**右栏是上下文面板，不是聊天框。** 它跟随当前标签，自上而下为：入链、出链、未链接提及、编辑助理。不要把它改回全局聊天框，也不要为 AI 另做一套视觉语言。

**界面约定：**

- 左栏折叠时为功能图标条（新建笔记 / 知识网络 / Agent），展开按钮在图标条内。
- 右栏收起时为右边缘图标条（56px），显示开合按钮和四个入口的计数角标。
- 右栏在 860px 以下变为抽屉，861px 及以上为常驻列。收起方式：抽屉内 ×、Esc、打开任意标签、再次点击入口。
- 写作区的位置、内边距、圆角、边框宽度不要改动，只改颜色。去框线时把 `border-color` 和背景改为透明。
- 毛玻璃仅用于浮层（命令面板、弹层、抽屉）。正文、侧栏、面板一律不透明。
- 主色为深色主题的紫色 `#7c3aed`，底色为深海军蓝 `#030712`。
- 中文正文：16px，行高 1.75，段距 1em，行宽上限 700px。
- 助手形象是一把会呼吸的竖琴（内联 SVG，细线，无渐变）。不要换成星芒、头像或发光圆球。
- 左栏只有四个分组：原始记录 / 知识页 / 标签 / 参考库。不要做"最近编辑 / 最近查看"列表。
- 没有 title 的原始记录按创建顺序显示为「未命名 1 / 2 / 3」。

**已删除的功能，不要重建：**

- 今日学习、复习、知识检查三个视图
- 新建笔记页的「最近原始笔记」列表
- AI 面板的五个预设按钮（已由 `@` 提及问答取代）
- 参考库（Wiki）整层，包括 `types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts` 及相关上下文类型

若将来需要类似功能，请按新形态重新设计，不要恢复旧结构。

**死样式待清理：** `globals.css` 中以下类名已无引用，修改样式时可顺手删除（删前用 `rg` 确认）：`.primary-nav`、`.nav-item`、`.nav-label`、`.recent-link`、`.plugin-*`、`.sidebar-section`、`.sidebar-label`、`.sidebar-empty`、`.wiki-preview`、`.wiki-reading`、`.wiki-section`、`.wiki-layout`、`.wiki-tree`、`.wiki-tree-item`。

## 7. 后端约定

**API 路由**

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/raw` | GET / POST / DELETE | GET 支持 `?scope=archived`。DELETE 为归档语义，被未归档知识页引用时返回 409 |
| `/api/raw/[id]` | PATCH | 用户编辑原话，仅 user 主体可调用 |
| `/api/organize` | POST | 调用 DeepSeek 生成 OrganizeDraft，不写库 |
| `/api/knowledge` | GET / POST | 列表 / 确认草稿入库（body 为 `{ rawId, draft }`，可选 `origin`，默认 `user`） |
| `/api/knowledge/[id]` | GET / PATCH | 读取 / 部分更新，支持可选 `version` 乐观并发（不匹配返回 409 `VERSION_CONFLICT`） |
| `/api/knowledge/[id]/relations` | GET | 该知识页的关联 |
| `/api/knowledge/[id]/backlinks` | GET | 反向链接，动态查询，不落表 |
| `/api/relations` | GET / POST | 关联列表 / 新建 |
| `/api/relations/[id]` | DELETE | 软删除关联 |
| `/api/graph` | GET | 实时生成 nodes / edges |
| `/api/assistant` | POST | AI 问答，服务端按 contextType + contextId 重新读取内容 |
| `/api/assistant/propose` | POST | 针对知识页生成改写提议（`note_update`），只写 pending 提议 |
| `/api/agent/organize` | POST | Agent 工具循环，返回步骤与待确认提议 |
| `/api/proposals` | GET / POST | 提议列表 / 提交 |
| `/api/proposals/[id]/approve\|reject\|apply` | POST | 决议与执行。apply 需先 approved，支持 `Idempotency-Key` |
| `/api/export` | GET | 默认返回 JSON 快照；`?format=markdown` 返回 zip |
| `/api/import` | POST | 导入知识包。`?dryRun=1` 只校验不写库；同名项保留已有、跳过导入 |

**服务层与归属**

- 所有读写经由 `lib/services/`。路由不要直接操作数据库。
- 所有查询、更新、删除都必须带 `user_id` 条件。`pnpm verify:db` 在 SQL 层断言了这一点。
- 知识页的更新使用 `version` 做乐观并发，写入 `note_revisions`。

**服务层的 jsonb 写入**

- jsonb 列直接传数组或对象，不要手动 `JSON.stringify`。Drizzle 已经序列化一次，重复序列化会写入"jsonb 字符串"。读路径不会报错，但 SQL 层的 `jsonb_array_elements`、`?`、GIN 索引都会失效。`pnpm verify:db` 有断言守着这条。

**枚举与约束**

- 枚举的唯一来源是 `lib/db/enums.ts`。数据库 CHECK、TS 类型、API 校验都从这里引用。
- `origin`（`user | ai`）表示内容由谁产生。`actor_type` / `author_type`（`user | agent | system`）表示操作主体。两者不可混用，不要机械地把 `ai` 替换成 `agent`。
- `links.type` 当前只允许 `related`。
- `note_ai_metadata.status` 暂未加 CHECK，因为合法值尚未确定。
- `updated_at` 没有触发器，由服务层在每次更新时显式写入。

**删除生命周期**

- `notes` 与 `raw_notes` 为归档优先。`notes.deleted_at` 为墓碑标记。
- `note_revisions`、`proposals` 以及 `links` 两端对 `notes` 的外键为 RESTRICT。删除不会静默带走历史或关系。
- `links` 的普通删除为可恢复软删除（`deleted_at`）。`links_pair_idx` 是完整唯一索引，重建同一关系时必须复活已有行，不能插入新行。
- Agent 没有 purge 路径，只能建议归档。永久清除只能由用户在 UI 手动发起，并且必须填写原因（写入 `audit_log.detail.reason`）。

## 8. 数据库与迁移

- 迁移 `drizzle/0000` 至 `0005` 必须按序执行。0001 将 0000 的 cascade 外键改为 restrict，只跑 0000 会留下危险的中间状态。
- 迁移只能追加新文件，不能修改历史迁移。
- 修改 Knowledge 字段结构时，需同步修改：`types/knowledge.ts`、`lib/services/notes.ts` 的映射、PATCH 路由的校验。
- 修改 schema 后，运行 `pnpm verify:db` 确认约束、外键、索引和归属隔离仍然成立。
- `drizzle/` 与 `lib/db/` 的改动应同时检查 `pnpm test`。

## 9. 修改清单

**新增一个 API 路由**
1. 声明 `export const runtime = "nodejs"`。
2. 业务逻辑放到 `lib/services/`，并带上 `user_id` 条件。
3. 对未知 id 返回 404，不泄露是否存在。
4. 如涉及 AI 写入，只能返回提议，不能直接落库。
5. 在 `pnpm test` 中补充断言。

**修改数据库结构**
1. 修改 `lib/db/` 中的 schema 与 `lib/db/enums.ts`。
2. 用 `drizzle-kit` 生成新的迁移文件，不要改历史迁移。
3. 同步更新 `types/` 与服务层映射。
4. 运行 `pnpm verify:db` 与 `pnpm test`。

**修改界面**
1. 沿用 `app/globals.css` 的类名与令牌。
2. 新详情页使用 Tab 变体，不新增路由。
3. 检查 861px 与 860px 两侧的右栏行为。
4. 浮层才使用毛玻璃。

**修改 AI 相关逻辑**
1. 所有模型输出都只生成草稿或提议。
2. 服务端重新读取上下文内容，不信任前端传来的正文。
3. 缺少 `DEEPSEEK_API_KEY` 时应给出清晰报错，而非静默失败。

## 10. 已知陷阱

- **PGlite 单写者。** `pnpm dev` 运行时，另开进程直接连接 `data/pglite` 不会报错，但它读到的是打开时的快照，它的写入会被应用覆盖。因此验证数据请使用 `pnpm verify:db`（内存库）或 HTTP 接口。不要编写"另开脚本直接连库造夹具"的工具。
- **`pnpm dev` 与 `pnpm build` 不能同时运行。** 两者共用 `.next/` 目录，会导致 `Cannot find module './xxx.js'`。
- **`@electric-sql/pglite` 必须留在 `next.config.ts` 的 `serverExternalPackages` 中。** 否则打包器会搅乱 WASM 与 worker 路径。
- **`pnpm build` 会打印 `eslint-plugin-react-hooks` 缺失的报错。** 构建仍然成功（exit 0），属于已知问题。
- **`data/` 目录属于使用者，不属于仓库。** 只保留 `.gitkeep`，不要提交数据库文件，也不要把演示数据放进 `data/`。演示内容统一通过 `pnpm seed:demo` 写入。
- **`tsconfig.tsbuildinfo` 是增量缓存，不要提交。**
- **Windows 下行尾假象。** 若 `git status` 列出大量修改但 `git diff` 无内容，是 stat 缓存过期，执行 `git add -A` 即可，不要用 `git checkout -- .`。
- **Windows + Git Bash 下路径含中文时，`cd` 偶尔失败。** 可将 `cd` 与后续命令写在同一条命令中，或使用相对路径。

## 11. 文档索引

| 文件 | 状态 |
|---|---|
| `AGENTS.md`（本文件） | 权威。与其他文档冲突时以此为准 |
| `docs/ROADMAP.md` | 目标、现状与差距，排期依据 |
| `docs/PROJECT_RULES.md` | 产品方向与长期模型 |
| `docs/DATA_MODEL.md` | 长期模型与当前实际 schema，注意区分 |
| `docs/DESIGN_SYSTEM.md` | 视觉规范 |
| `docs/DEV_WORKFLOW.md` | 分支与提交规范。个人开发直接提交 main 并推送 |
| `docs/THIRD_PARTY.md` | 第三方依赖登记 |
| `docs/schema.md` | 数据契约，只描述已实现状态 |
| `docs/PROJECT_CONTEXT.md` | 阶段性记录，可能滞后 |
| `docs/CODEX_AI_LEARNING_UI_BRIEF.md` | 历史 brief，已过时，不要照做 |
| `docs/reports/` | 历史报告，描述的是当时状态，不代表当前代码 |
| `README.md` | 面向人的简介 |

---

**文档原则：** 本文件只描述现行规则。历史决策、进度和复盘请放到 git 提交记录或 issue 中，不要写回这里。