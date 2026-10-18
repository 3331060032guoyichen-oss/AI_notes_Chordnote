# AGENTS.md

给编写本仓库的 AI 编码助手（Claude Code、Codex、Cursor 等）看的项目手册。改代码前请先读完本文件。

本文件只描述现行规则。历史决策、进度和复盘放 git 提交记录或 issue，不要写回这里。

## 1. 项目概览

AI Notes 是面向大学生的 AI 知识系统（校赛 Demo）。应用运行在使用者本机，数据存于本机，不依赖外部数据库或云服务，没有部署链路。

核心链路：

```
Raw（原始记录）→ Draft（AI 整理草稿）→ 用户确认 → Knowledge（知识页）→ Relation（关联）→ Graph（图谱）
```

## 2. 不可违反的约束

任何改动都不得破坏以下边界：

- **AI 只能提议，用户确认后才能写入知识网络。** `/api/organize` 只返回草稿，不落库。知识页只能由用户确认的草稿或手动提升产生。
- **Raw 正文 AI 永远不能改写。** 用户可通过 `PATCH /api/raw/:id` 修改自己的原话，每次修改写入一条审计记录（改前、改后、版本）。Agent 主体调用该接口返回 403（`USE_PROPOSAL_FLOW`）。
- **新建只写 Raw。** 不新增 `POST /api/notes`。知识页只能经 `POST /api/knowledge` 产生。回归测试里有一条断言守着这一点。
- **同一数据目录同一时刻只允许一个进程写。** 存储是 PGlite（WASM 版 PostgreSQL），单写者。
- **API Key 只在服务端。** 来自环境变量或 `data/settings.json`（已被 `data/*` 忽略）；任何接口、日志、导出知识包都不得出现密钥原文，设置接口只返回"是否已配置"。
- **模型调用只走 Provider 层。** 提示词、草稿校验与 Agent 权限留在上层，不为供应商复制一套。
- **删除只做归档。** 界面和普通 API 没有物理删除入口。唯一的物理删除是 `pnpm seed:reset -- --yes`，执行前会自动备份。

## 3. 技术栈

实际在用：

- Next.js 15（App Router）、React 19、TypeScript 5.9
- 样式：手写 CSS，全部在 `app/globals.css`，用 CSS 自定义属性作设计令牌
- 持久化：`drizzle-orm` + `@electric-sql/pglite`，数据目录 `data/pglite`
- 知识图谱：`d3-force` 只做力学计算，渲染为自绘 Canvas
- 背景星尘：`@tsparticles/*`
- 首屏粒子：`three`，仅用于 `components/landing-particle-field.tsx`，不要用于图谱或其他地方

**未安装，不要引入：**

- Tailwind CSS、shadcn/ui、Radix 或任何 UI 组件库（组件全部手写）
- `react-force-graph-2d` 等图谱组件库
- GSAP（动画只用 CSS transition 或 requestAnimationFrame）

写新 UI 时沿用 `app/globals.css` 已有的类名和变量（`--paper`、`--ink`、`--accent`、`--line`、`--radius` 等），不要引入新的样式方案。新增第三方依赖要登记到 `docs/THIRD_PARTY.md`。

## 4. 运行与验证

包管理器是 **pnpm**（`pnpm@11.25.0`）。不要用 npm 或 yarn，会破坏 lockfile 和 node_modules 结构。

```bash
pnpm install
cp .env.example .env.local   # 可选，填入 DEEPSEEK_API_KEY
pnpm dev                     # http://localhost:3000
```

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发服务器 |
| `pnpm build` / `pnpm start` | 生产构建与运行 |
| `pnpm lint` | 代码检查 |
| `pnpm test` | HTTP 回归测试（75 条断言），需先启动 `pnpm dev` |
| `pnpm test:unit` | 离线单元测试（Provider / 配置），不联网、不需要密钥 |
| `pnpm verify:db` | 在内存库上执行全部迁移并断言结构、约束、外键行为、归属隔离。不需要 dev server，不碰本机数据 |
| `pnpm seed:demo` | 幂等写入演示数据（`seed/demo-notes.json`），需先启动 dev，只增不删 |
| `pnpm seed:reset` | 清空业务表，必须先停止 `pnpm dev`。默认 dry-run，加 `--yes` 才执行，执行前备份到 `.tmp/` |

