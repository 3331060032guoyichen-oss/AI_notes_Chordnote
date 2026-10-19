<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Chordnote 和弦：Notes become chords，一条笔记是音符，连起来才是和弦" />
</p>

<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#为什么是和弦">为什么是和弦</a> ·
  <a href="docs/ROADMAP.md">路线图</a>
</p>

# Chordnote · 和弦

**Notes become chords. / 一条笔记是音符，连起来才是和弦。**

Chordnote 是一款面向大学生的生长式 AI 笔记软件。它把课堂笔记、题目和灵感逐步整理成可复用的知识，再把知识连接成便于回看的个人网络。

它解决的不是“替你写更多笔记”，而是让每次学习都留下下一次复习用得上的连接：**AI 负责提出结构，学生负责决定什么值得成为自己的知识。**

## 先看它如何工作

<p align="center">
  <img src="./assets/readme/workflow.svg" width="100%" alt="Chordnote 的 Raw、Draft、Review、Chord 四步知识整理闭环" />
</p>

当前 Demo 已经跑通这条主链路：

```text
Raw 原始记录 → 整理助手 Draft → 用户确认 → Knowledge 知识页 → Relation 关联 → Graph 知识网络
```

原始内容保留不被覆盖；AI 的整理结果先停留在 Draft，只有经过确认的内容才会进入知识网络。

**这条链路是有闸门的**：新建笔记只写「原始记录」—— 知识页只能由「整理助手提议 → 你确认」产生。所以「笔记」栏里不会凭空多出一页你没点头的东西。

## 为什么是“和弦”

我们借鉴了 LLM Wiki 的知识工作流、Obsidian 的 Live Preview 与双向链接，以及自由白板的空间组织方式，但把它们改造成适合大学生学习的产品机制：

<p align="center">
  <img src="./assets/readme/innovation.svg" width="100%" alt="Chordnote 将常见笔记工具的痛点转化为四项产品设计决定" />
</p>

- **AI 拓扑生长**：dsh 统一调度兼容 API、本地 Ollama 与 ACP 外部 Agent；Agent 提议概念与关联，学生确认后再建立连接。
- **零黑盒法则**：原始 Raw 永远保留；AI 只能生成 Draft，用户确认后才进入 Knowledge。
- **@ 上下文复读**：问答面板直接引用已有笔记，服务端重读真实内容后作答，避免反复复制粘贴。
- **LLM Wiki 规范**：把 Agent 的执行步骤写成可审阅的知识流程，让模型的行为有边界、有迹可循。

这也是 Chordnote 的边界：我们不把 AI 当作替你记忆的黑箱，而把它放在“提议”和“解释”的位置，把最终的知识所有权留给学习者。

## 已经可以体验什么

- **连续 Markdown 编辑**：一篇笔记只有一个连续文档；标题就是首个一级标题。Live Preview 在光标离开时隐藏语法标记，支持 `[[wikilink]]` 补全、标签、高亮、粗斜体与任务复选框。
- **未整理笔记**：新建内容会由服务端写入 `raw/inbox/`，停笔自动保存；它不是浏览器里的临时草稿。旧 Raw 路径和导入包继续兼容。
- **整理助手**：dsh 驱动多步工具循环，运行时注入 provider、模型、工具与权限；右侧输入框支持 `@` 引用笔记和切换模型。
- **提议与拍板**：AI 的每个写入意图都落成一条待确认提议 —— 你点确认才入库，点忽略就丢掉。改写正文的建议以 Diff 卡附在正文底部。
- **知识页**：确认后的内容进入 `wiki`；正文上方属性区默认折叠，编辑 `title / source / created / description / tags` 会直接回写同一份 frontmatter。
- **双向链接**：用户和 Agent 产出的链接共用一条 Markdown 解析管线。未解析链接可显式创建 Raw，入链与出链通过搜索或 Agent 查询。
- **知识网络**：`d3-force` 力学 + Canvas 自绘，可拖动、滚轮缩放、点节点出卡片、双击打开那一页；拖动即固定。
- **自由白板**：浅色点阵画布上双击创建便签，Shift 拖动自由涂画，可拖入或粘贴图片；选中对象后才显示归档与连线手柄，白板按版本保存到 PGlite。
- **模型与服务**：设置页分为本地模型、模型厂商、自定义模型；支持发现模型、连接测试、服务端密钥保存，以及通过 ACP 接入用户已安装并登录的外部 Agent。
- **统一归档**：Raw、Knowledge 和 Relation 的普通删除都进入 Archive，可恢复；只有在 Archive 内填写理由并确认依赖后才能永久清除。
- **知识包**：一键导出全部数据（JSON 全量快照，可再导入回来），或导出成 markdown + YAML frontmatter 的 zip —— 任何读 markdown 的工具都能打开，不依赖本应用。
- **三套阅读主题**：暗室星图 / 暖纸批注 / 实验工坊；界面声音开关收在设置里。
- **进入体验**：完整落地页；点击「进入编辑室」进入工作台，并记住这次选择。

## 快速开始

```bash
git clone https://github.com/3331060032guoyichen-oss/AI_notes_Chordnote.git
cd AI_notes_Chordnote
pnpm install
pnpm dev
```

