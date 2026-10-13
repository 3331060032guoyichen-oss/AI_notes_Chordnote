
```
<!-- 和弦音符主体渐变 -->
<linearGradient id="chord-grad" x1="0%" y1="0%" x2="100%" y2="100%">
  <stop offset="0%" stop-color="#818CF8" />
  <stop offset="50%" stop-color="#C084FC" />
  <stop offset="100%" stop-color="#E879F9" />
</linearGradient>

<!-- 节点发光滤镜 -->
<filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
  <feGaussianBlur stdDeviation="6" result="blur" />
  <feComposite in="SourceGraphic" in2="blur" operator="over" />
</filter>

```

```
<!-- 拓扑连接弦 -->
<path d="M 45 45 L 95 45 L 80 95 L 45 70 Z" fill="none" stroke="url(#chord-grad)" stroke-width="2" opacity="0.6" />

<!-- 音符 C 符号结构 -->
<path d="M 92 52 C 82 40 65 38 50 48 C 32 60 32 85 48 98 C 64 110 85 104 94 90" fill="none" stroke="url(#chord-grad)" stroke-width="7" stroke-linecap="round" filter="url(#glow)" />

<!-- 知识节点 (Chord Nodes) -->
<circle cx="92" cy="52" r="5" fill="#E879F9" filter="url(#glow)" />
<circle cx="50" cy="48" r="4" fill="#818CF8" />
<circle cx="48" cy="98" r="4" fill="#C084FC" />
<circle cx="94" cy="90" r="5" fill="#38BDF8" filter="url(#glow)" />

```

```
<rect x="112" y="0" width="118" height="22" rx="11" fill="#065F46" stroke="#059669" stroke-width="1" />
<text x="171" y="15" font-family="system-ui, -apple-system, sans-serif" font-size="10" font-weight="700" fill="#6EE7B7" text-anchor="middle" letter-spacing="0.5">AGENT-POWERED</text>

<!-- 品牌主副标题 -->
<text x="0" y="62" font-family="system-ui, -apple-system, sans-serif" font-size="38" font-weight="800" fill="#F8FAFC" letter-spacing="-0.5">Chordnote <tspan fill="#A5B4FC" font-weight="400">| 和弦</tspan></text>

<!-- Slogan 主标与副标 -->
<text x="0" y="92" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600" fill="#C084FC" letter-spacing="0.5">Notes become chords.</text>
<text x="0" y="114" font-family="system-ui, -apple-system, sans-serif" font-size="13" fill="#94A3B8">一条笔记是音符，连起来才是和弦 — 面向大学生的生长式 AI 知识系统</text>

```

## 🎵 产品愿景：从“孤立音符”到“交响和弦”

大学生的学习过程不应是碎片的堆砌。在日常学习中，手写速记、课堂 PPT、考研错题和论文资料如同散落的**单音音符**；唯有通过严谨的结构化梳理与双向关联，才能形成枝叶交错、自我生长的**知识和弦**。

**Chordnote** 是一款专为大学生打造的 AI 知识网络工具。我们融合了 **Obsidian 的双向链接/拓扑图谱** 与 **LLM Agent** 的自动化整理能力，致力于解决传统 AI 笔记软件中“AI 擅自覆写、生成幻觉严重、对话框与笔记割裂”的痛点。

## 🚀 创新破局：从借鉴到独创

作为软件设计者，我们将现有工具在实际应用中的不便，转化为了 **Chordnote** 的四大核心设计创新：

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 230" width="100%" height="auto">
  <rect width="800" height="230" rx="12" fill="#0F172A" stroke="#1E293B" stroke-width="1" />
  
  <!-- Column Headers -->
  <text x="30" y="35" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#64748B" letter-spacing="1">传统 AI / 笔记工具的痛点</text>
  <text x="410" y="35" font-family="system-ui, sans-serif" font-size="12" font-weight="700" fill="#818CF8" letter-spacing="1">CHORDNOTE 的设计创新</text>
  <line x1="30" y1="48" x2="770" y2="48" stroke="#334155" stroke-width="1" />

  <!-- Item 1 -->
  <g transform="translate(30, 65)">
    <circle cx="8" cy="8" r="4" fill="#EF4444" />
    <text x="20" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#E2E8F0">手动双链门槛高，海量笔记极易放弃</text>
    <path d="M 350 8 L 370 8" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2" />
    <text x="380" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#38BDF8">AI 拓扑生长</text>
    <text x="475" y="12" font-family="system-ui, sans-serif" font-size="12" fill="#94A3B8">：Agent 自动抽取概念与建议关联，一键完成构链</text>
  </g>

  <!-- Item 2 -->
  <g transform="translate(30, 105)">
    <circle cx="8" cy="8" r="4" fill="#EF4444" />
    <text x="20" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#E2E8F0">AI 擅自改写原始内容，失去信任感</text>
    <path d="M 350 8 L 370 8" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2" />
    <text x="380" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#34D399">零黑盒法则</text>
    <text x="475" y="12" font-family="system-ui, sans-serif" font-size="12" fill="#94A3B8">：AI 只提议、用户确认后入库；Raw 仅人类可改</text>
  </g>

  <!-- Item 3 -->
  <g transform="translate(30, 145)">
    <circle cx="8" cy="8" r="4" fill="#EF4444" />
    <text x="20" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#E2E8F0">AI 问答无上下文，频繁复制粘贴</text>
    <path d="M 350 8 L 370 8" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2" />
    <text x="380" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#C084FC">@ 上下文复读</text>
    <text x="475" y="12" font-family="system-ui, sans-serif" font-size="12" fill="#94A3B8">：服务端重新读取真实笔记进行精确溯源回答</text>
  </g>

  <!-- Item 4 -->
  <g transform="translate(30, 185)">
    <circle cx="8" cy="8" r="4" fill="#EF4444" />
    <text x="20" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#E2E8F0">Agent 行为不可控，难以协同</text>
    <path d="M 350 8 L 370 8" stroke="#475569" stroke-width="1.5" stroke-dasharray="2,2" />
    <text x="380" y="12" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="#F43F5E">LLM Wiki 规范</text>
    <text x="475" y="12" font-family="system-ui, sans-serif" font-size="12" fill="#94A3B8">：以 Wiki 标准文案作为 Agent 的标准执行手册</text>
  </g>