注意：

- 没有 `DEEPSEEK_API_KEY` 时，笔记、知识库、图谱都正常，只有「AI 整理」和右侧 AI 问答会报错，这是预期行为。
- 首次启动数据库为空，迁移由 `lib/db/client.ts` 在首次打开数据目录时自动执行。
- `pnpm test` 不连数据库，只走 HTTP，只针对自己造的数据断言，库里有演示数据也能通过。用完的数据只能归档清场，彻底清空用 `pnpm seed:reset -- --yes`。
- 演示数据 `seed/demo-notes.json` 有意留一条未建立的关联，用来演示「提到不等于连上」。不要为凑演示点再加笔记。换数据前先 `seed:reset`，再 `seed:demo`。

## 5. 目录结构

```
app/
  page.tsx            唯一页面：应用外壳 + 四个空间，"use client"
  globals.css         全部设计令牌与组件样式
  layout.tsx          根布局
  api/**/route.ts     每个路由均声明 runtime = "nodejs"
components/
  shell/              应用外壳：AppShell / PrimaryNav / SecondaryNav / InspectorHost
  knowledge/          Knowledge 空间的二级导航（文件树）
  agent/              Agent 空间的二级导航（本次任务）
  settings/           Settings 空间、六个入口与二级导航
  home/               Home 的只读活动摘要
  ui/                 共享内联图标
  landing-page.tsx            首屏门禁（只在首次进入时出现）
  landing-constellation.tsx   首屏星座
  landing-particle-field.tsx  首屏 Three.js 粒子场
  landing-stardust.tsx        星尘配方（首屏与工作台共用）
  interface-sound.tsx         Web Audio 实时合成音效，偏好存 localStorage
  graph-view.tsx              知识图谱（d3-force + Canvas）
  settings-panel.tsx          设置抽屉（主题 / 模型 / API / 数据）
lib/
  ai/                模型调用：provider.ts 传输与统一错误、config.ts 服务端配置、tasks.ts 提示词与形状校验
  api/               路由层小工具（本机写请求来源检查）
  inline-refs.ts      正文内联知识点标记（按标题匹配）
  text-diff.ts        逐行 LCS，供编辑助理的 Diff 卡使用
  zip.ts              手写 zip 写入器（store 模式），仅用于 markdown 知识包
  agent/              Agent 工具循环（loop.ts）与工具手册（manual.ts）
  services/           服务层，业务规则与归属过滤的唯一落点
    sources.ts        原始记录：读、创建、归档、编辑
    notes.ts          知识页：读、手动提升、更新（版本检查 + 修订）
    links.ts          正式关系：读、建立/复活、软删除
    proposals.ts      提议状态机（pending → approved → applied / rejected / stale）
    bundle.ts         知识包导出 / 导入
  auth/               用户上下文与归属校验
  db/                 Drizzle schema、枚举、连接工厂
types/                raw / organize / knowledge / relation / graph / proposal / agent
seed/                 演示数据与播种 / 重置脚本
drizzle/              迁移 0000–0005，只能增量追加
docs/                 产品、设计、数据文档（见第 11 节）
```

## 6. 前端约定

**单页应用 + 四个空间。** 页面仍是单一客户端页，不引入路由；一级空间由 `activeSpace` 驱动：

```ts
type Space = "home" | "knowledge" | "agent" | "settings";
```

- Knowledge 内部沿用 Tab 联合类型；**Tab 只属于 Knowledge**，其余空间不渲染 Tab 栏。
- Home / Settings 不显示右侧检查器；Knowledge / Agent 的检查器由 `InspectorHost` 按空间选择。
- 跨空间打开知识内容（例如 Agent 检查器里点知识页）时，先切到 Knowledge 再打开对应 Tab。

```ts
type Tab =
  | { kind: "view"; viewKey: "new-note" | "graph"; ... }   // 工具类视图
  | { kind: "raw"; rawId: string; ... }                    // 单条原始记录
  | { kind: "knowledge"; knowledgeId: string; ... }        // 单条知识页
  | { kind: "draft"; rawId: string; ... }                  // Draft 审阅
```

