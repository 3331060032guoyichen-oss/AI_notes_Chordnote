# AI Notes —— 交接给协作者的操作说明

> 用途：把这轮界面走查发现的问题交给别人（人或 AI 编码助手）修。
> 对方大概率也是 vibe coding，所以本文档同时给出「环境与红线」和「可直接粘贴的提示词」。

---

## 一、先给对方的 30 秒背景

- 项目：AI Notes，面向大学生的「原话 → AI 整理 → 知识页 → 交叉引用 → 知识网络」知识系统。校赛 Demo。
- 技术栈：Next.js 15（App Router）+ React + TypeScript + Drizzle ORM + Neon PostgreSQL，部署在 Netlify（GitHub 推 `main` 自动构建）。
- 仓库：`https://github.com/3331060032guoyichen-oss/ai-notes_demo.git`（公开仓库，克隆不需要权限；**推送需要仓库所有者把你加成 collaborator**）。
- 线上站点：`https://hilarious-kheer-89a440.netlify.app`
- 权威说明：仓库根目录的 `AGENTS.md` 是给 AI 助手的入口手册（决策记录、已删除功能、已知坑都在里面）。**动手前先读它**，不要只读 `docs/` 里的旧文档。

## 二、拿到代码并跑起来

```bash
git clone https://github.com/3331060032guoyichen-oss/ai-notes_demo.git
cd ai-notes_demo
pnpm install                 # 必须用 pnpm（packageManager: pnpm@11.25.0），不要用 npm/yarn
```

环境变量：把 `.env.example` 复制成 `.env.local`，然后按下面填。

| 变量 | 必填 | 说明 |
|---|---|---|
| `DATABASE_URL` | 是 | Neon **dev 分支**的池化连接串（host 里带 `-pooler`）。**必须由项目所有者私下给你，不要贴进仓库、issue 或聊天记录** |
| `DEEPSEEK_API_KEY` | 否 | 只有调试 AI 端点才需要；不填时 `/api/organize` 与 `/api/assistant` 返回 503，其余功能正常 |

```bash
pnpm dev                     # http://localhost:3000
```

注意：不要一边开着 `pnpm dev` 一边跑 `pnpm build`，两者共用 `.next/` 会互相覆盖。

## 三、红线（违反这些会出事故）

1. **只能连 Neon 的 dev 分支。** production 分支的连接串不要索取、不要配置、不要连接、不要执行任何 SQL。仓库里的 `.env.local` 就是你唯一的数据库入口。
2. **不要提交任何 `.env*` 文件**（`.gitignore` 已经挡住全部 `.env*`，只放行 `.env.example`）。不要把连接串、API Key 写进代码、注释、文档或提交信息。
3. **不要手改或删除 `drizzle/` 下已有的迁移文件**（`0000`–`0003` 已经在 dev 执行过）。需要新表/新列时，走 `pnpm exec drizzle-kit generate` 生成新迁移，**把生成的 SQL 发给项目所有者复核后**，再在 dev 分支执行。
4. **不要碰 `production` 分支、不要改 Netlify 的环境变量**，除非项目所有者明确要求。
5. **不要为了"看起来干净"删数据**。发现脏数据先报告，由所有者决定。

## 四、开发与自验流程

每条任务都按这个顺序做完再提交：

```bash
pnpm exec tsc --noEmit           # 类型检查
pnpm build                       # 生产构建（退出码 0，Warning 可忽略）
pnpm dev                         # 另开终端启动
pnpm test                        # 回归测试：60 项断言，必须全绿
pnpm verify:db                   # 校验数据库结构（11 张表 / 11 个 CHECK / 8 个外键）
```

- `pnpm test` 需要服务在跑（默认 `http://localhost:3000`）；它会自己造数据、自己清理，结束时打印「清理后库内为 0」。
- 想验证线上而不是本地：`REGRESSION_BASE_URL=https://hilarious-kheer-89a440.netlify.app pnpm test`（PowerShell 用 `$env:REGRESSION_BASE_URL="https://..."` 再 `pnpm test`）。
- **不可跳过**：改了 UI 就必须真的在浏览器里点一遍（本地或线上），不能只看代码。

## 五、提交与部署

1. **建议用分支 + Pull Request**，不要多个人直接往 `main` 推：`git checkout -b fix/声音浮层遮挡`，改完 push，开 PR，由项目所有者合并。
2. 提交信息写清「改了什么、为什么」。一个提交只做一件事，别把 5 个不相关的修改塞进一次提交。
3. 合并到 `main` 后 Netlify 会自动构建并发布，**大约 1–3 分钟生效**。
4. 上线后必须验证：打开线上站点跑一遍改动涉及的路径；接口相关改动再跑一次 `REGRESSION_BASE_URL=... pnpm test`。
5. 部署的坑：**不推送 = 线上一直是旧代码**，而且旧代码不会报错，只是表现不对（历史上就这么掉线过一次，见 `AGENTS.md` 决策记录）。判断线上是不是最新代码：往 dev 库插一条数据，看线上接口能否读到。

