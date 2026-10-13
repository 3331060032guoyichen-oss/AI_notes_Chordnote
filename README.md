# AI Notes

面向大学生的生长式 AI 知识系统。

## 当前阶段

2026 校赛 Demo。

## 项目简介

AI Notes 致力于将大学生的手写笔记、电子笔记和题目逐渐转化为结构化知识，并通过双向链接、知识图谱和知识卡片，让个人知识网络持续生长。

核心原则：**AI 只提议，用户确认后才写入知识网络**；Raw 允许用户修改，但 AI 不得改写原始内容。

已经跑通的闭环是 `Raw → AI 整理 Draft → 用户审阅确认 → Knowledge → Relation → Graph`。

## 已完成的功能

- **原始笔记（Raw）**：新建、列表、删除；服务端校验输入长度与格式
- **AI 整理**：调用 DeepSeek 生成结构化 Draft，不覆盖原始内容
- **审阅入库**：Draft 可逐项编辑，用户确认后才写入 Knowledge；重复确认不会产生重复记录
- **知识页（Knowledge）**：标题、摘要、正文、概念、关键词；支持**内联编辑**（标题右键改名，摘要/正文/概念点击即改）
- **关联关系**：AI 提出关联建议，用户勾选后保存；服务端校验两端存在、拒绝自连接、去重
- **AI 问答**：右侧面板支持 `@` 提及一条已有笔记，服务端按引用重新读取真实内容后作答
- **文件树 + 标签页工作台**：Raw / Knowledge 两组目录，点击在中间区域以标签页打开
- **首屏进入体验**：滚轮 / 触摸 / 键盘三种方式揭示的欢迎界面，含 Three.js 水晶场景（WebGL 不可用时降级为海报图）
- **界面音效**：Web Audio 实时合成，无音频文件；首次进入询问一次，偏好保存在浏览器本地

各功能相对规划目标的完成度与缺口，见 [`docs/ROADMAP.md`](docs/ROADMAP.md)。

## 快速开始

```bash
git clone https://github.com/3331060032guoyichen-oss/ai-notes_demo.git
cd ai-notes_demo
pnpm install
cp .env.example .env.local   # 填入 DEEPSEEK_API_KEY
pnpm dev
```

打开 http://localhost:3000。首次打开是空白状态（运行时数据不进 Git），从左侧「新建笔记」开始。

没有配置 `DEEPSEEK_API_KEY` 时，除 AI 相关功能外的其余部分都可以正常使用。详见 [`.env.example`](.env.example)。

## 未实现的规划功能

以下属于后续规划，当前代码中**不存在**，不要假定可用：

- 出链（Outlink）与「勾选正文片段建立链接」
- 知识图谱的可视化（当前是规则网格卡片，不可拖动/缩放/连线）
- DeepSeek agent 插件的工具调用循环
- Raw 的修改接口（用户可改，AI 不可改；修订记录方式待定，见 `AGENTS.md` 的「决策记录」）
- 右侧「跟随当前标签的上下文面板」（入链 / 出链 / 未链接提及 / 编辑助理）——目前右栏仍是全局 AI 聊天框
- 全文搜索、标签聚合
- 手动多主题切换
- OCR 图片转 Markdown、网页剪切

## 技术栈

- Next.js 15（App Router）
- React 19
- TypeScript
- pnpm

样式为 `app/globals.css` 中的手写 CSS 与 CSS 自定义属性。

运行时依赖只有四个：`next`、`react`、`react-dom`、`three@0.186.0`。其中 `three` **只用于首屏的碎裂水晶场景**，不要用到别处。

**未引入** CSS 框架、UI 组件库或图谱库 —— 具体地说，没有 Tailwind CSS、没有 shadcn/ui、没有 react-force-graph-2d、没有 GSAP。写新界面时请沿用 `app/globals.css` 已有的类名和 CSS 变量。

## 项目结构

```text
app/          Next.js 应用入口与 API 路由
components/   首屏门禁、Three.js 水晶场景、界面音效（3 个手写组件）
lib/          存储层与 DeepSeek 服务边界
data/         本地开发数据（运行时生成，不进版本库）
public/       静态资源
types/        TypeScript 类型
docs/         产品、数据、设计与开发文档
```

## 开发分支

- `main`：稳定版本（默认分支）
- `develop-guozechen`：当前日常集成分支，新工作提交到这里

详细规则见 [`docs/`](docs/)。使用 AI 编码工具时，请先读 [`AGENTS.md`](AGENTS.md)。

## 许可证

本项目采用 [MIT License](LICENSE)。
