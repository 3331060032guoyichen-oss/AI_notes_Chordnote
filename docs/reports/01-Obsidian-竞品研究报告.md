# 第一部分：Obsidian 竞品研究报告

> 交付物 1 / 共 4 份。本阶段只研究与规划，未修改任何项目代码。
> 证据标注：**【实测】**= 本机 Obsidian 1.14.4 安装包静态分析；**【官方】**= Obsidian 官方帮助库（obsidianmd/obsidian-help, master）；**【观察】**= 依据官方引导流程还原的真实操作序列；**【未验证】**= 本次未取得证据，需后续核查；**【推断】**= 我的分析判断，不是事实。

---

## 0. 研究工具核查：REA 到底能做什么（先说结论）

本次研究的口径是：先确认研究工具的真实能力，再开始研究。这是核查结果。

### 0.1 REA 插件的真实可用能力

REA MCP 服务已连接并在本机正常应答，不是"装上了但没通"的状态。

| 能力 | 状态 | 说明 |
|---|---|---|
| 打开/识别二进制与包（PE、ASAR、ZIP、DMG、APK…） | ✅ 可用 | 实测成功打开本机 `where.exe`，返回 PE / x86-64 / SHA-256 |
| 解包归档、清点成员 | ✅ 可用 | 本次用它解开了 Obsidian 的 `obsidian-1.14.4.asar`（397 个条目） |
| **JavaScript / ASAR 应用静态分析** | ✅ 可用 | 本次研究的核心工具，不需要任何额外引擎 |
| .NET / PE 托管元数据、签名、P/Invoke 边界 | ✅ 可用 | 本次未用上 |
| 浏览器 / Electron / Node 运行时观察（需调试端口） | ✅ 可用 | 需要目标以 `--remote-debugging-port` 启动 |
| HAR / mitmproxy 抓包离线解析 | ✅ 可用 | 本次未用上 |
| 安卓 APK 反编译 | ⚠️ 条件可用 | 需要自行提供 JADX 与 JDK，本机缺失 |
| **原生反汇编 / 反编译（函数、伪代码、交叉引用）** | ❌ 不可用 | Ghidra 未配置（`GHIDRA_INSTALL_DIR` 未设，且本机**没有 Java**）；Hopper **仅支持 macOS**；IDA 未配置 |
| macOS 专属能力（Mach-O、代码签名、Asset Catalog、原生 UI 截图） | ❌ 不可用 | 我们是 Windows，工具会自动禁用 |
| 原生 UI 自动操作 / 截图（`capture_native_ui_scenario`） | ❌ 不可用 | 仅 macOS |

**结论：REA 能读"包"，不能读"界面"。** 它无法自己打开 Obsidian 点鼠标、也无法截取 Obsidian 的界面截图。所以本次研究**没有、也不可能有界面截图证据** —— 不拿推断当证据。

### 0.2 为什么这次仍然拿到了很硬的证据

Obsidian 是 Electron 应用，本机安装了 **Obsidian 1.14.4**，其全部前端资源以明文形式存在于一个 ASAR 包里：

```
C:\Users\guozechen\AppData\Roaming\obsidian\obsidian-1.14.4.asar
sha256 146ef8470d8cbb4a6db209bdc19bf2bad13350444186c0fd93c31087b142b92f
```

REA 对它做了静态应用图分析，得到：

- 解析 38 个文件 / 32 个 JS 文件 / 431 万个 AST 节点 / 1464 条静态发现
- Electron 关系：2 个 BrowserWindow、124 个 IPC 操作、47 个字面量 IPC 通道
- 证据 ID：`ev_f20e7429faa447e6552e97624b7193430da88b31552378d79c403c04a0beb68e`（分析）、`ev_25dd573fe48b937e4056c4b5cec76651ec6f50d349219e04aea5ba9a5df80db3`（视图投影）、`ev_17df4840a8aed6755e900e056b5f69f982204615c5c5dc1fa3aacf254a315c1f`（解包清单）