打开 <http://localhost:3000>，从左侧「未整理笔记 → 新建笔记」开始。每点一次都会立刻建立一条本机持久化的 Raw；未改名时依次为「未命名1、未命名2…」，随后可直接在文档一级标题修改。左树顺序为 Raw、Wiki、未整理笔记、Schema、Readme，设置入口位于最左侧 Ribbon 底部。**零配置**：知识库就在本机 —— PGlite（编译成 WASM 的 PostgreSQL，跑在应用进程里），数据落在 `data/pglite`，首次启动自动建目录、补齐 `drizzle/` 里的迁移；不需要数据库服务，也不需要联网。

想要「AI 整理」和右侧 AI 问答，可在「设置 → 模型与服务」选择厂商并填写 API Key，也可以使用本地 Ollama、自定义兼容接口或 ACP 外部 Agent。环境变量仍可作为部署期覆盖，说明见 [`.env.example`](.env.example) 与 [`docs/DEV_WORKFLOW.md`](docs/DEV_WORKFLOW.md)。ACP 模式需要本机已有兼容的桥接程序，并由用户完成该程序自己的登录。

本地知识库的两条边界：同一份数据目录**同一时刻只能有一个进程写**（PGlite 是单写者，别一边跑 `pnpm dev` 一边让另一个进程连同一目录）；数据只在这台机器上，没有多设备与多云同步。**备份 = 拷走 `data/` 目录，或用设置里的「导出知识包」**；换数据目录用环境变量 `PGLITE_DATA_DIR`。

想直接看到有内容的界面：`pnpm seed:demo`（幂等写入一批演示笔记，见 [`AGENTS.md`](AGENTS.md)）。

### 桌面端（Windows）

桌面版把 Next.js 与本机 Node 运行时一起打包，安装后双击图标就能用，不需要另开浏览器或终端。

**直接安装**

1. 装好 Node.js 与 pnpm，并准备 Rust（stable）与 Visual Studio C++ 生成工具。
2. 在仓库根目录运行 `pnpm install`，再运行 `pnpm desktop:build`。
3. 安装包生成在 `src-tauri/target/release/bundle/nsis/`，文件名形如 `Chordnote_0.2.0_x64-setup.exe`。
4. 双击安装，然后从开始菜单启动 Chordnote。

首次启动时，应用会在本机 `127.0.0.1:3210` 拉起内置服务，并轮询 `/api/health`；30 秒内没通过就弹窗提示。**3210 端口被别的程序占用时无法启动**，先关掉占用者再试。Windows 10/11 一般已带 WebView2；缺失时安装程序会联网下载 bootstrapper。

**开发模式**

```bash
pnpm desktop:dev   # Tauri 开发窗 + Next.js dev server（127.0.0.1:3210）
```

**数据、配置与退出**

安装版的数据不在仓库的 `data/`，而在 `%LOCALAPPDATA%\Chordnote\`：知识库是 `db\`，模型配置是 `settings.json`，启动日志是 `logs\desktop.log`。网页版与桌面版的数据互不影响。

AI 密钥在应用内「设置 → 模型与服务」里填，保存在上面那个 `settings.json`；接口只返回是否已配置，不会把密钥原文发回浏览器。备份仍然是导出知识包，或直接拷走 `%LOCALAPPDATA%\Chordnote\db`。


## 当前边界与下一步

这是一个 **2026 校赛 Demo**。已经有真实代码的闭环优先于概念展示，当前边界是：

- OCR 转 Markdown、网页剪切、多设备同步仍未实现。
- ACP 已完成协议桥、受限工具边界与本地 fixture 验证；真实 Codex / Claude Code 等外部程序需要用户自己的兼容桥接命令与账号，仓库不携带这些凭据。
- **登录与多用户**：当前是演示期隐式单用户（`DEFAULT_OWNER_ID`），服务层的归属过滤已按用户写好，换实现即可。

完整的目标、现状和差距对照见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 技术栈与项目结构

Next.js 15（App Router） · React 19 · TypeScript · pnpm · CodeMirror 6 · dsh / ACP · 手写 CSS · Drizzle ORM + PGlite（本地嵌入式 PostgreSQL） · Three.js 0.186.0（首屏） · d3-force（图谱力学） · tsParticles（背景星尘） · Tauri 2（Windows 桌面宿主）

```text
app/          Next.js 页面与 API 路由（含 export / import / proposals / agent）
components/   连续 Markdown 编辑器、自由白板、工作区外壳、知识图谱、设置与界面音效
lib/          文档管线、服务层、dsh/ACP Agent 运行时、Provider 边界与知识包
types/        TypeScript 类型
seed/         演示数据（pnpm seed:demo）
scripts/      构建、桌面打包、回归与数据脚本
src-tauri/    Windows 桌面宿主（Tauri 2）
docs/         产品、数据、设计与开发文档
```

开发约定与分支说明见 [`AGENTS.md`](AGENTS.md) 和 [`docs/`](docs/)。

常用验证命令：

```bash
pnpm lint
pnpm test          # HTTP 回归
pnpm test:unit     # Provider / 配置离线单测
pnpm verify:db     # 内存库迁移、约束、外键与归属隔离
pnpm build
```

本轮文档编辑器、Agent、布局、归档与白板改造的逐项验收见 [`docs/reports/2026-10-notes-rebuild.md`](docs/reports/2026-10-notes-rebuild.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。