- 左侧是一级导航（Home / Knowledge / Agent / Settings）与当前空间的二级导航。
- 工具类视图用 `navigate(viewKey)` 打开或激活；Knowledge 的目录在 `components/knowledge/knowledge-tree.tsx`。
- 新增某类**详情页**：加一个 Tab 变体和一个 `renderXxxTab()`，不要新增路由。
- 新增一级**空间**：同时改 `components/shell/`（PrimaryNav / SecondaryNav / InspectorHost）与本文件这一节。

**右栏是检查器，不是聊天框。** 内容随空间与当前标签变化：

- Knowledge：知识页显示入链、出链、未链接提及、编辑助理；原始记录显示整理助手；图谱显示图谱参数。
- Agent：显示本次任务的整理摘要与守则。
- Home / Settings：**不显示检查器**（`AppShell` 收掉右栏列宽）。

不要改回全局聊天框，也不要为 AI 另做一套视觉语言。

**界面约定（已拍板，推翻前先确认是有意为之）：**

- 左栏折叠为功能图标条，四个入口与一级导航一致（Home / Knowledge / Agent / Settings），展开按钮在图标条内。
- 右栏收起为右边缘图标条（56px）：Knowledge 有入链 / 出链 / 未链接提及 / 编辑助理四个入口与计数角标；Agent 只有开合按钮。
- 右栏在 860px 及以下变为抽屉，861px 及以上为常驻列。抽屉收起方式：内部 ×、Esc、打开任意标签、再次点击入口。新增一级导航后需重新实测这一断点。
- 写作区的位置、内边距、圆角、边框宽度不要动，只改颜色。去框线时把 `border-color` 和背景改为透明。
- `.content-section` / `.capture-panel` 半透明（surface 42%），星尘从纸后透出，正文区保持可读。
- 毛玻璃仅用于浮层（命令面板、弹层、抽屉）。正文、侧栏、面板一律不透明。
- 深色主题：底色 `#030712`，强调色紫 `#7c3aed`。全文件只有一套深色令牌，不要再加第二套外观。
- 中文正文：16px、行高 1.75、段距 1em、行宽上限 700px。
- 导航与列表字号 15px、行高 34–36px，每屏可见条目不少于 12 条。
- 新建笔记只写原始记录：没有「创建笔记」按钮，停笔 2 秒自动收下。
- 没有 title 的原始记录按创建顺序显示为「未命名 1 / 2 / 3」。
- 助手形象是一把会呼吸的竖琴（内联 SVG，细线，无渐变），左栏 Agent 入口、右栏编辑助理、Agent 页面共用。不要换成星芒、头像或发光圆球。
- 助手状态四态：空闲 / 整理中 / 已收录 / 已归档，只动 `transform` 与 `opacity`，`prefers-reduced-motion` 下整体停掉。
- 界面声音开关在「Settings → Voice」，顶栏与侧栏底部都不放。
- 左栏分组：原始记录 / 知识页 / 标签，另有「已归档 N」分组用于恢复。不做「最近编辑 / 最近查看」。
- 图谱交互：单击选中出卡片，双击打开知识页，拖动即固定。

**已删除的功能，不要重建：**

- 今日学习、复习、知识检查三个视图
- 新建笔记页的「最近原始笔记」列表
- AI 面板的五个预设按钮（已由 `@` 提及问答取代）
- 参考库（Wiki）整层，包括 `types/wiki.ts`、`lib/wiki-storage.ts`、`app/api/wiki/route.ts` 及相关上下文类型
- `POST /api/notes`

若将来需要类似功能，按新形态重新设计，不要恢复旧结构。

**死样式（可顺手清理）：** `globals.css` 里以下类已无引用，删前用 `rg` 确认：`.recent-link`、`.plugin-*`、`.sidebar-section`、`.sidebar-label`、`.sidebar-empty`、`.wiki-preview`、`.wiki-reading`、`.wiki-section`、`.wiki-layout`、`.wiki-tree`、`.wiki-tree-item`。（`.primary-nav` / `.nav-item` / `.nav-label` 已由一级导航重新使用，不要删。）

## 7. 后端约定

### API 路由