</svg>

```

## 🔄 核心架构与闭环工作流

Chordnote 遵循严格的单向数据流与人类确认机制。知识从原始碎片到拓扑网格的流转路径如下：

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 160" width="100%" height="auto">
  <rect width="800" height="160" rx="12" fill="#0F172A" stroke="#1E293B" stroke-width="1" />

  <!-- 步骤 1：Raw -->
  <g transform="translate(35, 35)">
    <rect width="110" height="90" rx="8" fill="#1E293B" stroke="#334155" stroke-width="1" />
    <rect x="10" y="12" width="24" height="24" rx="4" fill="#3B82F6" opacity="0.2" />
    <text x="22" y="28" font-family="system-ui" font-size="12" fill="#60A5FA" text-anchor="middle" font-weight="bold">1</text>
    <text x="12" y="54" font-family="system-ui" font-size="13" font-weight="700" fill="#F8FAFC">Raw 原始笔记</text>
    <text x="12" y="72" font-family="system-ui" font-size="10" fill="#64748B">文字/手写/题目输入</text>
    <text x="12" y="86" font-family="system-ui" font-size="10" fill="#64748B">保留最真实记录</text>
  </g>

  <!-- 连接 1 -->
  <path d="M 155 80 L 180 80" stroke="#4F46E5" stroke-width="2" marker-end="url(#arrow)" />

  <!-- 步骤 2：Agent Draft -->
  <g transform="translate(190, 35)">
    <rect width="110" height="90" rx="8" fill="#1E293B" stroke="#4338CA" stroke-width="1" />
    <rect x="10" y="12" width="24" height="24" rx="4" fill="#8B5CF6" opacity="0.2" />
    <text x="22" y="28" font-family="system-ui" font-size="12" fill="#A78BFA" text-anchor="middle" font-weight="bold">2</text>
    <text x="12" y="54" font-family="system-ui" font-size="13" font-weight="700" fill="#F8FAFC">AI 结构化 Draft</text>
    <text x="12" y="72" font-family="system-ui" font-size="10" fill="#94A3B8">DeepSeek 提炼概念</text>
    <text x="12" y="86" font-family="system-ui" font-size="10" fill="#818CF8">不直接覆盖原 Raw</text>
  </g>

  <!-- 连接 2 -->
  <path d="M 310 80 L 335 80" stroke="#4F46E5" stroke-width="2" />

  <!-- 步骤 3：审阅确认 -->
  <g transform="translate(345, 35)">
    <rect width="110" height="90" rx="8" fill="#1E1B4B" stroke="#6366F1" stroke-width="1.5" />
    <rect x="10" y="12" width="24" height="24" rx="4" fill="#06B6D4" opacity="0.2" />
    <text x="22" y="28" font-family="system-ui" font-size="12" fill="#22D3EE" text-anchor="middle" font-weight="bold">3</text>
    <text x="12" y="54" font-family="system-ui" font-size="13" font-weight="700" fill="#38BDF8">人类审阅确认</text>
    <text x="12" y="72" font-family="system-ui" font-size="10" fill="#CBD5E1">逐项修改/确认</text>
    <text x="12" y="86" font-family="system-ui" font-size="10" fill="#38BDF8">校验幂等防重复</text>
  </g>

  <!-- 连接 3 -->
  <path d="M 465 80 L 490 80" stroke="#4F46E5" stroke-width="2" />

  <!-- 步骤 4：Knowledge -->
  <g transform="translate(500, 35)">
    <rect width="110" height="90" rx="8" fill="#1E293B" stroke="#059669" stroke-width="1" />
    <rect x="10" y="12" width="24" height="24" rx="4" fill="#10B981" opacity="0.2" />
    <text x="22" y="28" font-family="system-ui" font-size="12" fill="#34D399" text-anchor="middle" font-weight="bold">4</text>
    <text x="12" y="54" font-family="system-ui" font-size="13" font-weight="700" fill="#F8FAFC">Knowledge 知识卡</text>
    <text x="12" y="72" font-family="system-ui" font-size="10" fill="#94A3B8">支持全内联编辑</text>
    <text x="12" y="86" font-family="system-ui" font-size="10" fill="#34D399">持久化沉淀</text>
  </g>

  <!-- 连接 4 -->
  <path d="M 620 80 L 645 80" stroke="#4F46E5" stroke-width="2" />

  <!-- 步骤 5：Relation & Graph -->
  <g transform="translate(655, 35)">
    <rect width="110" height="90" rx="8" fill="#1E293B" stroke="#D946EF" stroke-width="1" />
    <rect x="10" y="12" width="24" height="24" rx="4" fill="#E11D48" opacity="0.2" />
    <text x="22" y="28" font-family="system-ui" font-size="12" fill="#F43F5E" text-anchor="middle" font-weight="bold">5</text>
    <text x="12" y="54" font-family="system-ui" font-size="13" font-weight="700" fill="#F8FAFC">Relation 和弦图谱</text>
    <text x="12" y="72" font-family="system-ui" font-size="10" fill="#94A3B8">双向反链交错</text>
    <text x="12" y="86" font-family="system-ui" font-size="10" fill="#F43F5E">极速检索复习</text>
  </g>
</svg>

```