因此本次研究有两条互相独立的证据线：

1. **厂商自己发布的界面语言与样式（实测）** —— 包括完整的 UI 字符串目录（2595 条中文、全部核心插件与命令）和全部设计令牌数值。这是"产品实际长什么样"的最直接证据，比截图更精确（可读到 px 值）。
2. **官方文档库（官方）** —— 77 篇官方帮助页面，取自 `github.com/obsidianmd/obsidian-help` 的 `en/` 目录。

网络情况说明：本机 shell 的 TLS 出网被沙箱拦截（`SEC_E_NO_CREDENTIALS`），但 Node 的 fetch 正常，因此官方文档是通过 Node 从 GitHub 原始文件取得的，来源可核对。

---

## 1. Obsidian 的真实功能边界

### 1.1 核心插件清单（实测，来自 1.14.4 的语言目录）

这是从软件包里直接读出来的核心插件 ID 与官方文案，**不是回忆、不是官网宣传页**：

| 插件 ID | 官方名称 | 官方描述（原文） |
|---|---|---|
| fileExplorer | Files | Browse the files and folders in your vault. |
| search | Search | Search for a keyword in all the notes. |
| quickSwitcher | Quick switcher | Jump to other files with your keyboard. |
| graphView | Graph view | Visualize the relationships between your notes. |
| backlinks | Backlinks | Show links from other files to the current file. Backlinks can be shown in a separate view or at the bottom of the note. |
| outgoingLinks | Outgoing links | Show outgoing links and detect unlinked mentions of other notes in the current note. |
| tagPane | Tags view | Show a list of all tags and their number of occurrences. |
| footnotesPane | Footnotes view | Show a list of footnotes from the current note. |
| properties | Properties view | Show the metadata for your files in the sidebar. |
| pagePreview | Page preview | Hover an internal link to preview its content. |
| bookmarks | Bookmarks | Save shortcuts to files, searches, headings, and graphs. |
| commandPalette | Command palette | Use Cmd/Ctrl+P and begin typing to invoke a command. |
| outline | Outline | Show the table of contents for the current note. |
| templates | Templates | Insert template content from a folder of template files. |
| dailyNotes | Daily notes | Create or open today's daily note. |
| uniqueNoteCreator | Unique note creator | Create notes with unique timestamp prefixes, for workflows like zettelkasten or slip box. |
| randomNote | Random note | Open a random note to rediscover or review. |
| wordCount | Word count | Show word count in the status bar. |
| noteComposer | Note composer | Merge two notes or split one into two. |
| fileRecovery | File recovery | Restore recent snapshots to recover from accidental data loss. |
| canvas | Canvas | Arrange and connect notes on an infinite canvas. |
| bases | Bases | Create custom views that let you edit, sort, and filter files using their properties. |
| webViewer | Web viewer | Open external links to web pages inside Obsidian. |
| workspaces | Workspaces | Save and load workspace layouts. |
| slides | Slides | Create a presentation by using "---" to separate slides. |
| audioRecorder | Audio recorder | Record audio notes and save them as attachments. |
| slashCommand | Slash commands | Trigger commands in the editor by using the forward slash key. |
| editorStatus | Show editing mode in status bar | Show the editing mode toggle in the status bar. |
| markdownFormatImporter | Format converter | （批量转换 frontmatter 格式） |
| openWithDefaultApp | Open in default app | Add a button to open the current file in its default app. |
| mermaid / footnotes / translucency | （图表、脚注、半透明窗口） | 以内置能力形式提供 |
| sync / publish | Sync / Publish | 官方付费服务（同步、发布） |
| customCss | Custom CSS | Read and apply "obsidian.css" in the vault folder. |

共 36 条。**重要观察**：Obsidian 的"插件"不是第三方扩展的意思，而是**它把自己的基础功能全部做成了可开关的模块**——反向链接、标签、大纲、图谱、每日笔记、模板都是插件。