| 路由 | 方法 | 说明 |
|---|---|---|
| `/api/raw` | GET / POST / DELETE | GET 支持 `?scope=archived`。DELETE 是归档语义，被未归档知识页引用时返回 409 |
| `/api/raw/[id]` | PATCH | 用户编辑原话，仅 user 主体可调用 |
| `/api/organize` | POST | 调 DeepSeek 生成 OrganizeDraft，不写库 |
| `/api/knowledge` | GET / POST | 列表 / 确认草稿入库。body 为 `{ rawId, draft }`，可选 `origin`（默认 `user`，AI 流程传 `ai`） |
| `/api/knowledge/[id]` | GET / PATCH | 读取 / 部分更新，可选 `version` 做乐观并发（不匹配返回 409 `VERSION_CONFLICT`）；`{ archived }` 归档或恢复 |
| `/api/knowledge/[id]/relations` | GET | 该知识页的关联 |
| `/api/knowledge/[id]/backlinks` | GET | 反向链接，动态查询，不落表 |
| `/api/relations` | GET / POST | 关联列表 / 新建 |
| `/api/relations/[id]` | DELETE | 软删除关联 |
| `/api/graph` | GET | 实时生成 nodes / edges |
| `/api/assistant` | POST | AI 问答，服务端按 contextType + contextId 重新读取内容 |
| `/api/assistant/propose` | POST | 针对知识页生成改写提议（`note_update`），只落 pending 提议，不写正文 |
| `/api/agent/organize` | POST | Agent 工具循环，返回步骤与待确认提议 |
| `/api/proposals` | GET / POST | 提议列表（可按 status、targetNoteId 过滤）/ 提交 |
| `/api/proposals/[id]/approve` `reject` `apply` | POST | 决议与执行。apply 需先 approved，支持 `Idempotency-Key` |
| `/api/export` | GET | 默认 JSON 全量快照；`?format=markdown` 返回 markdown + YAML frontmatter 的 zip |
| `/api/import` | POST | 导入知识包。`?dryRun=1` 只校验不写库；同名项保留已有、跳过导入 |
| `/api/settings/model` | GET / PATCH | 模型配置（脱敏读取 / 保存）。密钥只进不出，空串=保持、`null`=清除 |
| `/api/settings/model/test` | POST | 真实连接测试：可访问 / 模型存在 / 对话 / 工具调用四项分别报告 |

### 服务层与归属

- 所有读写经由 `lib/services/`，路由不直接操作数据库。
- 所有查询、更新、删除都必须带 `user_id` 条件，`pnpm verify:db` 在 SQL 层断言这一点。
- 知识页更新用 `version` 做乐观并发，并写入 `note_revisions`。
- `updated_at` 没有触发器，服务层每次更新必须显式写入，漏写不会报错。

### jsonb 写入

jsonb 列直接传数组或对象，**不要手动 `JSON.stringify`**。Drizzle 已序列化一次，重复序列化会写成"jsonb 字符串"：读路径看不出问题，但 `jsonb_array_elements`、`?`、GIN 索引全部失效。`pnpm verify:db` 有断言盯着。

### 枚举与约束

- 枚举的唯一来源是 `lib/db/enums.ts`，数据库 CHECK、TS 类型、API 校验都从这里引用。
- `origin`（`user | ai`）表示内容由谁产生；`actor_type` / `author_type`（`user | agent | system`）表示操作主体。两者不可混用，不要机械地把 `ai` 换成 `agent`。
- `links.type` 目前只允许 `related`。
- `note_ai_metadata.status` 暂未加 CHECK，因为合法值尚未确定，该表也没有写入路径。

### 删除生命周期

- `notes` 与 `raw_notes` 归档优先。`notes.deleted_at` 是墓碑标记，与 `archived_at` 是两个独立状态。
- `note_revisions`、`proposals`、`links` 两端对 `notes` 的外键为 RESTRICT：删除不会静默带走历史或关系。因此每条笔记都有 v1 修订，无法被物理删除，这是预期行为。
- `links` 普通删除是可恢复软删除（`deleted_at`）。`links_pair_idx` 是完整唯一索引，重建同一关系时必须复活已有行，不能插入新行。
- `raw_notes` 没有 `deleted_at`，目前只有归档。
- Agent 没有 purge 路径，最多建议归档。永久清除只能由用户在 UI 手动发起，须填写原因（写入 `audit_log.detail.reason`），purge 时 `raw_notes` 不级联删除。该流程尚未实现。

