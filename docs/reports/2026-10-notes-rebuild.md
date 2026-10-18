# 笔记产品改造验收

## 已确认的实施范围

以 dsh（DeepSeek Harness）作为统一多模型 Agent 调度层，覆盖兼容 API、本地 Ollama 与 ACP 外部 Agent。Schema 应用内只读、开发者编辑唯一源文件。其余按用户确认的八组计划执行。

保留 PGlite、用户数据、修订、提议、正式关系和 d3-force/Canvas 图谱。新增正文引用索引不能替换正式关系表。Markdown 与 frontmatter 是文档属性的权威来源；AI 只能提交提议。

## 0 · 基线（2026-10-18）

- Git 已连接 `3331060032guoyichen-oss/AI_notes_Chordnote`，基线 `c36137d`，分支 main。
- 实施前工作区仅有未跟踪的 Tauri 生成目录 `src-tauri/gen/`，不纳入本次提交。
- `pnpm test:unit`：22/22 通过。
- `pnpm verify:db`：6 条迁移、11 张表、外键/JSONB/归属隔离检查通过，使用内存库。
- 检测到 3210 端口存在运行进程；验证使用独立临时数据目录，不连接正在使用的数据库。
- Git 提交署名未配置，已询问用户；不猜测或冒用身份。

## 分组交付记录

每组在此记录实际改动、实际执行的验证和剩余冲突。尚未验证的功能不得标记为通过。

| 组 | 内容 | 状态 |
|---|---|---|
| 0 | 基线与迁移保护 | 已提交 3117c7a |
| 1 | dsh 统一 Agent 运行时、元信息与权限 | 已提交 db2c4d2；ACP 在后续提交补齐 |
| 2 | Markdown 文档、frontmatter、路径与引用索引 | 已提交 5b0c022 |
| 3 | CM6 连续编辑、Live Preview、补全 | 已提交 fbfcb1d；工作区接线在第 4 组 |
| 4 | 固定 Ribbon、目录、右侧 Agent、搜索与白板 | 已完成 |
| 5 | 三类模型配置、发现与输入区选择 | 已完成 |
| 6 | Archive、恢复与归档内永久删除 | 已完成 |
| 7 | 属性折叠、只读 Schema、指南、图谱选项收敛 | 已完成 |
# 第一组验收记录

- Git 署名已在本仓库配置；基线提交 3117c7a。
- dsh 0.2.1-rc.2 真实子进程已通过离线双轮模型/工具集成测试（本地模拟模型，无付费调用）。
- 注入实际 provider/model/tool registry；policy 未激活时 JSON-RPC 服务不能启动。
- 原生终端/文件编辑工具禁用；工具桥只接受单次令牌和白名单，写操作仅产生 pending 提议。
- 修改：lib/agent/{runtime.ts,dsh-policy.mjs,loop.ts,manual.ts,runtime.test.ts}、Agent API/types、依赖、Next 打包配置。
- 待后续组解决：ACP 外部 Agent 设置与隔离、对话统一入口、打包后子进程追踪验证。未把这些记为已完成。

# 第二组验收记录

- 追加 0006 迁移，为 Raw、Knowledge 和修订增加 Markdown/path；历史列与历史迁移保持兼容。
- 旧正文只在读取时转换；文档保存与 AI 提议应用共用服务层，修订保留完整文档。
- wikilink 以同一 Lezer 语法树动态派生出链/入链，不依赖标题子串匹配；未解析链接只能经用户操作创建 Raw。
- JSON 导出升级 v2 并继续接受 v1；Markdown 导出保留原始 frontmatter 与路径。
- 验证：7 个迁移/11 表检查通过，4 个 Markdown 单测通过，原 75 项 HTTP 回归通过；新增文档端到端断言正在运行。
- 修改：lib/documents、lib/services/{notes,sources,documents,bundle}、Raw/Knowledge API 与 types、drizzle/0006、scripts/regression.mjs。
- 待解决：同名内容导入仍沿用保留已有策略，需要补齐 v2 路径判重与来源映射；不能把跳过项当作已恢复。


## 第三组验收记录

