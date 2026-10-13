# Third-Party Dependencies

引入第三方项目时，请记录项目名称、URL、版本、许可证、使用模块、使用原因和备注，并确认许可证义务。

## 一、运行时依赖（已在 `package.json` 中）

| 项目 | URL | Version | License | 用途 | 备注 |
|------|-----|---------|---------|------|------|
| next | https://nextjs.org | ^15.0.0 | MIT | 应用框架（App Router + API 路由） | |
| react | https://react.dev | ^19.0.0 | MIT | UI 库 | |
| react-dom | https://react.dev | ^19.0.0 | MIT | React DOM 渲染 | |
| typescript | https://www.typescriptlang.org | ^5.0.0 | Apache-2.0 | 类型系统（devDependency） | |
| eslint | https://eslint.org | ^9.0.0 | MIT | 代码检查（devDependency） | |
| eslint-config-next | https://nextjs.org | ^15.0.0 | MIT | Next 官方 lint 规则（devDependency） | |

> **不存在**的依赖（历史文档曾误列，请勿据此写代码）：Tailwind CSS、shadcn/ui、react-force-graph-2d、GSAP。

## 二、参考项目 / 待引入

以下项目来自 `任务分工.docx` 的规划，目前**尚未引入代码**，仅作为参考或后续集成目标。**许可证均未经核实**，真正引入前必须逐项确认并回填本表。

| 项目 | URL | Version | License | 用途 | 备注 |
|------|-----|---------|---------|------|------|
| llm_wiki | https://github.com/nashsu/llm_wiki | 未引入 | **待确认** | 知识库结构参考 | 知识库和图谱线，阶段一参考 |
| WeKnora | https://github.com/Tencent/WeKnora | 未引入 | **待确认** | 知识库结构参考 | 同上 |
| MinerU | https://github.com/opendatalab/MinerU | 未引入 | **待确认** | OCR：图片转 Markdown | Skills 线，阶段二 |
| Obsidian Web Clipper | https://obsidian.md/clipper | 未引入 | **待确认** | 一键剪切网页内容 | Skills 线，阶段二 |
| taste-skill | https://github.com/Leonxlnx/taste-skill | 未引入 | **待确认** | 优化 AI 生成 UI 的 skill | UI 线辅助工具，不进入产物 |
| impeccable | https://github.com/pbakaus/impeccable | 未引入 | **待确认** | 同上 | UI 线辅助工具，不进入产物 |
