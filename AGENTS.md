# AGENTS.md

给编写本仓库的 AI 编码助手（Claude Code、Codex、Cursor 等）看的项目手册。改代码前请先读完本文件。

本文件只描述现行规则。历史决策、进度和复盘放 git 提交记录或 issue，不要写回这里。

## 1. 项目概览

AI Notes 是面向大学生的 AI 知识系统（校赛 Demo）。应用运行在使用者本机，数据存于本机，不依赖外部数据库或云服务，没有 Web 部署链路；另提供 Windows 桌面安装包（Tauri 2 + NSIS，见第 3、4 节）。

核心链路：

```
Raw（原始记录）→ Draft（AI 整理草稿）→ 用户确认或本轮完全允许授权 → Knowledge（知识页）→ Relation（关联）→ Graph（图谱）
```

## 2. 不可违反的约束

任何改动都不得破坏以下边界：

- **AI 按本轮权限执行。** 默认“可提议”保持草稿与逐项确认流程；“只读”只能检索、阅读和回答；“完全允许”可在本轮任务内由宿主自动收录草稿、应用本轮变更、分类与归档，保留版本检查、归属过滤和审计。旧会话待确认事项不自动应用。`/api/organize` 仍只返回草稿；知识页从已保存的 Raw 经共享提升服务产生。
- **Raw 正文 AI 永远不能改写。** 用户可通过 `PATCH /api/raw/:id` 修改自己的原话，每次修改写入一条审计记录（改前、改后、版本）。Agent 主体调用该接口返回 403（`USE_PROPOSAL_FLOW`）。
- **新建只写 Raw。** 不新增 `POST /api/notes`。知识页由 `POST /api/knowledge` 或完全允许的宿主调用同一提升服务产生，均要求 Raw 来源。
- **同一数据目录同一时刻只允许一个进程写。** 存储是 PGlite（WASM 版 PostgreSQL），单写者。
- **API Key 只在服务端。** 来自环境变量或 `data/settings.json`（已被 `data/*` 忽略）；任何接口、日志、导出知识包都不得出现密钥原文，设置接口只返回"是否已配置"。
- **模型调用只走 Provider 层。** 提示词、草稿校验与 Agent 权限留在上层，不为供应商复制一套。
- **笔记删除优先归档。** 永久清除仅走 Archive 的依赖确认流程或带备份的 `pnpm seed:reset -- --yes`。Canvas 卡片、图片和相连边直接删除，不影响其引用的笔记，也不在画板内显示归档面板。

## 3. 技术栈

实际在用：

- Next.js 15（App Router）、React 19、TypeScript 5.9
- 样式：手写 CSS，全部在 `app/globals.css`，用 CSS 自定义属性作设计令牌
- 持久化：`drizzle-orm` + `@electric-sql/pglite`，数据目录 `data/pglite`
- 知识图谱：`d3-force` 只做力学计算，渲染为自绘 Canvas
- 背景星尘：`@tsparticles/*`
- 首屏粒子：`three`，仅用于 `components/landing-particle-field.tsx`，不要用于图谱或其他地方
- Windows 桌面壳：Tauri 2（`src-tauri/`），只负责窗口生命周期与启动/停止本机 Next.js standalone 服务（127.0.0.1:3210）；Next.js 以 `output: "standalone"` 打包进安装包

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
| `pnpm build` / `pnpm start` | 生产构建（standalone 输出）与运行 |
| `pnpm lint` | 代码检查 |
| `pnpm test` | HTTP 回归测试（75 条断言）；3000 端口空闲时会自起临时 dev server |
| `pnpm test:unit` | 离线单元测试（Provider / 配置），不联网、不需要密钥 |
| `pnpm test:vault` | Vault 文件层验收：读写、扫描、Watcher、权限、审计、归档恢复 |
| `pnpm verify:db` | 在内存库上执行全部迁移并断言结构、约束、外键行为、归属隔离。不需要 dev server，不碰本机数据 |
| `pnpm seed:demo` | 幂等写入演示数据（`seed/demo-notes.json`），需先启动 dev，只增不删 |
| `pnpm seed:reset` | 清空业务表，必须先停止 `pnpm dev`。默认 dry-run，加 `--yes` 才执行，执行前备份到 `.tmp/` |
| `pnpm desktop:dev` | Tauri 开发窗；服务固定 `127.0.0.1:3210` |
| `pnpm desktop:build` | 生成 Windows NSIS 安装包，需要 Rust 工具链；产物在 `src-tauri/target/` |
| `pnpm desktop:verify:runtime` | 用临时数据目录启动打包后的 standalone 服务，验证 `/api/health` 与关闭接口 |