**【推断】** 对我们最有价值的不是"插件化"这个形式（我们不需要让用户关掉反向链接），而是它揭示的功能清单：Obsidian 认为一个完整笔记系统需要这些模块。这份清单可以直接当作我们的功能完备性检查表。

### 1.2 基础能力 vs 进阶知识管理能力

这是研究问题 A 的最后一问，本节的分层（【推断】，依据是官方把哪些功能默认开启、哪些需要额外配置）：

| 层级 | 能力 | Obsidian 的做法 |
|---|---|---|
| **基础（没有就不算笔记软件）** | 创建/编辑/保存笔记 | Markdown 文件，自动保存 |
| | 找到一篇笔记 | 文件树（Files）+ 快速切换器（模糊匹配）|
| | 在笔记内找内容 | 编辑器内查找/替换 |
| | 跨笔记找内容 | 全文搜索（支持操作符与正则）|
| | 组织笔记 | 文件夹 + 标签 |
| | 建立笔记间关系 | `[[内部链接]]`（一等公民）|
| | 回到刚才看的内容 | 标签页、最近使用、书签 |
| **进阶（知识管理才需要）** | 反向链接 | Backlinks 面板（含"未链接提及"）|
| | 出链与未链接提及 | Outgoing links 面板 |
| | 关系可视化 | 全局图谱 + 局部图谱（带深度）|
| | 结构化元数据 | Properties（7 种类型 + 查询语法）|
| | 主题索引 / MOC | 官方无专门功能，靠链接 + 标签 + Bases 查询组合实现 |
| | 时间维度 | Daily notes（按日期自动建页）|
| | 复用与模板 | Templates、Unique note creator |
| | 空间化思考 | Canvas |
| | 结构化查询视图 | Bases（按属性筛选/排序/分组）|

### 1.3 四种组织手段各解决什么问题（研究问题 A 第三问）

**【官方 + 推断】** 这是本节最值得看的一张表。很多人把"文件夹 vs 标签 vs 链接"当成风格偏好，其实它们解决的是**四类不同的问题**，缺一个就会出现管理死角：

| 手段 | 回答的问题 | 归属性质 | 典型场景 |
|---|---|---|---|
| **文件夹** | 这条内容**放在哪** | 唯一归属（排他） | 来源、学期、项目——你知道它只能属于一个地方 |
| **标签** | 这条内容**是什么类别** | 多重归属（横切） | 横跨多个文件夹的主题：`#待复习` `#论文` `#解题方法` |
| **链接 / 反向链接** | 这条内容**和什么有关，为什么** | 有向、可带理由的断言 | "惯性定律"支撑"牛顿三定律"——关系本身有语义 |
| **搜索** | 我**现在要找什么** | 无归属，临时查询 | 一次性检索，用完即走 |

关键点：**标签只能表达"同类"，链接才能表达"关系"。** 两者不可互相替代。而搜索如果只能一次性输入，就无法沉淀成"视图"——Obsidian 的解法是让搜索可嵌入笔记（`query` 代码块）并可收藏为书签。

---

## 2. 交互逻辑：用户实际是怎么用的

### 2.1 四步走的标准路径（官方引导流程，可直接照抄的教学结构）

**【官方】** `obsidian-help/en/Getting started/Link notes.md` 里官方给新手的引导就是一条完整操作链，顺序很讲究：

1. **建两篇笔记** → 2. **在句子里打 `[[`**，输入"three"，回车建立链接 → 3. **点击链接时按住 Ctrl** 跳转 → 4. **主动链接一个还不存在的笔记**（文字显示为更暗的颜色，表示目标尚未创建）→ 5. **打开"牛顿"笔记，在右侧栏点 Backlinks 标签**，在 Linked mentions 里点回"三定律" → 6. **在笔记右上角 `…` → Open linked view → Open local graph**，在图上点节点跳转。

