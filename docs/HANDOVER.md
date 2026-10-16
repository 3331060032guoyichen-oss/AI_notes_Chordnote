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
| `DATABASE_URL` | 是 | Neon **dev 分支**的池化连接串（host 里带 `-pooler`）。**由项目所有者私下提供，不要贴进仓库、issue 或聊天记录** |
| `DEEPSEEK_API_KEY` | 否 | 只有调试 AI 端点才需要；不填时 `/api/organize` 与 `/api/assistant` 返回 503，其余功能正常 |

```bash
pnpm dev                     # http://localhost:3000
```

注意：不要一边开着 `pnpm dev` 一边跑 `pnpm build`，两者共用 `.next/` 会互相覆盖。

## 三、红线（违反这些会出事故）

1. **只能连 Neon 的 dev 分支。** production 分支的连接串不要索取、不要配置、不要连接、不要执行任何 SQL。仓库里的 `.env.local` 就是你唯一的数据库入口。
2. **不要提交任何 `.env*` 文件**（`.gitignore` 已经挡住全部 `.env*`，只放行 `.env.example`）。不要把连接串、API Key 写进代码、注释、文档或提交信息。
3. **不要手改或删除 `drizzle/` 下已有的迁移文件**（`0000`–`0005` 已经在 dev 执行过）。需要新表/新列时，走 `pnpm exec drizzle-kit generate` 生成新迁移，**把生成的 SQL 发给项目所有者复核后**，再在 dev 分支执行。
4. **不要碰 `production` 分支、不要改 Netlify 的环境变量**，除非项目所有者明确要求。
5. **不要为了"看起来干净"删数据**。发现脏数据先报告，由所有者决定。

## 四、开发与自验流程

每条任务都按这个顺序做完再提交：

```bash
pnpm exec tsc --noEmit           # 类型检查
pnpm build                       # 生产构建（退出码 0，Warning 可忽略）
pnpm dev                         # 另开终端启动
pnpm test                        # 回归测试：74 项断言，必须全绿
pnpm verify:db                   # 校验数据库结构（11 张表 / 11 个 CHECK / 8 个外键）
```

- `pnpm test` 需要服务在跑（默认 `http://localhost:3000`）；它会自己造数据、自己清理，结束时打印「清理后本次测试数据为 0」。断言只针对它自己造的数据，所以库里同时留着演示内容也能跑绿。
- 想验证线上而不是本地：`REGRESSION_BASE_URL=https://hilarious-kheer-89a440.netlify.app pnpm test`（PowerShell 用 `$env:REGRESSION_BASE_URL="https://..."` 再 `pnpm test`）。
- **不可跳过**：改了 UI 就必须真的在浏览器里点一遍（本地或线上），不能只看代码。

## 五、提交与部署

1. **建议用分支 + Pull Request**，不要多个人直接往 `main` 推：`git checkout -b fix/声音浮层遮挡`，改完 push，开 PR，由项目所有者合并。
2. 提交信息写清「改了什么、为什么」。一个提交只做一件事，别把 5 个不相关的修改塞进一次提交。
3. 合并到 `main` 后 Netlify 会自动构建并发布，**大约 1–3 分钟生效**。
4. 上线后必须验证：打开线上站点跑一遍改动涉及的路径；接口相关改动再跑一次 `REGRESSION_BASE_URL=... pnpm test`。
5. 部署的坑：**不推送 = 线上一直是旧代码**，而且旧代码不会报错，只是表现不对（历史上就这么掉线过一次，见 `AGENTS.md` 决策记录）。判断线上是不是最新代码：往 dev 库插一条数据，看线上接口能否读到。

## 六、任务清单（2026-10-17 复核）

下面这张表是原来那 10 条走查问题的**逐项现状**。打勾的已经在代码里落地并实测过；标"待复核"的意味着当时的判断可能已经过期，动手前先在界面上点一遍确认。

| 编号 | 事项 | 现状 |
|---|---|---|
| T1 | 线上补 `DEEPSEEK_API_KEY` | **仍未做**（配置任务，见下）|
| T2 | 加「手动收录」入口兜底 | **作废**：那颗「提出整理稿」按钮已按产品决策下线，整理改从右栏「整理助手」的快捷词发起；若仍要"没有 Key 也能入库"的兜底，另立一条（要考虑它会不会又变成绕过确认的捷径）|
| T3 | 声音反馈浮层遮挡 | **已完成**：`SoundPrompt` 已删除，声音开关搬进「设置 → 主题」|
| T4 | 900–1020px 右栏消失 | **已完成**：先加抽屉入口，2026-10-17 又把"退化成抽屉"的断点收到 860px；861–1020px 是常驻列 |
| T5 | 交叉引用卡片标题对齐 | 待复核：`.relation-row` 仍是 grid，但标题已改成 `.text-button` |
| T6 | 落地页标题对比度 | **已作废**：落地页已重做（晶体场景 → constellation / particle-field / stardust）|
| T7 | 窄屏标签条拥挤 | 待复核 |
| T8 | 知识页显示关键点与关键词 | **仍开放**：知识页只渲染了 `concepts`，`keyPoints` / `keywords` 还没露出来 |
| T9 | 右栏补齐上下文块 | **已完成**：入链 / 出链 / 未链接提及 / 编辑助理 四块已按规范落地，并带右边缘图标条入口 |
| T10 | 原始记录加编辑入口 | **已完成**：改成"点正文即改"（与知识页同一套手感），页面上的按钮已下线 |

### 还没做的两件

**T1. 线上补 `DEEPSEEK_API_KEY`（配置任务，不是代码任务）**

- 目标：让线上的 AI 能力可用。
- 操作：Netlify 站点 → Site configuration → Environment variables → 新增 `DEEPSEEK_API_KEY`（Production / Deploy Previews / Branch deploys 填同一个值）→ 保存后重新部署。
- 验收：线上新建一条原话 → 右栏「整理助手」点快捷词 → 出现审阅整理稿页面 → 确认后出现知识页。

**T8. 知识页显示关键点与关键词**

- 改哪里：`app/page.tsx` 的知识页详情，概念芯片那一行（`.tag-row`）；数据在 `detail.keyPoints` / `detail.keywords`，AI 草稿审阅页已经在编辑它们。
- 要做的：用与概念芯片**同一套视觉语言**展示这两类字段（不要新造一套样式）。
- 验收：造一张三类字段都有的知识页，详情里三类都能看到。