注意：

- 默认 DeepSeek 且没有 `DEEPSEEK_API_KEY` 时，笔记、知识库、图谱都正常，只有「AI 整理」和右侧 AI 问答会报错，这是预期行为；改用 Ollama / 自定义接口时以设置里的配置为准。
- 首次启动数据库为空，迁移由 `lib/db/client.ts` 在首次打开数据目录时自动执行。
- `pnpm test` 不连数据库，只走 HTTP，只针对自己造的数据断言，库里有演示数据也能通过。3000 端口空闲时它会自己起一个临时 dev server，跑完连同数据一起删掉；已开着 `pnpm dev` 就直接复用。用完的数据只能归档清场，彻底清空用 `pnpm seed:reset -- --yes`。
- 桌面版与网页版的数据目录不同：网页版是 `./data/pglite`，安装包版是 `%LOCALAPPDATA%\Chordnote\db`，模型配置与日志也在同目录。
- 演示数据 `seed/demo-notes.json` 有意留一条未建立的关联，用来演示「提到不等于连上」。不要为凑演示点再加笔记。换数据前先 `seed:reset`，再 `seed:demo`。

## 5. 目录结构

```
app/
  page.tsx            唯一页面：Ribbon、文档工作区与 Agent 对话，"use client"
  globals.css         全部设计令牌与组件样式
  layout.tsx          根布局
  api/**/route.ts     每个路由均声明 runtime = "nodejs"
middleware.ts         /api/* 只接受回环 Host；写请求要求本机 Origin
components/
  shell/              固定 Ribbon、可折叠左树、可折叠 Agent 面板与中央工作区网格
  settings/           设置弹层、模型面板与 Archive
  markdown-editor.tsx CM6 连续 Markdown / Live Preview 编辑器
  document-session.tsx 文档保存、frontmatter 属性折叠与版本冲突恢复
  workspace-tree.tsx  Raw / Wiki / 未整理笔记 / Schema / Readme 左树
  canvas-workspace.tsx 本地版本化自由白板（便签、笔迹、图片与连线）
  ui/                 共享内联图标
  landing-page.tsx            完整落地页（首次进入时出现）
  landing-constellation.tsx   首屏星座
  landing-particle-field.tsx  首屏 Three.js 粒子场
  landing-stardust.tsx        星尘配方（首屏与工作台共用）
  interface-sound.tsx         Web Audio 实时合成音效，偏好存 localStorage
  graph-view.tsx              知识图谱（d3-force + Canvas）
lib/
  ai/                模型调用：provider.ts 传输与统一错误、config.ts 服务端配置、tasks.ts 提示词与形状校验
  api/               路由层小工具（本机写请求来源检查）
  documents/          Markdown/frontmatter、wikilink 解析与兼容迁移
  text-diff.ts        逐行 LCS，供编辑助理的 Diff 卡使用
  zip.ts              手写 zip 写入器（store 模式），仅用于 markdown 知识包
  agent/              dsh 运行时、受控工具循环、ACP 桥接与唯一手册（manual.ts）
  services/           服务层，业务规则与归属过滤的唯一落点
    sources.ts        原始记录：读、创建、归档、编辑
    notes.ts          知识页：读、手动提升、更新（版本检查 + 修订）
    links.ts          正式关系：读、建立/复活、软删除
    proposals.ts      提议状态机（pending → approved → applied / rejected / stale）
    bundle.ts         知识包导出 / 导入
    archive.ts        归档、恢复与归档内永久清除
    canvases.ts       白板工作区版本化保存
  auth/               用户上下文与归属校验
  db/                 Drizzle schema、枚举、连接工厂
types/                raw / organize / knowledge / relation / graph / proposal / agent
seed/                 演示数据（`demo-notes.json`）
scripts/              构建、桌面暂存、回归、迁移校验与数据脚本
src-tauri/            Windows 桌面宿主（Tauri 2 / Rust）
drizzle/              迁移 0000–0007，只能增量追加
deliverables/         校赛提交材料（PPT / 文档 / 界面预览）
docs/                 产品、设计、数据文档（见第 11 节）
```