- 修改：components/markdown-editor.tsx、components/document-session.tsx。
- CM6 单文档、共享 Lezer 语法、选区 reveal、wikilink 补全与链接装饰重建、任务框、标签/高亮/强调均已接入。
- 保存有乐观版本校验，未保存编辑保留本机恢复副本；Wiki 属性默认折叠并直接修改 YAML。
- 浏览器实测：连续输入自动保存；移出链接后显示虚线链接；点击未解析链接创建 Raw 并打开；粗体/高亮/任务框呈现正常。
- TypeScript 检查通过。新编辑器工作区入口与 CSS 在下一组一起提交。
- 属性回写、Agent 提议写入 wikilink 与打包运行时在后续组已复验。

## 第四组验收记录

- `AppShell` 重构为固定 56px Ribbon、可折叠左树、中央单文档工作区和可折叠右侧 Agent 对话；CSS grid 让两侧展开时压缩中央区。
- Ribbon 顺序为 logo、查找、图谱、白板、Agent；左树为 `raw`、`wilki`、`Schema`、`readme`，设置入口在底部。知识页右侧出链/入链面板已移除。
- 新增命令式文档搜索、白板工作区和版本冲突保护；`/api/bootstrap` 合并工作区首屏读取，避免 PGlite 冷启动时的并发路由竞争。
- 浏览器验收：在 861px 时中央区 325px，在 760px 时中央区 274px；两侧均未覆盖正文。白板写入显示“已保存”。
- 记录：`components/{shell,workspace-tree,document-search,canvas-workspace}.tsx`、`app/page.tsx`、`app/globals.css`、`/api/bootstrap`、`/api/canvas`、`lib/services/{canvases,graph}.ts`、迁移 0007。

## 第五组验收记录

- 模型设置拆分为本地模型、模型厂商和自定义模型；厂商/自定义可发现模型，模型选择移到右侧 Agent 输入区，已删除 `system` 设置。
- dsh 新增 ACP 适配器。外部 Agent 通过 ACP 运行，子进程移除所有 `CHORDNOTE_*` 环境变量，仅可通过一次性令牌的 MCP 桥使用白名单工具。
- 定向运行时测试通过：本地 dsh 子进程完成多轮模型/工具调用；本地 ACP fixture 完成相同 MCP 边界测试。没有使用用户密钥或外部订阅。
- 剩余边界：真实 Codex/Claude Code ACP 程序需要使用者在设置中配置并完成自己的登录；本次未对第三方账号发起调用。

## 第六组验收记录

- 所有普通删除仍是归档。Archive 支持 Raw / Knowledge 的恢复与永久清除；清除只接受已归档对象，要求理由和依赖确认，并写审计记录。
- 永久清除保留 Raw 与 Knowledge 的外键/修订保护：有依赖时先返回冲突，只有用户确认后才清理允许清理的历史行。
- HTTP 回归覆盖归档、未确认永久删除被拒绝、确认后清除成功。

## 第七组验收记录

- Wiki 笔记顶部增加默认折叠的 frontmatter 属性区，读取并回写 `title`、`source`、`created`、`description`、`tags`，没有额外属性存储。
- `/api/agent/schema` 和 Schema 视图只读取 `lib/agent/manual.ts`；Agent runtime 加载同一份字符串。应用内不能编辑。
- 图谱移除孤立节点、方向箭头和重新布局选项；编辑器移除块状输入框，首行 H1 是标题。
- 回归新增“待确认提议应用后保留 `[[...]]` 并立即重建引用”断言。编辑器和设置的浏览器验收截图见 `ui-editor-proof.png`、`ui-settings-proof.png`。

## 最终验证与冲突

- `pnpm lint`、`pnpm exec tsc --noEmit`、`pnpm test:unit`（24 项）、Markdown/dsh 定向测试（7 项）、`pnpm verify:db`（8 条迁移/12 张表）均通过。
- `pnpm test`：83 项 HTTP 断言通过；使用临时 PGlite 数据目录。
- `pnpm build` 通过；`pnpm desktop:verify:runtime` 在临时数据目录通过健康检查和受控关闭。
- Windows standalone 曾因完整 dsh/ACP 包树 glob 追踪而长时间停滞，已收窄为本地运行时插件；生产构建和桌面 runtime 已随后通过。