## ✨ 已实现的功能与事实证据

项目的核心链路已完全跑通，代码与数据层已具备高度可用性：

* **📝 原始笔记 (Raw) 边界隔离**：提供新建、列表管理及服务端格式校验。强制遵循“用户可改，AI 绝不可直接改写”的原则。

* **🤖 DeepSeek 结构化 Draft**：一键调用 DeepSeek 引擎分析 Raw 笔记，提炼摘要、关键词与核心概念草稿（Draft）。

* **✅ 审阅入库与幂等保障**：Draft 提供交互式逐项编辑能力，用户确认后方可写入 Knowledge 库，重复点击不会触发冗余记录。

* **✏️ Knowledge 知识卡片与内联编辑**：卡片支持极简交互——右键改名，摘要、正文与概念点击即可完成即时修改。

* **🔗 智能关联 (Relation System)**：AI 根据语义推荐节点关联，前端勾选确认后建立链接；服务端严密校验两端存在性、拒绝自环连接并自动去重。

* **💬 上下文感知 AI 问答**：右侧交互面板支持使用 `@` 引用特定笔记，服务端实时读取底层持久化内容作答，彻底杜绝幻觉。

* **🖥️ 双组文件树与工作台**：Raw / Knowledge 两组文件树清晰划分，中间区域支持多标签页并行处理。

* **✨ 三维音效与首屏视觉**：内置 Web Audio 实时高品质音效合成系统，配合 Three.js 碎裂水晶 scene，营造现代且沉浸的仪式感。

## 🛠️ 技术栈与轻量化架构

Chordnote 追求极致的轻量化与运行效能，无冗余重型依赖：

* **核心框架**：Next.js 15 (App Router) + React 19 + TypeScript

* **包管理器**：pnpm

* **样式系统**：自研轻量 CSS 变量与 `app/globals.css` 原生类名体系（无 Tailwind/shadcn 负担）

* **运行依赖控制**：仅依赖 `next`、`react`、`react-dom` 与 `three` (仅用于首屏 WebGL 场景)

```
Chordnote Project Structure
├── app/          Next.js 15 App Router 入口与 API 路由
├── components/   首屏门禁、Three.js 场景与 Web Audio 音效引擎
├── lib/          存储层逻辑与 DeepSeek API 服务边界
├── data/         本地开发运行时数据（不纳入 Git 版本控制）
├── types/        TypeScript 全局类型定义
└── docs/         ROADMAP 及 Agent 执行规范 (LLM Wiki)

```

## ⚡ 快速开始

### 1. 克隆项目并安装依赖

```
git clone https://github.com/3331060032guoyichen-oss/ai-notes_demo.git
cd ai-notes_demo
pnpm install

```

### 2. 配置环境变量

复制环境配置示例文件，并填入您的 DeepSeek API 密钥：

```
cp .env.example .env.local

```

在 `.env.local` 中配置：

```
DEEPSEEK_API_KEY="your_deepseek_api_key_here"

```

*(注：即使不配置 API Key，除 AI 自动整理与问答外的全部知识树与卡片功能均可无缝使用)*

### 3. 启动开发服务器

```
pnpm dev

```

打开浏览器访问 <http://localhost:3000>，即可开启您的知识生长之旅！

## 📄 许可证

本项目采用 [MIT License](LICENSE) 授权许可。