## 6. 前端约定

**单页文档工作区。** 页面仍是单一客户端页，不引入页面路由；`activeSpace` 只控制当前工作区视图：

```ts
type Space = "home" | "knowledge" | "graph" | "agent" | "settings";
```

- 每个 Raw 或 Knowledge 详情都通过 `DocumentSession` 打开；标题就是文档的第一个 Markdown heading，不能另造块状标题输入框。
- Markdown 与 frontmatter 是正文和属性的唯一来源。CM6 装饰只负责 Live Preview，不能改写原始 `[[...]]` 语法。
- 跨空间打开内容时先切换空间，再打开对应文档。

```ts
type Tab =
  | { kind: "view"; viewKey: "new-note" | "knowledge-index"; ... } // 空间起始视图
  | { kind: "raw"; rawId: string; ... }                    // 单条原始记录
  | { kind: "knowledge"; knowledgeId: string; ... }        // 单条知识页
  | { kind: "draft"; rawId: string; ... }                  // Draft 审阅
```

- 最左侧 Ribbon 始终可见，顺序固定为 logo（开合左树）、查找、图谱、白板、Agent，底部固定设置图标。左树顺序固定为 `Raw`、`Wiki`、`未整理笔记`、`Schema`、`Readme`。现有知识页路径继续兼容 `wilki/` 前缀。
- `Schema` 使用 Markdown 编辑器；默认内容在 `lib/agent/Schema.md`，用户保存到模型配置同目录的 `Schema.md`，下次 Agent 运行读取。`lib/agent/manual.ts` 保留宿主边界与工具权限，编辑 Schema 不改变工具授权。
- 右栏固定为可收起的 Agent 对话与模型选择。不得恢复 Knowledge 的常驻出链/入链/未链接提及面板；这些查询走命令搜索或 Agent `@mention`。
- 工作区使用 Ribbon + 可折叠左右 panel + 中央编辑器的 CSS grid。开面板必须压缩中央区域，不能覆盖正文。

**界面约定（已拍板，推翻前先确认是有意为之）：**