## 8. 数据库与迁移

- `drizzle/0000` 至 `0005` 必须按序执行。0001 把 0000 的 cascade 外键改为 restrict，只跑 0000 会留下危险的中间状态。
- 迁移只能追加新文件，不能修改历史迁移。
- 改 Knowledge 字段结构时，同步修改：`types/knowledge.ts`、`lib/services/notes.ts` 的映射、PATCH 路由的校验。
- 改 schema 后运行 `pnpm verify:db`，再运行 `pnpm test`。

## 9. 修改清单

**新增 API 路由**
1. 声明 `export const runtime = "nodejs"`。
2. 业务逻辑放到 `lib/services/`，带 `user_id` 条件。
3. 未知 id 一律返回 404。
4. 涉及 AI 写入时只能产生提议。
5. 在 `pnpm test` 里补断言。

**修改数据库结构**
1. 改 `lib/db/` 的 schema 和 `lib/db/enums.ts`。
2. 用 Drizzle 生成新的迁移文件（具体命令以 `package.json` 为准），不改历史迁移。
3. 同步 `types/` 与服务层映射。
4. 运行 `pnpm verify:db` 与 `pnpm test`。

**修改界面**
1. 沿用 `globals.css` 的类名与令牌。
2. 新详情页用 Tab 变体，不新增路由；新增一级空间见第 6 节。
3. 检查 860px 与 861px 两侧的右栏行为，以及 ≤760px 的移动端底部导航（4 或 5 个入口）。
4. 只有浮层才用毛玻璃；Settings / Home 不放检查器。
5. 未实现的能力显示空态，不用假数据填充。

**修改 AI 相关逻辑**
1. 模型输出只生成草稿或提议。
2. 服务端重新读取上下文，不信任前端传来的正文。
3. 供应商差异只放进 `lib/ai/provider.ts`：提示词与形状校验留在 `lib/ai/tasks.ts`，不要复制第二份。
4. 配置优先级固定为 `CHORDNOTE_*` > 旧 `DEEPSEEK_*`（仅 provider=deepseek）> `data/settings.json` > 默认值。
5. 缺少凭据时给出清晰报错（503 `CONFIG_MISSING`），不静默失败。

## 10. 已知陷阱

- **PGlite 单写者。** `pnpm dev` 运行时，另开进程直接连 `data/pglite` 不会报错，但它读到的是打开时的快照，写入还会被应用覆盖。验证数据请用 `pnpm verify:db`（内存库）或 HTTP 接口。不要写"另开脚本直连库造夹具"的工具。
- **`pnpm dev` 与 `pnpm build` 不能同时跑。** 共用 `.next/`，会报 `Cannot find module './xxx.js'`。
- **`@electric-sql/pglite` 必须留在 `next.config.ts` 的 `serverExternalPackages` 里。** 否则打包器搅乱 WASM 与 worker 路径。
- **`pnpm build` 会打印 `eslint-plugin-react-hooks` 缺失的报错。** 构建仍成功（exit 0），已知问题。
- **`data/` 属于使用者，不属于仓库。** 只保留 `.gitkeep`，不要提交库文件，也不要把演示数据放进去。演示内容走 `pnpm seed:demo`。
- **`tsconfig.tsbuildinfo` 是增量缓存，不要提交。**
- **目录名有两种写法：** clone 出来是 `ai-notes_demo`，本机可能叫 `ai-notes_demo-local`。常被误写成全连字符，那个路径不存在。
- **Windows 行尾假象。** `git status` 列出大量修改但 `git diff` 无内容，是 stat 缓存过期，执行 `git add -A` 即可，不要用 `git checkout -- .`。
- **Windows + Git Bash 下路径含中文时 `cd` 偶尔失败。** 把 `cd` 和后续命令写在同一条命令里，或用相对路径。
- **动手前先确认当前目录是仓库：** `git rev-parse --is-inside-work-tree`。不是仓库就不要用 git 判断改动或回滚。

