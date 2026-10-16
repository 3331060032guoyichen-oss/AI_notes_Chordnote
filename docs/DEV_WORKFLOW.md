# Development Workflow

## 当前事实（先读这段）

| 项 | 现在是什么 |
|---|---|
| 工作分支 | `main`。一个人做就直接提交 `main` 并 `git push`；多人协作走下面的「分工与协作」|
| 运行形态 | **本机运行，没有部署链路。** 应用与知识库都在使用者本机，交付物就是这份仓库：`pnpm install && pnpm dev` 即可 |
| 知识库 | 本机 **PGlite**（PostgreSQL 的 WASM 版，跑在应用进程内）+ Drizzle ORM。数据在 `data/pglite`，首次启动自动补齐迁移，**没有连接串** |
| 权威说明 | 仓库根目录的 [`AGENTS.md`](../AGENTS.md)：仓库结构、技术栈、已实现 / 已删除功能、决策记录、已知坑。**冲突时以它为准** |

红线：不要提交 `data/` 和任何 `.env*` 文件；不要手改 `drizzle/` 下已有的迁移文件（新增迁移要先复核 SQL，再在本机库上跑）；**不要在应用运行时让第二个进程连同一份数据目录**——PGlite 是单写者，那个进程会读到过期快照，写回去的内容还会被应用覆盖。

## 分工与协作

按三条工作线划分模块边界：**知识库和图谱**、**UI 界面**、**Skills 和插件**（见 `PROJECT_RULES.md`）。

协作方式：每人从 `main` 开 `feature/xxx` 或 `fix/xxx` 分支，完成并自验后开 Pull Request，由负责人合并到 `main`。**不要多人同时直接往 `main` 推**。合并进 `main` 就是下一次大家拉取的基线。

## 环境与命令

包管理器是 **pnpm**（`package.json` 里 `packageManager: pnpm@11.25.0`）。不要用 npm 或 yarn 安装依赖，会破坏 lockfile 和 `node_modules` 的符号链接结构。

```bash
pnpm install
cp .env.example .env.local   # 可选：只填 DEEPSEEK_API_KEY
pnpm dev                     # http://localhost:3000
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `DEEPSEEK_API_KEY` | 否 | 仅调试 AI 端点需要；不填时 `/api/organize`、`/api/assistant` 返回 503，其余功能正常 |
| `PGLITE_DATA_DIR` | 否 | 换知识库数据目录，默认 `./data/pglite`（相对项目根）。测试脚本用它指到别处的库，避免和应用抢同一份数据 |

没有任何连接串要填：知识库是跑在应用进程内的 PGlite，第一次 `pnpm dev` 就会建目录、补迁移。

## 验证流程

改完按顺序跑；缺哪一项，就在汇报里写成「未验证」：

```bash
pnpm exec tsc --noEmit   # 类型检查
pnpm build               # 生产构建；不要与 pnpm dev 同时跑（共用 .next/ 会互相覆盖）
pnpm dev                 # 另开终端
pnpm test                # 75 项回归断言，纯 HTTP，需服务在跑
pnpm verify:db           # 离线：在内存库上跑一遍迁移，校验表 / 约束 / 外键 / 归属隔离
pnpm seed:demo           # 可选：幂等写入演示数据（需服务在跑）
pnpm seed:reset          # 可选：清空业务表（默认 dry-run，加 -- --yes 才执行；必须先停掉 pnpm dev）
```

- `pnpm verify:db` 用一份**内存库**，不需要 dev server，也不会碰你的数据。
- `pnpm seed:reset` 会先探测 3000 端口，服务还活着就直接拒绝运行（单写者）；删除前把九张表备份到 `.tmp/`。
- 断言只针对**本次测试自己造的数据**，所以库里播了演示内容（`pnpm seed:demo`）也能跑绿 —— 不要写成"全表为 0"。

想把回归打到另一个地址（例如 `pnpm build` + `pnpm start` 的 :3001）：`REGRESSION_BASE_URL` 指过去再跑 `pnpm test`（PowerShell：`$env:REGRESSION_BASE_URL="http://localhost:3001"`）。

改了界面就必须在浏览器里真的点一遍。报告时明确区分「已验证」与「未验证」，不得用推断替代实测。

## 历史记录

以下是 2026-10 早期的分步开发记录，**已被后续重构取代**：存储层从本地 JSON 文件切到 PostgreSQL（Drizzle），「参考库 / Wiki」整层已按产品决策移除。仅作背景保留，不要据此实现新功能。

- Step 1–6：Raw 创建/读取/校验/持久化 → DeepSeek Draft → Draft 确认与 Knowledge 持久化 → Relation → Backlink → Graph，均已 PASS。
- Phase 1 全链路：真实 Raw、AI、确认、Relation、Backlink、Graph 与重启恢复测试已通过。
- Step 7（工作台改版）：左侧导航改为文件树 + 中间标签页；新增 `POST /api/assistant`（`@` 提及式问答）、`PATCH /api/knowledge/:id` 与内联编辑；同期移除「今日学习 / 复习 / 知识检查」三个视图、新建笔记页的「最近原始笔记」列表和 AI 面板的 5 个固定动作按钮。
- 后续：存储层先切到 PostgreSQL（Drizzle），2026-10-17 又从云库切到本机嵌入式库 —— 理由与边界见 [`docs/adr/0003-local-embedded-postgres.md`](adr/0003-local-embedded-postgres.md)。原始记录同期新增 `PATCH /api/raw/:id`（用户可改、留修订记录）。详见 `docs/reports/`。

## Commit 规范

使用清晰的 Conventional Commit 风格，例如 `feat: ...`、`fix: ...`、`refactor: ...`、`chore: ...`、`docs: ...`。避免 `update`、`aaa`、`final` 这类无信息提交信息；一次提交只做一件事。

## AI Coding 规范

修改前阅读相关 docs 与现有代码，明确影响范围并复用已有组件；修改后运行项目、检查相关页面并报告修改文件和测试结果。Prompt 应包含任务目标、上下文、相关文件、禁止修改内容、输入输出和验收标准。

使用 AI 编码工具时，先让它读仓库根目录的 [`AGENTS.md`](../AGENTS.md)（环境、红线、决策记录、已知坑都在里面），再读与当前任务相关的 `docs/` 文档。

## 模块边界与合并规则

- 前端通过内部 API 访问 AI 服务，**密钥只由服务端环境变量提供**，不得进入浏览器或代码。
- 知识结构的变化必须经过用户确认才写入。
- 禁止未经负责人确认的大范围重构；合并前需确认数据模型、UI 规范和基本错误状态没有被破坏。