- Ribbon 宽度固定 56px；左树由 logo 开合，右侧 Agent 开关与 logo 同高。
- 右栏在 860px 及以下变为抽屉，861px 及以上为常驻列。抽屉收起方式：内部 ×、Esc、打开任意标签、再次点击入口。新增一级导航后需重新实测这一断点。
- 连续编辑器不显示 Markdown 标记，只有选中或光标进入语法时 reveal；`[[` 打开补全，未解析链接只能由用户显式创建 Raw。
- `.content-section` / `.capture-panel` 半透明（surface 42%），星尘从纸后透出，正文区保持可读。
- 毛玻璃仅用于浮层（命令面板、弹层、抽屉）。正文、侧栏、面板一律不透明。
- 深色主题：底色 `#030712`，强调色紫 `#7c3aed`。全文件只有一套深色令牌，不要再加第二套外观。
- 中文正文：16px、行高 1.75、段距 1em、行宽上限 700px。
- 导航与列表字号 15px、行高 34–36px，每屏可见条目不少于 12 条。
- 每次点击新建笔记都由服务端立刻创建一条 Raw，持久分配 `raw/<id>.md`，在独立的「未整理笔记」入口显示；收录知识页时将来源归入 Raw 的 articles / papers / books / media / data 类别，默认 articles。Raw 不设 index 或收件箱子目录，旧来源路径继续兼容。是否已整理以存在对应知识页为准（含已归档页），自动保存不会产生知识页。
- 新建 Raw 由服务端依次命名为「未命名1 / 未命名2 / 未命名3」，编辑文档第一个 heading 可修改标题；旧数据的空标题按创建顺序以同一格式回退显示。
- 助手形象是「抚琴司天监 · Zhiyin」：几何拼色官袍、金框三弦古琴、八角宫灯与星宿网络，前景内联 SVG + 背景 Canvas。视觉规范见 `docs/AGENT_VISUAL_SPEC.md`。图标入口继续用竖琴，不要换成星芒、头像或发光圆球。
- 助手状态两态：静息中 / 工作中。用户发出指令后进入工作态（拨弦、音波涟漪、星云与星网），没有指令时静息（星云隐去、双手平搭、宫灯低亮）。动效只动 `transform` / `opacity` 与 Canvas 绘制，`prefers-reduced-motion` 下停掉动画。
- 界面声音开关在「Settings → Voice」，顶栏与侧栏底部都不放。
- 已归档内容统一放在 Settings → Archive。图谱不提供孤立节点、方向箭头或重新布局选项。

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
| `/api/raw` | GET / POST / DELETE | GET 支持 `?scope=archived`。POST 无标题时服务端分配未命名编号。DELETE 是归档语义，被未归档知识页引用时返回 409 |
| `/api/raw/new` | POST | 立即创建一个空白、持久化的未命名 Raw，供「新建笔记」入口使用 |
| `/api/raw/[id]` | PATCH | 用户编辑原话，仅 user 主体可调用 |
| `/api/organize` | POST | 经 Provider 层生成 OrganizeDraft，不写库 |
| `/api/knowledge` | GET / POST | 列表 / 确认草稿入库。body 为 `{ rawId, draft }`，可选 `origin`（默认 `user`，AI 流程传 `ai`） |
| `/api/knowledge/[id]` | GET / PATCH | 读取 / 部分更新，可选 `version` 做乐观并发（不匹配返回 409 `VERSION_CONFLICT`）；`{ archived }` 归档或恢复 |
| `/api/knowledge/[id]/relations` | GET | 该知识页的关联 |
| `/api/knowledge/[id]/backlinks` | GET | 反向链接，动态查询，不落表 |
| `/api/knowledge/health` | GET | 知识库体检：孤立页、断链、重名、未整理来源、分类分布。只读，不落库 |
| `/api/relations` | GET / POST | 关联列表 / 新建 |
| `/api/relations/[id]` | DELETE | 软删除关联 |
| `/api/graph` | GET | 实时生成 nodes / edges |
| `/api/assistant` | POST | AI 问答，服务端按 contextType + contextId 重新读取内容 |
| `/api/assistant/propose` | POST | 针对知识页生成改写提议（`note_update`），只落 pending 提议，不写正文 |
| `/api/agent/organize` | POST | Agent 工具循环，返回步骤与待确认提议 |
| `/api/agent/schema` | GET / PATCH | 读取 / 保存 Markdown Schema，hash 乐观并发；工具权限仍由宿主控制 |
| `/api/bootstrap` | GET | 一次读取工作区启动所需的 Raw、Knowledge、图谱和提议，避免 PGlite 并发冷启动 |
| `/api/documents` | GET / POST | Markdown 文档引用索引 / 用户显式创建未解析 Raw 链接目标 |
| `/api/canvas` | GET / PUT | 白板工作区，`version` 乐观并发 |
| `/api/archive` | GET / PATCH / DELETE | 归档列表、恢复、归档内永久清除；永久清除需要理由与依赖确认 |
| `/api/proposals` | GET / POST | 提议列表（可按 status、targetNoteId 过滤）/ 提交 |
| `/api/proposals/[id]/approve` `reject` `apply` | POST | 决议与执行。apply 需先 approved，支持 `Idempotency-Key` |
| `/api/export` | GET | 默认 JSON 全量快照；`?format=markdown` 返回 markdown + YAML frontmatter 的 zip |
| `/api/import` | POST | 导入知识包。`?dryRun=1` 只校验不写库；同名项保留已有、跳过导入 |
| `/api/settings/model` | GET / PATCH | 模型配置（脱敏读取 / 保存）。密钥只进不出，空串=保持、`null`=清除 |
| `/api/settings/model/models` | POST | 按本地、厂商或自定义配置发现模型列表 |
| `/api/settings/model/test` | POST | 真实连接测试：可访问 / 模型存在 / 对话 / 工具调用四项分别报告 |
| `/api/health` | GET | 桌面宿主轮询的存活检查，同时验证 PGlite 初始化与迁移 |
| `/api/desktop/shutdown` | POST | 仅 Tauri 宿主调用；校验 `x-chordnote-shutdown-token` 后关闭进程 |