## 11. 文档索引

| 文件 | 状态 |
|---|---|
| `AGENTS.md`（本文件） | 权威，与其他文档冲突时以此为准 |
| `docs/ROADMAP.md` | 目标、现状与差距，排期依据 |
| `docs/PROJECT_RULES.md` | 产品方向与长期模型 |
| `docs/DATA_MODEL.md` | 长期模型与当前实际 schema，注意区分 |
| `docs/schema.md` | 数据契约，只描述已实现状态，未实现标注 NOT IMPLEMENTED |
| `docs/DESIGN_SYSTEM.md` | 视觉规范 |
| `docs/DEV_WORKFLOW.md` | 分支与提交规范。个人开发直接提交 main 并 push，多人协作再走 feature 分支 + PR |
| `docs/THIRD_PARTY.md` | 第三方依赖登记 |
| `docs/adr/` | 架构决策记录，含本地嵌入式存储的取舍（0003） |
| `docs/PROJECT_CONTEXT.md` | 阶段性记录，可能滞后 |
| `docs/CODEX_AI_LEARNING_UI_BRIEF.md` | 历史 brief，已过时，不要照做 |
| `docs/reports/` | 历史报告，描述的是当时状态，不代表当前代码 |
| `README.md` | 面向人的简介 |

## 12. 产品内 Agent 的知识工作流

产品内的整理助手遵循 Karpathy 的 LLM Wiki 模式：Raw 不可变，知识库由 AI 持续整理，工作规则写在 schema 里。本项目的 schema 是 `lib/agent/manual.ts`，不在本文件。本节只规定改动相关代码时必须守住的约束。

### 对应关系

| LLM Wiki | 本项目 |
|---|---|
| Raw sources | `raw_notes` |
| Wiki | `notes`、`note_revisions`、`links` |
| Schema | `lib/agent/manual.ts` |
| index.md | `GET /api/knowledge` 与 `/api/graph`，不另建文件 |
| log.md | `audit_log` |

与原模式的区别：原模式由 LLM 直接写 wiki，本项目 AI 只提议，用户确认后才写入。

### 实现约束

**通用**
- AI 的产出只能是草稿或提议。不得直接写 Raw，不得直接写知识页。
- `manual.ts` 与本节冲突时以本节为准，并同步修改手册。

**Ingest（摄入）**
- 原文先落库，再调用 AI。AI 步骤失败时不回滚原文，错误信息需指出原文位置。
- 生成草稿前先读取已有知识页的标题与摘要，优先扩展已有页，不新建近似重复页。
- 对其他已有页的连带修改只生成 `note_update` 提议，逐条审批。
- 不自动建立关联。同名词出现不等于建立关系。

**Query（提问）**
- 先读相关知识页再回答，回答中的事实标注来源 id。知识库无依据时直接说明。
- 提问本身不写库。需要沉淀的回答只能转为提议。
- 查询日志同时记录"读取了哪些页"和"实际引用了哪些页"。

**Lint（体检）**
- 只产出报告和提议，不自动修改任何内容。
- 能由代码确定的检查（孤立页、断链、近似重复、来源过期）用代码实现，不交给模型。
- 需要模型判断的检查（矛盾、陈旧结论、缺失概念）只能作为建议，并标注"待人工核实"。
- 未链接提及已由右栏面板覆盖，不重复实现。

**写作与日志**
- 新旧结论冲突时两者并列保留并注明来源，不静默覆盖。
- 综合性摘要在新资料进入后整体重写，来源列表可以追加。
- 摄入、查询、体检、提议的审批与应用都写入 `audit_log`，操作名沿用 `<实体>.<动作>` 格式（如 `raw.update`）。

### 尚未决定，实现前先问

1. AI 答案能否成为新知识页。当前 `notes.raw_id` 非空，AI 答案没有 raw 来源。
2. 用户编辑 Raw 后，如何标记基于旧版本生成的知识页。这需要知识页记录所依据的 raw 版本号。
3. 体检的触发入口：接口加界面，还是仅在对话中触发。

以上三项没有结论前，不要自行选择方案并实现。本节描述的是目标行为，具体实现状态以代码为准。
