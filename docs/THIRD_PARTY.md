# Third-Party Dependencies

引入第三方项目时，请记录项目名称、URL、版本、许可证、使用模块、使用原因和备注，并确认许可证义务。

> 版本号写 `package.json` 里的声明范围；「实测版本」是当前 `node_modules` 里解析到的版本。
> 许可证一栏若标注「待确认」，表示尚未核实，**不得**据此判断义务。

## 一、运行时依赖（已在 `package.json` 的 `dependencies` 中）

| 项目 | URL | Version | 实测版本 | License | 用途 | 备注 |
|------|-----|---------|---------|---------|------|------|
| next | https://nextjs.org | ^15.0.0 | — | MIT | 应用框架（App Router + API 路由） | |
| react | https://react.dev | ^19.0.0 | 19.3.0 | MIT | UI 库 | |
| react-dom | https://react.dev | ^19.0.0 | 19.3.0 | MIT | React DOM 渲染 | |
| @neondatabase/serverless | https://github.com/neondatabase/serverless | ^1.2.0 | 1.2.0 | MIT | Neon Postgres 驱动 | |
| drizzle-orm | https://orm.drizzle.team | 0.45.4 | 0.45.4 | Apache-2.0 | ORM / 查询构造 | 版本精确锁定 |
| three | https://threejs.org | 0.186.0 | 0.186.0 | MIT | 落地页 WebGL 场景 | 版本精确锁定；仅在落地页使用 |
| @tsparticles/engine | https://github.com/tsparticles/tsparticles | ^4.4.0 | 4.4.0 | MIT | 落地页星尘粒子（引擎） | |
| @tsparticles/react | https://github.com/tsparticles/tsparticles | ^4.4.0 | 4.4.0 | MIT | 落地页星尘粒子（React 封装） | 用于 `components/landing-stardust.tsx` |
| @tsparticles/slim | https://github.com/tsparticles/tsparticles | ^4.4.0 | 4.4.0 | MIT | 落地页星尘粒子（精简特性包） | |
| bufferutil | https://github.com/websockets/bufferutil | ^4.1.0 | 4.1.0 | MIT | `ws` 的可选原生加速 | 可选依赖，无原生编译时自动退化 |
| ws | https://github.com/websockets/ws | ^8.22.0 | 8.22.0 | MIT | WebSocket 客户端 | |
| **d3-force** | https://github.com/d3/d3-force | **^3.0.0** | **待安装** | **ISC** | **知识网络的力导向布局计算** | **仅用力学计算，渲染由 `components/graph-view.tsx` 自绘 Canvas。新增于 2026-10-16。** |

### 关于 d3-force

- 许可证为 **ISC**（宽松，等同 MIT 的宽松程度，保留版权声明即可）。`Copyright 2010-2021 Mike Bostock`。
- 传递依赖：`d3-dispatch`、`d3-quadtree`、`d3-timer`（同为 ISC）。
- `@types/d3-force` 3.0.10（MIT，DefinitelyTyped）为开发依赖。
- **取舍记录**：2026-10-10 已决定「用 d3-force 做力学、不用 `react-force-graph-2d`」，理由是后者把布局、渲染、交互绑在一个组件里，与「力学和渲染解耦」的架构取向冲突。该决策当时的落地方式是自绘 Canvas，见 `AGENTS.md`。
- ⚠️ **安装未完成**：本机尚未安装。需要在项目根目录执行 `pnpm install`（或 `pnpm add d3-force && pnpm add -D @types/d3-force`）并提交更新后的 `pnpm-lock.yaml`。**在锁文件更新之前，Netlify 构建会因解析不到 `d3-force` 而失败。**

## 二、开发依赖（已在 `package.json` 的 `devDependencies` 中）

| 项目 | Version | 实测版本 | License | 用途 |
|------|---------|---------|---------|------|
| typescript | ^5.0.0 | 5.9.3 | Apache-2.0 | 类型系统 |
| eslint | ^9.0.0 | 9.39.5 | MIT | 代码检查 |
| eslint-config-next | ^15.0.0 | 15.5.26 | MIT | Next 官方 lint 规则 |
| @next/eslint-plugin-next | ^15.5.26 | 15.5.26 | MIT | 同上（插件本体） |
| @eslint/eslintrc | ^3.3.7 | 3.3.7 | MIT | ESLint 旧版配置兼容 |
| eslint-plugin-import | ^2.31.0 | 2.32.0 | MIT | import 规则 |
| eslint-plugin-react | ^7.37.0 | 7.37.5 | MIT | React 规则 |
| eslint-plugin-react-hooks | ^5.0.0 | 5.2.0 | MIT | Hooks 规则 |
| eslint-plugin-jsx-a11y | ^6.10.0 | 6.10.2 | MIT | 无障碍规则 |
| @typescript-eslint/eslint-plugin | ^8.0.0 | 8.71.0 | MIT | TS 规则 |
| @typescript-eslint/parser | ^8.0.0 | 8.71.0 | MIT | TS 解析器 |
| drizzle-kit | 0.31.11 | 0.31.11 | MIT | 迁移与 schema 工具 |
| @types/d3-force | ^3.0.10 | **待安装** | MIT | d3-force 类型声明 |
| @types/node | ^22.0.0 | 22.20.4 | MIT | Node 类型 |
| @types/pg | ^8.23.1 | 8.23.1 | MIT | pg 类型 |
| @types/react | ^19.0.0 | 19.3.0 | MIT | React 类型 |
| @types/react-dom | ^19.0.0 | 19.3.0 | MIT | ReactDOM 类型 |
| @types/three | 0.186.0 | 0.186.0 | MIT | three 类型 |
| @types/ws | ^8.18.2 | 8.18.2 | MIT | ws 类型 |

> **不存在**的依赖（历史文档曾误列，请勿据此写代码）：Tailwind CSS、shadcn/ui、react-force-graph-2d、GSAP。

## 三、参考项目 / 待引入

以下项目来自 `任务分工.docx` 的规划，目前**尚未引入代码**，仅作为参考或后续集成目标。**许可证均未经核实**，真正引入前必须逐项确认并回填本表。

| 项目 | URL | Version | License | 用途 | 备注 |
|------|-----|---------|---------|------|------|
| llm_wiki | https://github.com/nashsu/llm_wiki | 未引入 | **待确认** | 知识库结构参考 | 知识库和图谱线，阶段一参考 |
| WeKnora | https://github.com/Tencent/WeKnora | 未引入 | **待确认** | 知识库结构参考 | 同上 |
| MinerU | https://github.com/opendatalab/MinerU | 未引入 | **待确认** | OCR：图片转 Markdown | Skills 线，阶段二 |
| Obsidian Web Clipper | https://obsidian.md/clipper | 未引入 | **待确认** | 一键剪切网页内容 | Skills 线，阶段二 |
| taste-skill | https://github.com/Leonxlnx/taste-skill | 未引入 | **待确认** | 优化 AI 生成 UI 的 skill | UI 线辅助工具，不进入产物 |
| impeccable | https://github.com/pbakaus/impeccable | 未引入 | **待确认** | 同上 | UI 线辅助工具，不进入产物 |