所有 `/api/*` 请求先经过 `middleware.ts`：Host 必须是回环地址；写请求（POST / PATCH / PUT / DELETE）还要求 Origin 来自本机页面（桌面模式下固定 `127.0.0.1:3210`）。非浏览器的本机客户端没有 Origin。

### 服务层与归属

- 所有读写经由 `lib/services/`，路由不直接操作数据库。
- 一个 Raw 可以产出多张知识页（来源摘要页、实体页、概念页……），关系记在 `note_sources`；`notes.raw_id` 只表示主要来源。`promoteFromSource` 按（rawId, 标题, 正文）幂等：同一标题同一正文视为重试返回已有页，否则新建，标题撞车时追加 1、2 编号。
- 所有查询、更新、删除都必须带 `user_id` 条件，`pnpm verify:db` 在 SQL 层断言这一点。
- 知识页更新用 `version` 做乐观并发，并写入 `note_revisions`。
- `updated_at` 没有触发器，服务层每次更新必须显式写入，漏写不会报错。

### jsonb 写入

jsonb 列直接传数组或对象，**不要手动 `JSON.stringify`**。Drizzle 已序列化一次，重复序列化会写成"jsonb 字符串"：读路径看不出问题，但 `jsonb_array_elements`、`?`、GIN 索引全部失效。`pnpm verify:db` 有断言盯着。

### 枚举与约束

- 枚举的唯一来源是 `lib/db/enums.ts`，数据库 CHECK、TS 类型、API 校验都从这里引用。
- `origin`（`user | ai`）表示内容由谁产生；`actor_type` / `author_type`（`user | agent | system`）表示操作主体。两者不可混用，不要机械地把 `ai` 换成 `agent`。
- `links.type` 允许 `related`（无方向）与 `supports` / `contradicts` / `example` / `prerequisite`（有方向，必须带 `evidence`）。`related` 的无序对只保留一条；有方向的类型按方向去重。
- `note_ai_metadata.status` 暂未加 CHECK，因为合法值尚未确定，该表也没有写入路径。

### 删除生命周期

- `notes` 与 `raw_notes` 归档优先。`notes.deleted_at` 是墓碑标记，与 `archived_at` 是两个独立状态。
- `note_revisions`、`proposals`、`links` 两端对 `notes` 的外键为 RESTRICT：删除不会静默带走历史或关系。因此每条笔记都有 v1 修订，无法被物理删除，这是预期行为。
- `links` 普通删除是可恢复软删除（`deleted_at`），在 Archive 中可恢复或永久清除。`links_pair_idx` 是完整唯一索引，重建同一关系时必须复活已有行，不能插入新行。
- `raw_notes` 没有 `deleted_at`，目前只有归档。
- Agent 没有 purge 路径，最多建议归档。用户只能在 Archive 中发起永久清除，必须填写理由并确认依赖；理由写入 `audit_log.detail.reason`，Raw 不级联清除。

## 8. 数据库与迁移