**【推断】** 这 6 步的顺序本身就是设计说明：先让用户**创造连接**，再让用户**从反方向被连接找到**，最后才用**可视化**俯瞰。它没有一上来就展示图谱——因为图谱在笔记少的时候毫无意义。

### 2.2 链接的四种粒度

**【官方】** `Internal links.md`：

| 粒度 | 语法 | 解决什么问题 |
|---|---|---|
| 笔记 | `[[笔记名]]` / `[文字](路径.md)` | 基础引用 |
| 标题（锚点） | `[[笔记#标题]]`，跨库搜标题用 `[[## 关键词]]` | 指到具体章节，避免"链接太粗" |
| 块 | `[[笔记#^37066d]]`，可自定义可读标识 `^引用原文` | 指到**一个段落/列表项**——精确到句子 |
| 别名 | `[[人工智能|AI]]` | 同一处想换个说法显示 |

**机制设计（很值得学）**：
- 链接**可以指向不存在的笔记**。点击时会按链接路径创建它。这意味着"先建立关系，内容以后再补"是被允许的。
- 改名文件时**自动更新全库内部链接**（`Settings → Files and links → Automatically update internal links`）。这是纯文件架构下的必需品，我们的数据库架构天然不会遇到这个问题——**这是我们相对 Obsidian 的结构性优势，不必自找麻烦**。

### 2.3 "未链接提及"（Unlinked mentions）——本次研究最重要的发现

**【官方】** Backlinks 与 Outgoing links 面板都有两类分区：

- **Linked mentions**：已经存在的、指向当前笔记的链接。
- **Unlinked mentions**：**别处出现了当前笔记的名字（或别名），但还没有建立链接。**面板直接把这段文字列出来，点一下就变成正式链接。

官方原文（Backlinks）：`Unlinked mentions are backlinks to any unlinked occurrence of the name of the active note.`
官方原文（Outgoing links）：`Unlinked mentions lists any text in the active note that matches the name or alias of another note in your vault. Unlinked mentions helps you discover links you aren't aware of yet.`

**【推断】这是传统笔记软件里"AI 最能增值"的位置，也是我们差距分析里最关键的一条。**

原因：这是一个**纯字符串匹配**的功能——Obsidian 只能靠"名字完全出现"来发现潜在关联，因此它既有用又笨拙（同义词、近义表达、跨语言表达全都发现不了）。而"判断两段文字在讲同一个概念"恰恰是语言模型最擅长的事。我们不需要"重做反向链接"，我们需要的是**把 Obsidian 这个朴素版本升级成语义版本**：AI 提出"这段正文可能在讲 XX，要不要建立链接"的**提议**，用户确认后写入——这和你既有的"AI 只提议、用户确认"产品原则是同一个形状。

### 2.4 别名（Alias）：解决"同一概念的多种叫法"

**【官方】** `Aliases.md`：别名写在笔记的 `aliases` 属性里（YAML 列表）。作用有两个——

1. 链接建议里会出现别名，链接时自动写成 `[[Artificial Intelligence|AI]]` 这种兼容格式；
2. **反向链接的"未链接提及"也能匹配别名**（官方原话：`By using Backlinks, you can find unlinked mentions of aliases.`）。

**【推断】** 对照项目规划里的 `Concept` 节点（`DATA_MODEL.md` 提到"Concept 可拥有别名，用于匹配已有概念"）——**别名不是锦上添花，它是概念合并的基础设施**。没有别名，同一概念的"熵增定律/热力学第二定律/entropy increase"会变成三个节点，知识库必然碎片化。这一条直接影响我们的数据模型设计。

### 2.5 工作区与面板的交互逻辑

**【官方 + 实测】**