## 六、任务清单

每条都给了「目标 / 改哪里 / 验收标准」。优先级 P0 > P1 > P2。

### P0 —— 不修就没法演示

**T1. 线上补 `DEEPSEEK_API_KEY`（不是代码任务，是配置任务）**

- 目标：让「提出整理稿」在线上可用。
- 现状：线上没有这个变量，点「提出整理稿」返回「编辑助理尚未完成服务配置」，Raw → 知识页 主路径走不通。
- 操作：Netlify 站点 → Site configuration → Environment variables → 新增 `DEEPSEEK_API_KEY`（Production / Deploy Previews / Branch deploys 都填同一个值）→ 保存后重新部署。
- 验收：线上新建一条原话 → 点「提出整理稿」→ 出现审阅整理稿页面 → 确认后出现知识页。

**T2. 加一个「手动收录」入口（可选兜底）**

- 目标：没有 AI Key 时也能把一条原话提升为知识页，避免演示被单点依赖卡死。
- 改哪里：`app/page.tsx` 原始记录标签页（约 491–500 行，`提出整理稿` / `移除记录` 两个按钮旁边），复用现有的 `POST /api/knowledge`（`{ rawId, draft }`，draft 允许手工组装）。
- 验收：断网或没有 Key 时，手动填写标题/摘要/正文后能创建知识页，且知识页里「原始出处」指向这条原话。

### P1 —— 排版与阻塞感

**T3. 声音反馈浮层加关闭按钮并避让**

- 改哪里：`components/interface-sound.tsx`（`SoundPrompt`，约 249 行，class `.sound-prompt`），样式在 `app/globals.css`。
- 要做的：加一个 × 关闭（关闭 = 选择"保持安静"）；别再挡住右下角内容；桌面端避免和 Netlify 徽标重叠（徽标大约占右下角 180×40）。
- 验收：任一页面都能一键关掉，关掉后刷新不再出现；900px 宽度下不再遮挡知识网络卡片。

**T4. 900–1020px 宽度下右栏消失且无入口**

- 改哪里：`app/globals.css` 的 `@media (max-width: 1020px)` 里 `.ai-rail { display: none }`（约 2761 行）；面板本体在 `app/page.tsx:614`（`<aside className="ai-rail">`）。
- 要做的：要么把断点收窄到真正放不下为止，要么给这个宽度段提供打开/关闭右栏的入口（顶栏按钮或抽屉）。
- 验收：1020px 和 900px 下都能找到并使用编辑助理。

**T5. 交叉引用卡片标题左对齐**

- 改哪里：`app/globals.css:2205` 的 `.relation-row`。
- 原因：它是 grid，标题渲染成 `button`，浏览器按钮默认 `text-align: center`，和下面左对齐的说明文字不一致。
- 要做的：`justify-items: start` 或给该按钮 `text-align: start`。
- 验收：卡片里标题与说明文字左边缘对齐。

**T6. 落地页标题对比度**

- 改哪里：`components/landing-page.tsx`、`components/landing-crystal-scene.tsx`、`app/globals.css`（落地页相关样式与 760px 断点）。
- 要做的：给标题区域加一层浅色遮罩或压暗背景，保证白色大标题在投影仪上也清楚；不要改动整页结构。
- 验收：把屏幕亮度调低、或用手机拍屏幕，标题仍然清楚可读。

**T7. 窄屏（≤760px）标签条拥挤**

- 改哪里：`app/globals.css` 的 `@media (max-width: 760px)` 区段（约 2777 行起）。
- 要做的：标签可横向滚动、或限制标签宽度 + 省略号，别让文字被硬裁。
- 验收：420px 宽度下开 3 个标签，仍能看清当前标签、能关掉任意标签。

### P2 —— 信息架构与一致性

**T8. 知识页显示关键点与关键词**

- 改哪里：`app/page.tsx` 知识页详情，概念芯片在约 547–549 行（`.tag-row`）。
- 现状：数据模型里有 `keyPoints` / `keywords`，AI 草稿审阅页也编辑它们（约 474–476 行），但知识页详情只渲染了 `concepts`。
- 要做的：在概念芯片附近用同样的视觉语言展示关键点与关键词（不要新造一套样式）。
- 验收：造一张带这三类字段的知识页，三类内容都能在详情里看到。

**T9. 右栏补齐上下文块**