- `drizzle/0000` 至 `0007` 必须按序执行。0001 把 0000 的 cascade 外键改为 restrict，只跑 0000 会留下危险的中间状态。
- 迁移只能追加新文件，不能修改历史迁移。
- 改 Knowledge 字段结构时，同步修改：`types/knowledge.ts`、`lib/services/notes.ts` 的映射、PATCH 路由的校验。
- 改 schema 后运行 `pnpm verify:db`，再运行 `pnpm test`。

## 9. 修改清单

**新增 API 路由**
1. 声明 `export const runtime = "nodejs"`。
2. 业务逻辑放到 `lib/services/`，带 `user_id` 条件。
3. 未知 id 一律返回 404。
4. AI 默认只产生提议；完全允许的宿主调用必须校验本轮权限，并复用服务层版本检查和审计。
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
4. 只有浮层才用毛玻璃；Settings 与 Home 新建页不放检查器，Home 原始记录显示整理助手。
5. 未实现的能力显示空态，不用假数据填充。

**修改 AI 相关逻辑**
1. 模型输出经过宿主处理：只读不生成变更，可提议等待逐项确认，完全允许只自动执行本轮授权任务产生的变更。
2. 服务端重新读取上下文，不信任前端传来的正文。
3. 供应商差异只放进 `lib/ai/provider.ts`：提示词与形状校验留在 `lib/ai/tasks.ts`，不要复制第二份。
4. 配置优先级固定为 `CHORDNOTE_*` > 旧 `DEEPSEEK_*`（仅 provider=deepseek）> `data/settings.json` > 默认值。
5. 缺少凭据时给出清晰报错（ProviderError `CONFIG_MISSING`；对外 HTTP 错误码仍是 `DEEPSEEK_CONFIG_MISSING`），不静默失败。

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
- **Windows 桌面打包需要 Rust 工具链。** `pnpm desktop:build` 先跑 `pnpm build`，再把 standalone 运行时装进 `.desktop/runtime/`；该目录是可再生产物，不要提交。
- **桌面版的数据不在 `data/`。** 安装包版把库放在 `%LOCALAPPDATA%\Chordnote\db`，模型配置在同目录 `settings.json`，日志在 `logs/desktop.log`；只有网页版用 `./data/pglite`。
- **动手前先确认当前目录是仓库：** `git rev-parse --is-inside-work-tree`。不是仓库就不要用 git 判断改动或回滚。

## 11. 文档索引

| 文件 | 状态 |
|---|---|
| `AGENTS.md`（本文件） | 权威，与其他文档冲突时以此为准 |
| `docs/ROADMAP.md` | 目标、现状与差距，排期依据 |
| `docs/PROJECT_RULES.md` | 产品方向与长期模型 |
| `docs/DATA_MODEL.md` | 长期模型与当前实际 schema，注意区分 |
| `docs/schema.md` | 数据契约，只描述已实现状态，未实现标注 NOT IMPLEMENTED |
| `docs/VAULT_SCHEMA.md` | Markdown-first Vault 数据契约（草案）：目录、frontmatter、身份、链接、Source↔Concept |
| `docs/STORAGE_LAYER.md` | 文件读写、Watcher、hash 校验、索引重建、归档与删除（草案） |
| `docs/DESIGN_SYSTEM.md` | 视觉规范 |
| `docs/AGENT_VISUAL_SPEC.md` | Agent 形象「抚琴司天监」的双层渲染与两态动效规范 |
| `docs/DEV_WORKFLOW.md` | 分支与提交规范。个人开发直接提交 main 并 push，多人协作再走 feature 分支 + PR |
| `docs/THIRD_PARTY.md` | 第三方依赖登记 |
| `GLOSSARY.md` | 领域术语与 _Avoid_ 命名 |
| `docs/adr/` | 架构决策记录，含本地嵌入式存储的取舍（0003） |
| `docs/reports/` | 历史报告，描述的是当时状态，不代表当前代码 |
| `README.md` | 面向人的简介 |