| 设计 | 规则（官方原文要点） | 它解决的用户问题 |
|---|---|---|
| Ribbon（左侧窄条，实测 **44px** 宽） | 左栏关闭时**依然可见** | 主操作永远可达，不被折叠动作埋掉 |
| 左右侧边栏 | 存放插件产生的**面板标签**（文件树、反向链接、出链、大纲、标签、属性视图） | 把"常驻工具"与"正在读的文档"分开 |
| 中心区标签组 | 可拖拽排序、可拆分（Split right / Split down）、可拖到新窗口、可 **Stack** 叠放 | 同时处理多篇材料的比较阅读 |
| **Pin（固定）** | 固定后的"面板"**不跟随笔记切换**；固定的"笔记"保持不动，新笔记另开标签 | 一个人需要"钉住一个索引页边写边看"时不被冲掉 |
| **Linked view（联动视图）** | 反向链接 / 大纲 / 局部图谱可以作为"从属视图"绑到某篇笔记，**跟随该笔记变化** | 这是最值得学的一条：相关面板不是全局聊天窗，而是**当前笔记的上下文窗口** |
| 状态栏（右下角） | 显示当前文件/库的状态，由插件各自添加条目，有的可点有的只读 | 低干扰的常驻信息（字数、同步状态） |
| 命令面板 | `Ctrl/Cmd+P`，**模糊匹配**（官方举例：输入 `scf` 能找到 Save current file），1.8.3 起**最近使用置顶**，且可**固定常用命令** | 功能变多之后，菜单不再是入口，可搜索的命令才是入口 |
| 快速切换器 | `Ctrl/Cmd+O`，按名称**或别名**搜索；**无匹配时回车即创建**；`Shift+Enter` 强制用原名创建 | "我想到一个东西但还没写"时，创建与跳转合为一步 |

**【实测】** 命令面板在实际软件里的名字与文案确实存在（语言目录中 `commands` 段共 103 条命令条目，含 `saveFile`、`followCursorLink`、`splitRight`、`toggleStackedTabs`、`toggleReadableLineLength`、`navigateBack`、`openCursorLinkToInNewTab` 等）。

### 2.6 编辑与阅读：三态而不是两态

**【官方】** Obsidian 有三种呈现：**Source mode**（源码）、**Live Preview**（所见即所得的行内渲染，光标所在行显形）、**Reading view**（纯阅读）。切换入口在笔记右上角 `…` 菜单和状态栏。

**【推断】** 三态是"Markdown 的诚实性"与"阅读舒适"之间的折中。对我们是重要提示：**不要一上来做行内所见即所得编辑器**（成本极高），先做"编辑态 / 阅读态"两态切换，就能拿到 80% 的收益。

---

## 3. 设计依据：每个设计解决什么问题

### 3.1 整体布局的因果链

**【官方】** 官方对工作区的定义（`User interface/Workspace.md`）：Ribbon（左，纵向）+ 左右侧边栏（可折叠）+ 中心标签组（可纵横拆分）+ 状态栏（右下）。

**【推断】** 这套布局的内在逻辑是三层关注度：

1. **最外层（Ribbon）**：全局动作，永远在，最窄（44px）；
2. **中间层（侧边栏面板）**：与当前内容相关的工具，可折叠，宽度可变；
3. **核心层（中心标签组）**：内容本体，占最大面积，可以继续分割成多个并列内容。

用户问题对应关系：**"我随时能触达工具" ↔ 窄条常驻**；**"我不想被工具挤占阅读空间" ↔ 可折叠侧栏**；**"我要同时看两份材料" ↔ 标签组可拆分**；**"我不想丢位置" ↔ 标签 + 恢复上次布局（Workspaces）**。

### 3.2 排版数值（实测，可直接量化的部分）

以下是 Obsidian 1.14.4 分发的 `app.css` 中 `body` 作用域的真实设计令牌（【实测】）：

