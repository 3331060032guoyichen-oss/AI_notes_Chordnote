# Development Workflow

## 当前事实（先读这段）

| 项 | 现在是什么 |
|---|---|
| 工作与部署分支 | `main`。Netlify 从 `main` 自动构建发布，**改动必须推到 `main` 才会生效** |
| 部署平台 | Netlify（站点 `hilarious-kheer-89a440.netlify.app`），推送后约 1–3 分钟上线 |
| 数据库 | Neon PostgreSQL + Drizzle ORM。连接串在 `.env.local` 的 `DATABASE_URL`（**dev 分支**） |
| 权威说明 | 仓库根目录的 [`AGENTS.md`](../AGENTS.md)：仓库结构、技术栈、已实现 / 已删除功能、决策记录、已知坑。**冲突时以它为准** |

红线：不要连接或迁移 **production** 分支；不要提交任何 `.env*` 文件；不要手改 `drizzle/` 下已有的迁移文件（新增迁移要先复核 SQL，再在 dev 分支执行）。

## 分工与协作

按三条工作线划分模块边界：**知识库和图谱**、**UI 界面**、**Skills 和插件**（见 `PROJECT_RULES.md`）。

协作方式：每人从 `main` 开 `feature/xxx` 或 `fix/xxx` 分支，完成并自验后开 Pull Request，由负责人合并到 `main`。**不要多人同时直接往 `main` 推**。合并进 `main` 就等于发布到线上。

## 环境与命令

包管理器是 **pnpm**（`package.json` 里 `packageManager: pnpm@11.25.0`）。不要用 npm 或 yarn 安装依赖，会破坏 lockfile 和 `node_modules` 的符号链接结构。

```bash
pnpm install
cp .env.example .env.local   # 然后按下表填变量
pnpm dev                     # http://localhost:3000
```

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | Neon **dev 分支**的池化连接串（host 含 `-pooler`），由负责人私下提供，不要写进仓库、文档或提交信息 |
| `DEEPSEEK_API_KEY` | 否 | 仅调试 AI 端点需要；不填时 `/api/organize`、`/api/assistant` 返回 503，其余功能正常 |

## 验证流程

改完按顺序跑；缺哪一项，就在汇报里写成「未验证」：

```bash
pnpm exec tsc --noEmit   # 类型检查
pnpm build               # 生产构建；不要与 pnpm dev 同时跑（共用 .next/ 会互相覆盖）
pnpm dev                 # 另开终端
pnpm test                # 60 项回归断言，需服务在跑；结束时打印「清理后库内为 0」
pnpm verify:db           # 校验数据库结构（11 张表 / 11 个 CHECK / 8 个外键）
```

要验证线上而不是本地：把 `REGRESSION_BASE_URL` 指向线上站点再跑 `pnpm test`（PowerShell：`$env:REGRESSION_BASE_URL="https://hilarious-kheer-89a440.netlify.app"`）。

改了界面就必须在浏览器里真的点一遍。报告时明确区分「已验证」与「未验证」，不得用推断替代实测。

判断线上是否跑的是最新代码：往 dev 库插一条数据，看线上接口能否读到。只看页面能不能打开判断不出来——历史上就因为改动没推送，线上长期跑着旧代码（见 `AGENTS.md` 决策记录）。

## 历史记录

以下是 2026-10 早期的分步开发记录，**已被后续重构取代**：存储层从本地 JSON 文件切到 PostgreSQL（Drizzle），「参考库 / Wiki」整层已按产品决策移除。仅作背景保留，不要据此实现新功能。

- Step 1–6：Raw 创建/读取/校验/持久化 → DeepSeek Draft → Draft 确认与 Knowledge 持久化 → Relation → Backlink → Graph，均已 PASS。
- Phase 1 全链路：真实 Raw、AI、确认、Relation、Backlink、Graph 与重启恢复测试已通过。
- Step 7（工作台改版）：左侧导航改为文件树 + 中间标签页；新增 `POST /api/assistant`（`@` 提及式问答）、`PATCH /api/knowledge/:id` 与内联编辑；同期移除「今日学习 / 复习 / 知识检查」三个视图、新建笔记页的「最近原始笔记」列表和 AI 面板的 5 个固定动作按钮。
- 后续：存储层切换到 Neon + Drizzle，原始记录新增 `PATCH /api/raw/:id`（用户可改、留修订记录）。详见 `docs/reports/`。

## Commit 规范

使用清晰的 Conventional Commit 风格，例如 `feat: ...`、`fix: ...`、`refactor: ...`、`chore: ...`、`docs: ...`。避免 `update`、`aaa`、`final` 这类无信息提交信息；一次提交只做一件事。

## AI Coding 规范

修改前阅读相关 docs 与现有代码，明确影响范围并复用已有组件；修改后运行项目、检查相关页面并报告修改文件和测试结果。Prompt 应包含任务目标、上下文、相关文件、禁止修改内容、输入输出和验收标准。

使用 AI 编码工具时，先让它读仓库根目录的 [`AGENTS.md`](../AGENTS.md)，再读 [`HANDOVER.md`](HANDOVER.md)（环境、红线、任务清单与可直接粘贴的提示词模板）。

## 模块边界与合并规则

- 前端通过内部 API 访问 AI 服务，**密钥仅存在服务器环境变量**，不得进入浏览器或代码。
- 知识结构的变化必须经过用户确认才写入。
- 禁止未经负责人确认的大范围重构；合并前需确认数据模型、UI 规范和基本错误状态没有被破坏。
