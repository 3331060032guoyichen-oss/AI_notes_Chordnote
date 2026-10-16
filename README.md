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

我们借鉴了 LLM Wiki 的 Agent 执行手册、Obsidian 的反向链接与知识图谱，但把它们改造成适合大学生学习的产品机制：

<p align="center">
  <img src="./assets/readme/innovation.svg" width="100%" alt="Chordnote 将常见笔记工具的痛点转化为四项产品设计决定" />
</p>

- **AI 拓扑生长**：Agent 提议概念与关联，学生确认后再建立连接，降低维护双链的门槛。
- **零黑盒法则**：原始 Raw 永远保留；AI 只能生成 Draft，用户确认后才进入 Knowledge。
- **@ 上下文复读**：问答面板直接引用已有笔记，服务端重读真实内容后作答，避免反复复制粘贴。
- **LLM Wiki 规范**：把 Agent 的执行步骤写成可审阅的知识流程，让模型的行为有边界、有迹可循。

这也是 Chordnote 的边界：我们不把 AI 当作替你记忆的黑箱，而把它放在“提议”和“解释”的位置，把最终的知识所有权留给学习者。

## 已经可以体验什么

- **原始记录**：写下来就自动收下（停笔两秒，不需要点按钮）；点正文即可修订；右键可移除；没起名字的按「未命名 1 / 2 / 3」编号。
- **整理助手**：`@` 一条材料交给它，它会先检索、再通读，然后把串联建议与留档方案列出来等你拍板；轨迹上每一步都写着"做了什么、为了什么"。
- **提议与拍板**：AI 的每个写入意图都落成一条待确认提议 —— 你点确认才入库，点忽略就丢掉。改写正文的建议以 Diff 卡附在正文底部。
- **知识页**：标题、摘要、正文、概念、关键词点击即改；可归档 / 恢复；每次写入留下一条修订。
- **双向链接**：正文里出现别的知识页标题会变成可点的内联标记（已连接实线、未连接虚线）；右栏给出链、出链，以及「未链接提及 → 一键建立关联」。
- **知识网络**：`d3-force` 力学 + Canvas 自绘，可拖动、滚轮缩放、点节点出卡片、双击打开那一页；拖动即固定。
- **知识包**：一键导出全部数据（JSON 全量快照，可再导入回来），或导出成 markdown + YAML frontmatter 的 zip —— 任何读 markdown 的工具都能打开，不依赖本应用。
- **三套阅读主题**：暗室星图 / 暖纸批注 / 实验工坊；界面声音开关收在设置里。
- **进入体验**：滚轮、触摸、键盘都能揭示欢迎界面。

## 快速开始

```bash
git clone https://github.com/3331060032guoyichen-oss/ai-notes_demo.git
cd ai-notes_demo
pnpm install
cp .env.example .env.local   # 填 DATABASE_URL（Neon dev 分支，必填）与 DEEPSEEK_API_KEY（可选）
pnpm dev
```

打开 <http://localhost:3000>，从左侧「新建笔记」开始。数据在 PostgreSQL 里，`DATABASE_URL` 指向 Neon 的 **dev 分支**；没有配置 `DEEPSEEK_API_KEY` 时，除 AI 相关功能外其余界面仍可使用。环境变量说明见 [`.env.example`](.env.example) 与 [`docs/DEV_WORKFLOW.md`](docs/DEV_WORKFLOW.md)。

想直接看到有内容的界面：`pnpm seed:demo`（幂等写入一批演示笔记，见 [`AGENTS.md`](AGENTS.md)）。

## 当前边界与下一步

这是一个 **2026 校赛 Demo**。已经有真实代码的闭环优先于概念展示，以下能力仍在规划中：

- 全文搜索、标签聚合、OCR 转 Markdown、网页剪切。
- **永久清除（purge）**：设计与风险边界见 [`docs/reports/10`](docs/reports/10-purge永久清除设计.md)，MVP 不开放。
- **登录与多用户**：当前是演示期隐式单用户（`DEFAULT_OWNER_ID`），服务层的归属过滤已按用户写好，换实现即可。

完整的目标、现状和差距对照见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 技术栈与项目结构

Next.js 15（App Router） · React 19 · TypeScript · pnpm · 手写 CSS · Drizzle ORM + Neon PostgreSQL · Three.js 0.186.0（首屏）· d3-force（图谱力学）· tsParticles（背景星尘）

```text
app/          Next.js 页面与 API 路由（含 export / import / proposals / agent）
components/   首屏门禁与星尘、知识图谱、设置抽屉、界面音效
lib/          服务层（sources / notes / links / proposals / bundle）、Agent 工具循环、DeepSeek 边界、手写 zip
types/        TypeScript 类型
seed/         演示数据（pnpm seed:demo）
docs/         产品、数据、设计与开发文档
```

开发约定与分支说明见 [`AGENTS.md`](AGENTS.md) 和 [`docs/`](docs/)。

## 许可证

本项目采用 [MIT License](LICENSE)。