| 项目 | 变量 | 值 |
|---|---|---|
| 正文字号 | `--font-text-size` | **16px** |
| 正文行高 | `--line-height-normal` | **1.5** |
| 紧凑行高 | `--line-height-tight` | 1.3 |
| 段落间距 | `--p-spacing` | **1rem** |
| **可读行宽上限** | `--file-line-width` | **700px** |
| 笔记页内边距 | `--file-margins-x/-y` | 32px（= `--size-4-8`）|
| 标题阶梯 | `--h1..h6-size` | **1.618 / 1.462 / 1.318 / 1.188 / 1.076 / 1em** |
| 标题行高 | `--h1-line-height` / `--h2-…` | 1.2 |
| 界面字号 | `--font-ui-smaller/small/medium/large` | 12 / 13 / 15 / 20px |
| 导航项字号 | `--nav-item-size` | 13px（= `--font-ui-small`）|
| 图标尺寸 | `--icon-s/-m/-l/-xl` | 16 / 16 / 18 / 32px |
| 圆角 | `--radius-s/-m/-l/-xl` | **4 / 8 / 12 / 24px** |
| 间距标度 | `--size-4-1 … --size-4-18` | **4 / 8 / 12 / 16 / 20 / 24 / 32 / 36 / 40 / 48 / 64 / 72px** |
| 侧栏功能条宽 | `--ribbon-width` | 44px |
| 标签宽度 | `--tab-width` / `--tab-max-width` | 200px / 320px |
| 顶栏高度 | `--header-height` | 40px |

**【推断】** 三点可迁移的结论：

1. 标题阶梯用的是**近似黄金比**（1.618）而不是等比 1.25。视觉上标题层级差距明显、正文不喧宾夺主。
2. **700px 行宽 + 16px 正文 + 1.5 行高 + 1rem 段距**是被大规模验证过的长文阅读组合。
3. 间距全部是 4 的倍数，命名直接是 `size-4-N`（4×N）。这让"随手写一个 padding"变得不可能不整齐。

### 3.3 视觉克制

**【实测】** Obsidian 的主题变量集中在 `body` 作用域（899 条）、`.theme-light`（46 条覆盖）、`.theme-dark`（61 条覆盖）。颜色语义分为 `--color-base-*`（中性阶）、`--color-accent-*`、`--background-primary/secondary`、`--text-normal/muted/faint`、`--interactive-*` 等族，另有 `--color-red/green/blue/purple/orange/yellow/cyan/pink` 供状态与分组使用。

**【推断】** 它没有渐变、没有发光、没有玻璃拟态。列表项的悬停/选中用的是**背景变化**（`--nav-item-background-hover` / `-active` 都指向 `--background-modifier-hover`），不是描边或位移。

**这一点很重要：你们项目 `docs/DESIGN_SYSTEM.md` 定的"去 AI 味、安静克制"方向，和成熟产品实际采取的方向是一致的。也就是说视觉方向不用改，缺口在功能与排版精度上。**

### 3.4 关系可视化：为什么要"局部图谱 + 参数可调"

**【官方】** `Graph view.md`：

- 节点大小 **∝ 被引用次数**（`The more nodes that reference a given node, the bigger it gets`）。
- 提供 Filters（搜索词过滤、标签开关、附件、仅存在的文件、孤立点）、Groups（按查询词着色分组）、Display（箭头/文字淡出阈值/节点大小/连线粗细/动画）、Forces（中心力、斥力、连线力、连线长度）四组参数。
- **Local graph** 显示与当前笔记相连的网络，并且**可调深度**（每层显示上一层的邻居）。
- 有时间轴回放：按创建时间逐步显示节点与附件。

**【推断】** 可调参数不是"可玩性"，而是**规模应对**：笔记少时默认参数好看，笔记多了必然变成毛线团，必须让用户能筛选、能聚焦、能按主题着色。对我们的直接启示：**图谱的第一版应该是"局部图谱"（当前知识页的邻居，限制深度 1–2），而不是全库力导向图。**局部图谱永远可读，且实现成本低。

### 3.5 搜索不只是搜索框