- 改哪里：`app/page.tsx:614` 起的面板；入链/出链数据可从 `GET /api/knowledge/:id/relations`、`GET /api/knowledge/:id/backlinks` 取（`backlinks` 目前没有任何界面调用过）。
- 要做的：按 `AGENTS.md` 的规范补「入链 / 出链 / 未链接提及 / 编辑助理」四块，跟随当前标签页。
- 验收：打开有交叉引用的知识页，右栏能看到入链与出链；没有时给空状态文案。

**T10. 原始记录加「编辑原话」入口**

- 改哪里：`app/page.tsx` 约 491–500 行的原始记录标签页；接口 `PATCH /api/raw/:id`（body `{ text }`）已经实现并上线。
- 要做的：加内联编辑（和知识页摘要一样的交互：点开 → 文本域 → 失焦保存），保存后刷新列表与正文。
- 验收：改完正文后列表和详情都更新；库里 `audit_log` 多一条 `raw.update`（含改前原文），`raw_notes.version` +1。

**T11. 加路由与深链接（结构改动，建议单独排期）**

- 现状：整站是单页（`app/page.tsx`），URL 始终是 `/`，刷新回到落地页、标签页全丢，也没法分享某张知识页的链接。
- 要做的：给「工作台 + 当前标签」一个 URL 表示（例如 `/?tab=knowledge:<id>` 或用 App Router 子路由）。
- 验收：刷新后仍在同一张笔记上；把 URL 发给别人能直接打开同一张知识页。
- 注意：这是这批里唯一有回归风险的改动，改完必须跑完整 `pnpm test` + 手动走查主流程。

## 七、可直接粘贴给 AI 编码助手的提示词

第一次让 AI 接手时，先发**通用头部**，再发**单个任务**。一次只给一个任务，改完验证完再给下一个。

**通用头部（每次都带上）**

```
你在改一个 Next.js 15 (App Router) + TypeScript + Drizzle ORM + Neon PostgreSQL 的项目，代码在 <克隆目录>。
先完整读仓库根目录的 AGENTS.md，再动手。

硬性约束：
- 只能连 Neon 的 dev 分支（连接串在 .env.local 的 DATABASE_URL 里）。绝对不要连接、不要改 production 分支。
- 不要提交任何 .env* 文件；不要把连接串或 API Key 写进代码、文档、提交信息。
- 不要修改 drizzle/ 下已有的迁移文件；需要 schema 变更时先生成 SQL 给我复核，等我同意再在 dev 执行。
- 一次只做我给你的这一个任务，不要顺手重构别的代码，不要改与任务无关的文件。

完成标准（每次都要做到）：
1) pnpm exec tsc --noEmit 通过；
2) pnpm build 退出码 0；
3) 起 pnpm dev 后 pnpm test 全绿（60 项断言，结束时库内 0 行）；
4) 用浏览器真的点一遍你改动的路径，把「做了什么、怎么验证的、哪些没验证」报告给我；
5) 报告时明确区分「已验证」和「未验证」，没跑过的不要写成通过。
```

**任务示例（把 T 编号换成你这次要做的）**

```
任务：修复声音反馈浮层挡住内容的问题（T3）。
现象：右下角的「声音反馈」卡片没有关闭按钮，会一直盖在内容上；900px 宽度下压住知识网络的卡片，窄屏下压住底部导航。
要求：给它加一个关闭按钮（关闭等价于选择「保持安静」），并保证它不再和右下角的 Netlify 徽标重叠。只改这个浮层相关的代码和样式。
验收：任一页面都能一键关掉，关掉后刷新不再出现；900px 宽度下不再遮挡内容。
```

**如果你不是让 AI 改，而是自己动手**：把上面「通用头部」里的约束当作自己的检查清单，任务部分照 T1–T11 的「要做的 / 验收」执行。

## 八、已知过时或有坑的地方

- `docs/DEV_WORKFLOW.md` 说「没有测试脚本，不要假设 `pnpm test` 存在」——已过时，现在有 `pnpm test`（60 项回归断言）。它还说所有新工作提交到 `develop-guozechen`，而我们实际是**直接在 `main` 上工作并部署**；以 `AGENTS.md` 为准。
- `.next/` 和 `node_modules/` 不要提交；`tsconfig.tsbuildinfo` 已在 `.gitignore`。
- `node_modules` 的目录结构是 pnpm 的符号链接，用 npm 装依赖会破坏它。
- PowerShell 里跑含 `*`、引号的 SQL/JS 片段容易失败，写进临时脚本文件再跑更稳。

## 九、项目所有者需要先做的三件事

1. 在 GitHub 仓库 Settings → Collaborators 里把对方加进来（否则他只能克隆、不能推送）。
2. 把 **dev 分支的池化连接串**单独、私下给对方（用密码管理器或私聊，不要贴进仓库/issue）。
3. 决定是否接受「分支 + PR」的协作方式（推荐），以及 T11（路由/深链接）是否现在做。