## 12. 产品内 Agent 的知识工作流

产品内的整理助手遵循 Karpathy 的 LLM Wiki 模式：Raw 用户可改、AI 不可改，知识库由 AI 持续整理，工作规则写在 schema 里。本项目的默认 Schema 是 `lib/agent/Schema.md`，宿主边界与工具权限在 `lib/agent/manual.ts`，不在本文件。本节只规定改动相关代码时必须守住的约束。

### 对应关系

| LLM Wiki | 本项目 |
|---|---|
| Raw sources | `raw_notes` |
| Wiki | `notes`、`note_revisions`、`links` |
| Schema | `lib/agent/Schema.md`（默认）与用户保存的 `Schema.md` |
| index.md | `GET /api/knowledge` 与 `/api/graph`，不另建文件 |
| log.md | `audit_log` |

与原模式的区别：写入由宿主按本轮权限控制，默认可提议等待逐项确认，完全允许在本轮任务内自动应用；Raw 原文仍只由用户编辑。

### 实现约束

**通用**
- AI 通过受控工具产生草稿或变更；只读不得产生变更，可提议等待用户确认，完全允许由宿主自动应用本轮产生的变更。各档均不得改写 Raw 原文。
- `manual.ts` 与本节冲突时以本节为准，并同步修改手册。
- Agent 统一经 dsh 多轮工具运行时调度。兼容 API、Ollama 与 ACP 外部 Agent 由服务端运行时配置注入；不得把 provider、模型名或工具清单硬编码到 prompt。
- dsh 原生文件、shell、数据库工具保持关闭。Chordnote 工具桥按本轮权限读取受限上下文、创建提议或执行已授权变更；运行时元信息必须能回答 provider、model、tools 与实际权限。
- ACP 子进程不继承 `CHORDNOTE_*` 凭据，只能经一次性令牌的 MCP 工具桥访问白名单工具。
- Agent 输出中的 `[[...]]` 是原始 Markdown，确认应用后必须经共享 Markdown 服务更新并重建引用装饰。

**Ingest（摄入）**
- 原文先落库，再调用 AI。AI 步骤失败时不回滚原文，错误信息需指出原文位置。
- 生成草稿前先读取已有知识页的标题与摘要，优先扩展已有页，不新建近似重复页。
- 已有页更新复用 `note_update` 提议与版本检查；可提议逐条审批，完全允许自动应用本轮新变更。
- 同名词出现不等于建立关系；可提议等待关联确认，完全允许须读取两端内容并依据任务建立关联。

**Query（提问）**
- 先读相关知识页再回答，回答中的事实标注来源 id。知识库无依据时直接说明。
- 提问本身不写库。需要沉淀的回答只能转为提议。
- 查询日志同时记录"读取了哪些页"和"实际引用了哪些页"。

**Lint（体检）**
- 只产出报告和提议，不自动修改任何内容。
- 能由代码确定的检查（孤立页、断链、近似重复、来源过期）用代码实现，不交给模型。
- 需要模型判断的检查（矛盾、陈旧结论、缺失概念）只能作为建议，并标注"待人工核实"。
- 未链接提及不常驻显示；需要时由命令搜索或 Agent 工具读取。

**写作与日志**
- 新旧结论冲突时两者并列保留并注明来源，不静默覆盖。
- 综合性摘要在新资料进入后整体重写，来源列表可以追加。
- 摄入、查询、体检、提议的审批与应用都写入 `audit_log`，操作名沿用 `<实体>.<动作>` 格式（如 `raw.update`）。

### 尚未决定，实现前先问

1. AI 答案能否成为新知识页。当前 `notes.raw_id` 非空，AI 答案没有 raw 来源。
2. 用户编辑 Raw 后，如何标记基于旧版本生成的知识页。这需要知识页记录所依据的 raw 版本号。
3. 体检的触发入口：接口加界面，还是仅在对话中触发。

以上三项没有结论前，不要自行选择方案并实现。本节描述的是目标行为，具体实现状态以代码为准。