**【官方】** `Plugins/Search.md` 显示搜索是一套**查询语言**：`path:` `file:` `tag:` `line:` `section:` `block:` `content:` `task:` `[属性:值]`，支持 `OR`、括号分组、引号精确匹配、`/正则/`、`null` 判空；结果可排序（文件名/修改时间/创建时间，各支持正倒序）、可折叠上下文、可"显示更多上下文"、**可复制结果**，并且能**嵌入到笔记里**（` ```query ` 代码块）。

**【推断】** 这解释了 1.3 节表格里"搜索 = 临时查询"的另一半：**当查询可保存、可嵌入，搜索就升级成了视图**。Bases 插件把这个思路推向极致（按属性做自定义视图）。对我们：AI Notes 的检索不该只有一个输入框，应当允许"把一次检索变成常驻入口"（例如标签页、书签），否则用户每次都要重新描述需求。

### 3.6 元数据（Properties）

**【官方】** `Editing and formatting/Properties.md`：

- 7 种类型：Text / List / Number / Checkbox / Date / Date & time / Tags。
- **类型一经分配给某个属性名，全库同名属性都用同一类型**（`Once a property type is assigned to a property name, all properties with that name across your vault will use the same type.`）。
- 三个默认属性：`tags`、`aliases`、`cssclasses`。
- 显示模式三档：Visible / Hidden / Source。
- 明确不支持：嵌套属性、批量编辑、属性里写 Markdown（官方称为**有意的限制**，因为属性应是"小而原子化、人和机器都能读"的信息）。

**【推断】** 最后那条"有意的限制"值得我们直接抄：**元数据字段必须保持原子化**，否则查询与 AI 处理都会崩。我们的 `Knowledge.keywords/concepts` 目前是自由字符串数组，没有类型、没有统一校验，长期会成为脏数据来源。

---

## 4. 社区插件与其它软件（明确标注证据强度）

### 4.1 社区插件

**【官方】** 官方帮助库确认了两件事：Obsidian 有核心插件与社区插件两套体系（`Extending Obsidian/Community plugins.md`、`Community directory.md`），并且有**插件安全**说明（`Plugin security.md`）——即社区插件运行在项目的库上有代码执行能力，官方明确提示风险。

**【未验证】** 具体社区插件的功能与交互细节，本次**没有取得证据**（没有对任何第三方插件包做静态分析，也没有抓取 README）。因此这里不给凭印象写的"值得借鉴的插件清单" —— 那正是本次要避免的猜测。

如果你需要这一块，可行的验证方式是：把目标插件的发布包（`main.js` + `manifest.json`）下载到本机，用 REA 的 `analyze_javascript_application` 做静态分析，可以直接枚举它注册的命令、视图类型与设置项，证据强度等同于本次对 Obsidian 本体的分析。**这一步需要你指定插件名单，我建议放在第二阶段。**

**【推断】** 从架构上可以确定的是：社区插件能力受 Obsidian 插件 API 约束（注册命令、注册视图、读写文件、访问工作区）。所以"社区插件能做的事"本质上是"官方 API 允许的组合"。我们做 AI Notes 时更该关注的是**官方 API 的能力形状**（注册命令 / 注册视图 / 事件钩子），因为它决定了生态上限和 Agent 工具的边界。

### 4.2 其它软件（补充比较）

**【未验证】** 本次研究没有对 Notion、Logseq、Roam、Heptabase 等产品做任何实测或文档取证。为避免编造，本报告**不给出**这些产品的对比结论。如果后续需要，建议对每个产品采用同一套方法（真实产物取证 + 官方文档），不要凭记忆写对比表。

---

## 5. 可迁移结论：哪些该学，哪些不该学

### 5.1 建议直接迁移（与你们现有架构不冲突）

| # | 结论 | 依据 | 落地形式（不照搬文件架构） |
|---|---|---|---|
| 1 | **内部链接是一等公民，且允许指向尚不存在的目标** | 【官方】 | 知识页正文支持 `[[ ]]` 语法；指向不存在的目标时生成"待建立"占位，而不是报错 |
| 2 | **反向链接分"已链接"与"未链接提及"两段** | 【官方】 | 右侧面板两段结构；未链接提及由字符串匹配起步、由 AI 升级为语义匹配 |
| 3 | **关系可视化先做局部图谱** | 【官方】 | 知识页详情页内嵌 1–2 层邻居图，而不是先做全库图 |
| 4 | **别名（Alias）是概念合并的基础设施** | 【官方】 | Knowledge/Concept 增加 `aliases` 字段，参与链接建议与提及匹配 |
| 5 | **面板应"跟随"当前笔记，而不是全局聊天窗** | 【官方】linked view | AI 面板绑定当前标签页上下文，切换笔记时上下文随之切换 |
| 6 | **可搜索的命令入口** | 【官方】+【实测】 | 增加命令面板（`Ctrl/Cmd+K`），注册全部核心动作 |
| 7 | **排版数值基线：16px / 1.5 / 段距 1rem / 行宽 ~700px / 4px 标度** | 【实测】 | 落成 CSS 变量，替换当前经验值 |
| 8 | **元数据保持原子化、类型全局统一** | 【官方】 | 知识页字段加类型与校验，禁止在字段里写富文本 |
| 9 | **检索结果可被"留存"为常驻视图** | 【官方】query 嵌入 | 搜索结果可另存为标签页 / 书签 |
| 10 | **标签负责"同类"，链接负责"关系"，二者不可互相替代** | 【官方】+【推断】 | 标签索引页与关系面板都要有，不能只做其中一层 |

### 5.2 明确不建议照搬

| 不照搬 | 原因 |
|---|---|
| 本地文件夹即数据库（vault = 普通文件夹） | 你们的产品定位是云端 + 数据库 + 多设备。Obsidian 为此付出了代价：改名要全库重写链接、同步要靠付费服务、移动端要额外处理。**我们的数据库架构在这些点上天然更强，不要退回文件系统。** |
| 围绕"文件重命名"衍生的一整套机制 | 数据库里 ID 是稳定的，改名不产生链接失效问题，这类复杂度可以直接省掉。 |
| 让用户开关基础功能（反向链接、标签都是"插件"） | 这是 Obsidian 的历史包袱与可扩展性设计。我们的用户要的是"能用"，不是"能裁剪"。 |
| 属性里支持 Markdown、嵌套属性 | 官方自己承认是有意不支持，理由是元数据要原子化。 |
| 全库力导向图谱作为默认第一屏 | 在小数据量下无信息量，在大数据量下不可读（见 3.4）。 |

### 5.3 本次研究的未解问题（如实标注）

1. **界面的视觉实证不足**：没有截图、没有真实点击流程录像。原因是本机 REA 无法做原生 UI 捕获（macOS 专属），且**没有**擅自以调试端口重启本机的 Obsidian（那会把私人 vault 内容暴露给分析过程）。可行的下一步见 `04` 号文件的"可选验证"小节。
2. **社区插件零证据**（见 4.1）。
3. **交互手感无法量化**：动画时长、滚动阻尼、拖拽反馈这类只能靠实际操作或运行时抓取，静态资源只能读到部分 `--transition` 类变量。
4. **Obsidian 的"AI 功能"未研究**：1.14.4 语言目录中没有发现"我"以外的 AI 助手模块（我只看到了 Sync / Publish / Web viewer / Bases 等）。若需要对比同类产品的 AI 交互，需要另立研究目标并取证。

---

*本报告全部结论可回溯到：本机 `obsidian-1.14.4.asar`（sha256 见 0.2）静态分析、Obsidian 官方帮助库 `obsidianmd/obsidian-help` 的 77 篇页面。凡未取得证据者均已标注为"未验证"或"推断"。*
