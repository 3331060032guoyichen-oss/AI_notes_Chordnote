# 内置 Agent 分类、上下文与工作流核查

核查日期：2026-10-22。项目根目录：`C:/Users/郭泽辰/Desktop/awesome_notes_agent_Chordnote`。基于当前工作区代码和 localhost:3000 的只读接口；未调用付费模型，未修改现有笔记。

## Raw 分类

已经有分类机制。`lib/agent/manual.ts` 的 `draft_knowledge` 要求模型同时输出 rawCategory 和 wikiCategory；`lib/ai/tasks.ts` 校验类别；`lib/services/notes.ts` 对 AI 来源入库再次校验，收录时通过 attachSourcesToNoteInTx → classifySourceInTx 归类来源。

Raw 类别是 articles、papers、books、media、data。人工或旧调用未提供分类时仍可回退 articles；路径无法识别时 `lib/documents/structure.ts` 也回退 articles。类别合法不等于语义分类正确，当前没有基于载体的独立分类校验器。

目前运行库的 6 篇来源均在 articles；其中 5 篇课程演示笔记属于种子数据，不能据此证明 agent 每次分类失败。当前单一来源的 LLM Wiki 整理页已放入 `wilki/sources/`。要验证论文是否误归类，仍需用明确论文来源走一轮真实模型整理。

## Agent 实际读取哪些上下文

**内置 Agent 不读取仓库 AGENTS.md，也没有独立 agent.md。** 根目录 AGENTS.md 是给开发本应用的编码助手看的。运行时手册来自编译进服务端的 `lib/agent/manual.ts` 中 AGENT_INSTRUCTION；工具定义也来自同文件。

下列源码路径均相对上述项目根目录：

| 内容 | 来源或加载代码 | 读取方式 |
| --- | --- | --- |
| 系统指令、权限与工具定义 | `lib/agent/manual.ts` | 宿主装配进每轮请求 |
| 目录规则 | `lib/documents/structure.ts` | 由手册引用 |
| 用户可编辑 Schema | `lib/services/agent-schema.ts` | 优先读取 `dirname(defaultSettingsPath())/Schema.md` |
| Schema 默认模板 | `lib/agent/Schema.md` | 仅在用户配置文件不存在时回退 |
| 当前笔记 | `lib/agent/loop.ts` 的 loadContext | 按 contextType/contextId 重新从服务层读取；草稿上下文例外来自请求 |
| 全库目录、相关片段 | `lib/services/agent-context.ts`、`lib/agent/context.ts` | notes/raw_notes 的用户归属过滤查询；目录与最多 5 个相关片段 |
| 最近日志与提议状态 | `lib/services/agent-context.ts` | audit_log 最近 5 条指定类型事件，以及最多 10 个提议 |
| 同一会话历史 | `lib/agent/sessions.ts` | 服务进程内存，默认保留最近 10 轮，受字节预算限制；无历史 Markdown 文件 |
| 实际模型和工具权限 | `lib/agent/runtime.ts`、`lib/agent/dsh-policy.mjs` | runtime 区块，程序生成 |

默认配置路径为 `C:/Users/郭泽辰/Desktop/awesome_notes_agent_Chordnote/data/settings.json`，对应用户 Schema 路径为 `C:/Users/郭泽辰/Desktop/awesome_notes_agent_Chordnote/data/Schema.md`。若设置 CHORDNOTE_SETTINGS_FILE，则 Schema 跟随该设置文件的父目录；桌面安装包通常使用 `%LOCALAPPDATA%/Chordnote/db/Schema.md`，取决于宿主传入配置。不可把源码模板路径当作所有运行实例的实际配置路径。

默认模板完整路径为 `C:/Users/郭泽辰/Desktop/awesome_notes_agent_Chordnote/lib/agent/Schema.md`；手册完整路径为 `C:/Users/郭泽辰/Desktop/awesome_notes_agent_Chordnote/lib/agent/manual.ts`。

数据库文档的 `raw/...md`、`wilki/...md` 当前是逻辑路径，不保证存在对应物理文件。运行数据默认 `data/pglite`，桌面安装包默认 `%LOCALAPPDATA%/Chordnote/db`。内置 agent 不直接打开这些数据库文件，通过受控工具读取。dsh 每轮使用系统临时目录下 `chordnote-dsh-*/workspace`，工具 fs/shell/database 被关闭，不会进入本仓库自行搜集 AGENTS.md。

上下文不是无限全文：当前材料上限约 8000 UTF-8 字节，Schema 12000 字节，目录 4000 字节，命中片段合计 6000 字节；相关页需继续调用分页读取工具。loadContext 对知识页初始仅拼接标题、摘要、content；完整 Markdown/YAML 应通过 read_note 获取，Raw 的 read_raw 当前使用 raw.text。这与“启动时总是得到真实路径、完整正文和全部 YAML”存在差距。

## 与用户六步流程逐项比较

| 步骤 | 当前实现 |
| --- | --- |
| 01 读取新笔记 | 服务端重读，但初始材料可截断；不是固定读取完整 Markdown/YAML 的强制阶段。路径在目录或读取工具结果中提供。 |
| 02 搜索已有知识 | 有关键词搜索与分页全文读取；提示词要求通读，但没有完整覆盖同义词、MOC、索引优先阅读的程序保证。 |
| 03 判断关系 | 模型可以说明关系，但正式关系只有 related；补充、重复、反例、因果、应用等没有独立类型或固定判断结果。 |
| 04 整理当前笔记 | 支持生成知识页草稿、更新提议、双链、分类。Raw 正文保持原样，不能按这一步直接重写原文。 |
| 05 判断更新主题索引 | 可将知识页分入 index/overview，也可提议更新已有页；没有专门 MOC 决策流程。当前指令明确要求内容索引由系统动态提供，不另建 index 文件。 |
| 06 验证并报告 | 有结构、权限、版本、审计与引用投影；没有强制统一执行断链、语义重复、元数据及修改结果复查的收尾阶段。 |

结论：目前是受提示词指导的自由工具循环，不是强制执行这六个阶段的工作流。`index`/`overview` 是可用分类，不会因为目录存在就自动产页。`log` 实际对应 audit_log 数据库表，Schema 明确不建立 log.md。若希望实体 MOC/overview 被持续维护，需要单独修改产品约定与实现，不能只加几句提示词就宣称已完成。

## 属性重复与本次修改

运行库 6 篇知识页均只有一组文首 YAML（两个分隔符）。界面上看似两处属性时，它们不是两份独立数据：第一处 `.document-properties` 是由 `readMarkdown()` 从文首 YAML 投影出的可视化属性面板，第二处是同一组 YAML 的 Markdown 原始表示。删除原始 YAML 会让可视化面板失去数据并一起消失，因此不能通过删除第二处文本来修复显示重复。正确处理是保留 YAML，并在正文编辑视图中隐藏其原始表示；当前 MarkdownEditor 已用 decoration 隐藏文首 YAML。当前实际返回的 Schema 仅有一处 Frontmatter 模板，尚不能证实 Schema 本身重复生成了两组属性。

已将 `components/document-session.tsx` 的属性面板默认状态由折叠改为展开。没有删除底层 YAML，也没有迁移或改写现有笔记。已在默认 Schema 明确规定只保留一组文首属性、草稿正文以标题开始、不在正文中另抄属性清单。该约束用于防止模型真正生成第二组属性；自定义 Schema 优先于默认模板，本次未覆盖用户自定义配置。
