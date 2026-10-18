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
| 0 | 基线与迁移保护 | 离线基线通过；提交待署名 |
| 1 | dsh 统一 Agent 运行时、元信息与权限 | 进行中 |
| 2 | Markdown 文档、frontmatter、路径与引用索引 | 待实施 |
| 3 | CM6 连续编辑、Live Preview、补全 | 待实施 |
| 4 | 固定 Ribbon、目录、右侧 Agent、搜索与白板 | 待实施 |
| 5 | 三类模型配置、发现与输入区选择 | 待实施 |
| 6 | Archive、恢复与归档内永久删除 | 待实施 |
| 7 | 属性折叠、只读 Schema、指南、图谱选项收敛 | 待实施 |
# 第一组验收记录

- Git 署名已在本仓库配置；基线提交 3117c7a。
- dsh 0.2.1-rc.2 真实子进程已通过离线双轮模型/工具集成测试（本地模拟模型，无付费调用）。
- 注入实际 provider/model/tool registry；policy 未激活时 JSON-RPC 服务不能启动。
- 原生终端/文件编辑工具禁用；工具桥只接受单次令牌和白名单，写操作仅产生 pending 提议。
- 修改：lib/agent/{runtime.ts,dsh-policy.mjs,loop.ts,manual.ts,runtime.test.ts}、Agent API/types、依赖、Next 打包配置。
- 待后续组解决：ACP 外部 Agent 设置与隔离、对话统一入口、打包后子进程追踪验证。未把这些记为已完成。

