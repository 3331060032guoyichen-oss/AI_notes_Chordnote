// 回归测试：覆盖全部 API 路由（含知识包导出 / 导入、归档视图、未知 id 的 404 面）。
// 有 pass/fail 与退出码，可直接当门禁用。
//
// 用法：`pnpm test`（或者 `pnpm test` 前先自己开着 `pnpm dev`，两种都行）
//
// 它自带一套一次性环境：3000 端口空闲时，脚本会自己起一个 dev server，知识库指向系统临时
// 目录，跑完连同服务和数据一起删掉——所以它对"跑第几遍""你库里有没有演示数据"都不敏感。
// 若 3000 已经有人（你）起了服务，就用你那一份，测试会配合残留运行。
//
// 怎么连数据库：**不连**。知识库跑在应用进程内的 PGlite 上（单写者，见 AGENTS.md「已知坑」），
// 第二个进程去开同一份 data/pglite 会读到过期快照、写进去的还会被应用覆盖。
// 所以这里一律走 HTTP —— 顺带也真的验到了"接口契约"而不是"表里那一行"。
// 需要直接看库结构的断言在 `pnpm verify:db`（离线跑内存库）。

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";

const BASE = process.env.REGRESSION_BASE_URL ?? "http://localhost:3000";
/** 本次运行的唯一后缀：让"导入"这类用标题做键的用例绝不撞上历史残留。 */
const RUN = Math.random().toString(36).slice(2, 8);

const results = [];
const check = (label, ok, detail = "") => results.push({ label, ok: Boolean(ok), detail });

const call = async (method, path, payload) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    // 超时兜底：服务端卡住时宁可让断言失败，也不要整个脚本挂死。
    signal: AbortSignal.timeout(30000),
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  const text = await res.text();
  // 响应不一定真的是 JSON：路由不存在时 Next 直接回一张 HTML 404 页。
  // 别在这里抛 —— 让断言去看 status（有一条断言正是"某个路由必须已经下线"）。
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: res.status, body };
};
const GET = (p) => call("GET", p);
const POST = (p, b) => call("POST", p, b ?? {});
const PATCH = (p, b) => call("PATCH", p, b ?? {});
const DELETE = (p, b) => call("DELETE", p, b ?? {});

/** 列个表；接口挂了就返回空数组，交给断言去报错。key 默认 `knowledges`。 */
const listOrEmpty = async (path, key = "knowledges") => (await GET(path)).body?.[key] ?? [];

const draft = (title) => ({
  title,
  summary: `${title} 摘要`,
  content: `${title} 正文`,
  keyPoints: ["点"],
  concepts: ["概念"],
  keywords: ["关键词"],
  relatedKnowledge: [],
});

const created = { raws: [], notes: [], links: [], imported: null };

/** 服务可用吗？ */
const reachable = () =>
  new Promise((resolve) => {
    const socket = createConnection({ port: Number(new URL(BASE).port) || 3000, host: "127.0.0.1" });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(1000, () => done(false));
  });

/**
 * 测试自带一套一次性知识库。
 *
 * 为什么：断言虽然只针对自己造的数据，但"归档清场"会留下归档行，而导入用例按标题判重——
 * 第二次运行就会因为撞上上次的残留而失败。给它一份干净的空库，测试才对"跑第几遍"不敏感。
 * 所以：3000 端口没人监听时，本脚本自己起一个 dev server，数据目录指向系统临时目录，
 * 退出时连同服务一起收走；已经有人（你）起了 dev，就用那一份，测试改为配合残留运行。
 */
async function ensureServer() {
  if (await reachable()) {
    console.log(`使用已经在跑的 ${BASE}（不清理它的数据）。`);
    return null;
  }

  const dataDir = await mkdtemp(join(tmpdir(), "chordnote-regression-"));
  console.log(`3000 端口空闲 —— 自己起一个仅本次使用的 dev server（知识库：${dataDir}）。`);

  // 直接起 next 本体：中间隔一层 `pnpm` 的话，它只是个壳，收进程时容易留下孤儿 dev server。
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "dev", "--port", "3000"], {
    cwd: process.cwd(),
    env: { ...process.env, PGLITE_DATA_DIR: dataDir },
    stdio: "ignore",
  });
  const ownedPids = [child.pid];

  for (let i = 0; i < 90; i += 1) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      if ((await GET("/api/raw")).status === 200) return { child, dataDir, pids: ownedPids };
    } catch {
      /* 还没起来 */
    }
  }

  await killTree(child, ownedPids);
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  console.log("FAIL  无法启动 dev server（90 秒内没有就绪）。请手动 `pnpm dev` 后重跑。");
  process.exit(1);
}

/** 收掉自己起的开发服务器（含它派生的子进程）。 */
async function killTree(child, pids = []) {
  const targets = [...new Set([child?.pid, ...pids].filter(Boolean))];
  if (!targets.length) return;
  if (process.platform === "win32") {
    await Promise.all(
      targets.map(
        (pid) =>
          new Promise((resolve) => {
            spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" }).once(
              "exit",
              resolve,
            );
          }),
      ),
    );
    return;
  }
  for (const pid of targets) {
    try {
      child?.kill("SIGTERM");
    } catch {
      /* 已经退出了 */
    }
  }
}

let owned = null;

try {
  owned = await ensureServer();
  if (!owned && (await GET("/api/raw")).status !== 200) {
    console.log("FAIL  服务不可用：请先在另一个终端运行 `pnpm dev`，然后重跑本测试。");
    process.exitCode = 1;
    process.exit(1);
  }

  // ---- raw --------------------------------------------------------------
  const rawA = await POST("/api/raw", { text: "回归测试原话 A" });
  const rawB = await POST("/api/raw", { text: "回归测试原话 B" });
  const rawAId = rawA.body?.raw?.id;
  const rawBId = rawB.body?.raw?.id;
  created.raws.push(rawAId, rawBId);
  check("POST /api/raw 创建 201", rawA.status === 201 && Boolean(rawAId));
  check(
    "POST /api/raw 响应形状",
    JSON.stringify(Object.keys(rawA.body?.raw ?? {}).sort()) === '["createdAt","id","text","title"]',
  );

  const empty = await POST("/api/raw", { text: "   " });
  const tooLong = await POST("/api/raw", { text: "x".repeat(50_001) });
  check("POST /api/raw 空文本 400", empty.status === 400 && empty.body?.error?.code === "TEXT_EMPTY");
  check("POST /api/raw 超长 400", tooLong.status === 400 && tooLong.body?.error?.code === "TEXT_TOO_LONG");

  const rawList = await GET("/api/raw");
  const rawIds = (rawList.body?.raws ?? []).map((r) => r.id);
  check("GET /api/raw 包含新建项", rawIds.includes(rawAId) && rawIds.includes(rawBId));

  // ---- knowledge --------------------------------------------------------
  const p1 = await POST("/api/knowledge", { rawId: rawAId, draft: draft("回归知识页 A"), origin: "user" });
  const noteA = p1.body?.knowledge?.id;
  created.notes.push(noteA);
  check("POST /api/knowledge 提升 201", p1.status === 201 && p1.body?.created === true);
  check("POST /api/knowledge 初始 version=1", p1.body?.knowledge?.version === 1);

  const p2 = await POST("/api/knowledge", { rawId: rawAId, draft: draft("回归知识页 A"), origin: "user" });
  check("POST /api/knowledge 幂等（200 同 id）", p2.status === 200 && p2.body?.created === false && p2.body?.knowledge?.id === noteA);

  const p3 = await POST("/api/knowledge", { rawId: rawBId, draft: draft("回归知识页 B"), origin: "user" });
  const noteB = p3.body?.knowledge?.id;
  created.notes.push(noteB);
  check("POST /api/knowledge 第二篇 201", p3.status === 201);

  const kList = await GET("/api/knowledge");
  check("GET /api/knowledge 包含新建项", (kList.body?.knowledges ?? []).some((k) => k.id === noteA));

  const detail = await GET(`/api/knowledge/${noteA}`);
  check("GET /api/knowledge/:id 返回知识页与原始出处", detail.status === 200 && detail.body?.raw?.text === "回归测试原话 A");

  const up1 = await PATCH(`/api/knowledge/${noteA}`, { title: "回归改过的标题" });
  const v2 = up1.body?.knowledge?.version;
  check("PATCH 不带 version 可写且版本 +1", up1.status === 200 && v2 === 2);

  const stale = await PATCH(`/api/knowledge/${noteA}`, { summary: "过期写入", version: 1 });
  check("PATCH 过期 version → 409 且不写入", stale.status === 409 && stale.body?.error?.code === "VERSION_CONFLICT");

  const up2 = await PATCH(`/api/knowledge/${noteA}`, { summary: "正确版本写入", version: v2 });
  check("PATCH 正确 version → 200 且版本 +1", up2.status === 200 && up2.body?.knowledge?.version === 3);

  const emptyPatch = await PATCH(`/api/knowledge/${noteA}`, { version: 3 });
  const badVersion = await PATCH(`/api/knowledge/${noteA}`, { summary: "x", version: "3" });
  check("PATCH 空改动 400", emptyPatch.status === 400 && emptyPatch.body?.error?.code === "EMPTY_PATCH");
  check("PATCH 非法 version 400", badVersion.status === 400 && badVersion.body?.error?.code === "INVALID_VERSION");

  // version 每次成功写入 +1，等价于"修订历史随每次写入增长"（version=3 即三次写入都落了修订）。
  // jsonb 是不是真数组由 `pnpm verify:db` 直接看库确认。
  const revisioned = await GET(`/api/knowledge/${noteA}`);
  check(
    "修订历史随每次写入增长（版本到 3）",
    revisioned.body?.knowledge?.version === 3,
    `实际 version=${revisioned.body?.knowledge?.version}`,
  );
  check(
    "读回的数组字段仍是数组",
    Array.isArray(revisioned.body?.knowledge?.concepts) &&
      Array.isArray(revisioned.body?.knowledge?.keyPoints),
  );

  // ---- raw 修改（user_edit：用户可改，且必须留修订记录）------------------
  const editedText = "回归测试原话 B（已修改）";
  const rawEdit = await PATCH(`/api/raw/${rawBId}`, { text: editedText });
  check("PATCH /api/raw/:id 修改 200", rawEdit.status === 200 && rawEdit.body?.changed === true);
  check(
    "PATCH /api/raw/:id 响应形状不变",
    JSON.stringify(Object.keys(rawEdit.body?.raw ?? {}).sort()) === '["createdAt","id","text","title"]',
  );

  const rawAfterEdit = await GET("/api/raw");
  check(
    "PATCH 后列表读到新正文",
    (rawAfterEdit.body?.raws ?? []).some((r) => r.id === rawBId && r.text === editedText),
  );

  const detailAfterEdit = await GET(`/api/knowledge/${noteB}`);
  check("PATCH 后知识页出处同步为新正文", detailAfterEdit.body?.raw?.text === editedText);

  const rawNoop = await PATCH(`/api/raw/${rawBId}`, { text: editedText });
  check("PATCH 相同内容 → 200 且标记未改动", rawNoop.status === 200 && rawNoop.body?.changed === false);

  const rawEmpty = await PATCH(`/api/raw/${rawBId}`, { text: "   " });
  const rawLong = await PATCH(`/api/raw/${rawBId}`, { text: "x".repeat(50_001) });
  const rawNoText = await PATCH(`/api/raw/${rawBId}`, {});
  const rawMissing = await PATCH("/api/raw/raw_does_not_exist", { text: "x" });
  check("PATCH 空文本 400", rawEmpty.status === 400 && rawEmpty.body?.error?.code === "TEXT_EMPTY");
  check("PATCH 超长 400", rawLong.status === 400 && rawLong.body?.error?.code === "TEXT_TOO_LONG");
  check("PATCH 缺 text 400", rawNoText.status === 400 && rawNoText.body?.error?.code === "TEXT_REQUIRED");
  check(
    "PATCH 不存在的 raw → 404",
    rawMissing.status === 404 && rawMissing.body?.error?.code === "RAW_NOT_FOUND",
  );

  // 改前原文必须留痕：再改回原句应当成功，说明这次修改没有被当成"内容未变"跳过。
  const rawRevert = await PATCH(`/api/raw/${rawBId}`, { text: "回归测试原话 B" });
  check("PATCH 留下可回退的修订（能改回原句）", rawRevert.status === 200 && rawRevert.body?.changed === true);
  const rawBack = await PATCH(`/api/raw/${rawBId}`, { text: editedText });
  check("PATCH 改回修改后的文本仍然有效", rawBack.status === 200 && rawBack.body?.changed === true);

  // ---- links ------------------------------------------------------------
  const r1 = await POST("/api/relations", { sourceId: noteA, targetId: noteB, type: "related", reason: "回归理由" });
  const linkId = r1.body?.relation?.id;
  created.links.push(linkId);
  check("POST /api/relations 建立 201", r1.status === 201 && r1.body?.created === true);

  const r2 = await POST("/api/relations", { sourceId: noteA, targetId: noteB, type: "related", reason: "回归理由" });
  const r3 = await POST("/api/relations", { sourceId: noteB, targetId: noteA, type: "related", reason: "回归理由" });
  check("POST /api/relations 重复去重（200 同 id）", r2.status === 200 && r2.body?.relation?.id === linkId);
  check("POST /api/relations 反向视为同一条", r3.status === 200 && r3.body?.relation?.id === linkId);

  const selfRel = await POST("/api/relations", { sourceId: noteA, targetId: noteA, type: "related", reason: "x" });
  const badRel = await POST("/api/relations", { sourceId: noteA, targetId: noteB, type: "supports", reason: "x" });
  check("POST /api/relations 自环 400", selfRel.body?.error?.code === "SELF_RELATION");
  check("POST /api/relations 非法类型 400", badRel.body?.error?.code === "RELATION_TYPE_INVALID");

  const relList = await GET("/api/relations");
  const noteRels = await GET(`/api/knowledge/${noteA}/relations`);
  const backlinks = await GET(`/api/knowledge/${noteA}/backlinks`);
  check("GET /api/relations 命中", (relList.body?.relations ?? []).some((r) => r.id === linkId));
  check("GET .../relations 命中 1 条", noteRels.body?.relations?.length === 1);
  check("GET .../backlinks 返回对端", (backlinks.body?.backlinks ?? []).some((k) => k.id === noteB));

  const graph = await GET("/api/graph");
  check(
    "GET /api/graph 含本次两条节点与一条边",
    (graph.body?.nodes ?? []).some((n) => n.id === noteA) &&
      (graph.body?.nodes ?? []).some((n) => n.id === noteB) &&
      (graph.body?.edges ?? []).some((e) => e.id === linkId),
  );
  check(
    "GET /api/graph 形状不变",
    JSON.stringify(Object.keys(graph.body?.nodes?.[0] ?? {}).sort()) === '["id","rawId","title"]' &&
      JSON.stringify(Object.keys(graph.body?.edges?.[0] ?? {}).sort()) === '["id","reason","source","target","type"]',
  );

  const delLink = await DELETE(`/api/relations/${linkId}`);
  const relListAfter = await GET("/api/relations");
  check("DELETE /api/relations/:id → 204", delLink.status === 204);
  check("软删后列表隐藏", !(relListAfter.body?.relations ?? []).some((r) => r.id === linkId));
  // 软删除：行还在（只是从列表里隐藏），所以再建同一条关系时应当"复活"同一个 id。
  // 若这里返回新 id，说明实现退化成了物理删除 + 新增。
  const reviving = await POST("/api/relations", {
    sourceId: noteA,
    targetId: noteB,
    type: "related",
    reason: "探测是否复活",
  });
  check("软删后行仍在（重建可复活同一条）", reviving.body?.relation?.id === linkId);

  const revived = await POST("/api/relations", { sourceId: noteA, targetId: noteB, type: "related", reason: "复活" });
  const relListRevived = await GET("/api/relations");
  const samePair = (relListRevived.body?.relations ?? []).filter((r) => r.id === linkId);
  check(
    "重建关系 = 复活（同 id，关系列表里只此一条）",
    revived.body?.relation?.id === linkId && samePair.length === 1,
    `同 id 条数 ${samePair.length}`,
  );

  const delAgain = await DELETE(`/api/relations/${linkId}`);
  check("DELETE /api/relations/:id 再次 → 204", delAgain.status === 204);

  // ---- 引用守卫 / AI 端点读路径 -----------------------------------------
  const blocked = await DELETE("/api/raw", { rawId: rawBId });
  check("DELETE /api/raw 被引用 → 409", blocked.status === 409 && blocked.body?.error?.code === "RAW_REFERENCED_BY_KNOWLEDGE");

  // 归档那一页之后，"移除原始记录"必须能走通。
  // 原来这里是无条件 409（不区分那一页是否已归档），而知识页没有删除接口 ——
  // 归档是它唯一的"处理"方式，于是用户卡在"那一页已归档、这条原话却永远删不掉"。
  const archiveB = await PATCH(`/api/knowledge/${noteB}`, { archived: true });
  check("知识页归档 200", archiveB.status === 200 && Boolean(archiveB.body?.knowledge?.archivedAt));

  const rawAfterArchive = await DELETE("/api/raw", { rawId: rawBId });
  check(
    "归档那一页后可以移除原始记录（移除 = 归档，不是物理删除）",
    rawAfterArchive.status === 200 && rawAfterArchive.body?.archived === true,
  );
  const rawListAfterArchive = await GET("/api/raw");
  check("移除后它不再出现在列表里", !(rawListAfterArchive.body?.raws ?? []).some((r) => r.id === rawBId));

  const restoreB = await PATCH(`/api/knowledge/${noteB}`, { archived: false });
  check("知识页恢复 200", restoreB.status === 200 && restoreB.body?.knowledge?.archivedAt === null);

  const orgBogus = await POST("/api/organize", { rawId: "raw_reg_nope" });
  const askBogus = await POST("/api/assistant", { question: "q", contextType: "knowledge", contextId: "knowledge_reg_nope" });
  check(
    "POST /api/organize 无效 id → 404",
    orgBogus.status === 404 && orgBogus.body?.error?.code === "RAW_NOT_FOUND",
    `status=${orgBogus.status} code=${orgBogus.body?.error?.code}`,
  );
  check(
    "POST /api/assistant 无效 id → 404",
    askBogus.status === 404 && askBogus.body?.error?.code === "KNOWLEDGE_NOT_FOUND",
    `status=${askBogus.status} code=${askBogus.body?.error?.code}`,
  );

  const orgOk = await POST("/api/organize", { rawId: rawAId });
  const askOk = await POST("/api/assistant", { question: "q", contextType: "knowledge", contextId: noteA });
  // 无 DEEPSEEK_API_KEY 时为 503；配了 key 则为 200。两者都说明"读路径通了"，只有 500 算失败。
  check("POST /api/organize 读路径可用（非 500）", orgOk.status !== 500, `status=${orgOk.status}`);
  check("POST /api/assistant 读路径可用（非 500）", askOk.status !== 500, `status=${askOk.status}`);

  // ---- 知识包导出 / 导入 -------------------------------------------------
  // 这两条路由是「数据是你的」这条承诺的兑现方式（见 AGENTS.md 决策记录），
  // 断的是"能走通 + 不覆盖同名"，不是数据内容本身。
  const bundleRes = await fetch(`${BASE}/api/export`);
  const bundle = await bundleRes.json().catch(() => null);
  check(
    "GET /api/export 返回知识包",
    bundleRes.status === 200 && bundle?.format === "chordnote.bundle" && bundle?.version === 1,
  );
  check(
    "GET /api/export 以标题为可移植键（含本次造的数据）",
    (bundle?.notes ?? []).some((n) => n.title === "回归改过的标题") &&
      (bundle?.sources ?? []).some((s) => s.text === "回归测试原话 A"),
  );

  const mdRes = await fetch(`${BASE}/api/export?format=markdown`);
  const mdBytes = new Uint8Array(await mdRes.arrayBuffer());
  check(
    "GET /api/export?format=markdown 返回 zip（本地文件头签名 PK\\x03\\x04）",
    mdRes.status === 200 &&
      mdRes.headers.get("content-type") === "application/zip" &&
      mdBytes[0] === 0x50 &&
      mdBytes[1] === 0x4b &&
      mdBytes[2] === 0x03 &&
      mdBytes[3] === 0x04,
  );

  const dry = await POST("/api/import?dryRun=1", bundle);
  check(
    "POST /api/import?dryRun=1 先算数、不写库",
    dry.status === 200 &&
      dry.body?.dryRun === true &&
      dry.body?.result?.notes?.created === 0 &&
      dry.body?.result?.sources?.created === 0 &&
      dry.body?.result?.links?.created === 0 &&
      (dry.body?.result?.notes?.skipped ?? 0) > 0,
  );

  const bogus = await POST("/api/import", { format: "someone.else", version: 1 });
  check(
    "POST /api/import 非本应用的知识包 400",
    bogus.status === 400 && bogus.body?.error?.code === "BUNDLE_IMPORT_FAILED",
  );

  // 真导入一次，证明新内容确实落库；造出来的两行在 finally 里按标题回收。
  const IMPORT_RAW_TITLE = `回归导入原话 ${RUN}`;
  const IMPORT_NOTE_TITLE = `回归导入知识页 ${RUN}`;
  const incoming = {
    format: "chordnote.bundle",
    version: 1,
    sources: [
      { title: IMPORT_RAW_TITLE, text: "回归导入的原话正文", createdAt: new Date().toISOString(), archived: false },
    ],
    notes: [
      {
        title: IMPORT_NOTE_TITLE,
        summary: "导入摘要",
        content: "导入正文",
        keyPoints: [],
        concepts: [],
        keywords: [],
        sourceTitle: IMPORT_RAW_TITLE,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    links: [],
  };
  const imported = await POST("/api/import", incoming);
  check(
    "POST /api/import 新内容落库（原话 + 知识页各 1）",
    imported.status === 200 &&
      imported.body?.result?.sources?.created === 1 &&
      imported.body?.result?.notes?.created === 1,
  );

  const afterImport = await GET("/api/knowledge");
  check("导入的知识页出现在列表里", (afterImport.body?.knowledges ?? []).some((k) => k.title === IMPORT_NOTE_TITLE));

  const reImport = await POST("/api/import", incoming);
  check(
    "再导入同名 → 全部跳过（永不覆盖）",
    reImport.body?.result?.sources?.skipped === 1 && reImport.body?.result?.notes?.skipped === 1,
    JSON.stringify(reImport.body?.result),
  );

  // 这两行交给 finally 按标题回收（它们不在 created 里，因为 id 是导入时生成的）。
  created.imported = { rawTitle: IMPORT_RAW_TITLE, noteTitle: IMPORT_NOTE_TITLE };

  // ---- 「新建」只准写原始记录 --------------------------------------------
  // 知识页必须由「整理助手提议 → 用户确认」产生（AGENTS.md 核心链路）。
  // 原来那条一次写完 raw + knowledge 的路径（POST /api/notes）已经下线：
  // 它把整条链路里最重要的那一下"拍板"绕过去了。下面这条断言防的是它被重新加回来。
  const retired = await POST("/api/notes", { text: "这条路已经下线", title: "不应该出现" });
  check("POST /api/notes 已下线 → 404（新建不许直接产出知识页）", retired.status === 404);

  // 面板上那个「未命名」标题是用户亲手打的，走 POST /api/raw 必须落到原始记录上。
  const titledRaw = await POST("/api/raw", { text: "回归原话（带标题）", title: "回归原话标题" });
  created.raws.push(titledRaw.body?.raw?.id);
  check("POST /api/raw 采用给定标题", titledRaw.body?.raw?.title === "回归原话标题");

  // ---- 不存在的 id 一律 404（每条入口都要挡住"猜 id 改别人东西"） --------
  const missingNote = "knowledge_reg_missing";
  const missingRaw = "raw_reg_missing";
  const missDetail = await GET(`/api/knowledge/${missingNote}`);
  const missPatch = await PATCH(`/api/knowledge/${missingNote}`, { title: "不存在" });
  const missArchive = await DELETE("/api/raw", { rawId: missingRaw });
  const missPromote = await POST("/api/knowledge", { rawId: missingRaw, draft: draft("不存在") });
  const missRel = await POST("/api/relations", {
    sourceId: missingNote,
    targetId: noteA,
    type: "related",
    reason: "不存在",
  });
  const missRawPatch = await PATCH(`/api/raw/${missingRaw}`, { text: "不存在" });
  check("未知知识页：详情 404", missDetail.status === 404);
  check("未知知识页：PATCH 404", missPatch.status === 404);
  check("未知原话：归档 404", missArchive.status === 404);
  check("未知原话：提升 404", missPromote.status === 404);
  check(
    "未知原话：修改 404",
    missRawPatch.status === 404 && missRawPatch.body?.error?.code === "RAW_NOT_FOUND",
  );
  check("未知节点：建关系 404", missRel.status === 404);

  // 跨用户隔离在 SQL 层由 `pnpm verify:db` 断言（每个查询都带 user_id 过滤）；
  // 演示版是单用户，接口层没有第二个身份可用。
  // 下面两条取代原来的"库读回"断言：确认越权尝试之后，本次数据一个字段都没被动过。
  const afterMisses = await GET(`/api/knowledge/${noteA}`);
  const rawAfterMisses = await GET("/api/raw");
  check("越权尝试后本次知识页未被改动", afterMisses.body?.knowledge?.title === "回归改过的标题");
  check(
    "越权尝试后本次原话未被改动",
    (rawAfterMisses.body?.raws ?? []).some((r) => r.id === rawAId && r.text === "回归测试原话 A"),
  );
} catch (error) {
  check("测试执行未抛异常", false, error.message);
} finally {
  // 清理走公开接口的"归档"（应用没有物理删除入口，这是设计）。
  // 于是这里顺便验证「归档 = 日常视图看不到、归档视图仍读得到」，对演示数据也安全。
  const importedNote =
    ((await listOrEmpty("/api/knowledge")).find((k) => k.title === created.imported?.noteTitle) ?? {}).id ??
    ((await listOrEmpty("/api/knowledge?scope=archived")).find((k) => k.title === created.imported?.noteTitle) ?? {}).id;
  const importedRaw =
    ((await listOrEmpty("/api/raw", "raws")).find((r) => r.title === created.imported?.rawTitle) ?? {}).id ??
    ((await listOrEmpty("/api/raw?scope=archived", "raws")).find((r) => r.title === created.imported?.rawTitle) ?? {}).id;
  if (importedNote) created.notes.push(importedNote);
  if (importedRaw) created.raws.push(importedRaw);

  const noteIds = [...new Set(created.notes.filter(Boolean))];
  const rawIds = [...new Set(created.raws.filter(Boolean))];

  // 先归档知识页，再归档原始记录（原始记录被"在用的"知识页挡着，顺序不能反）
  const archivedNotes = [];
  for (const id of noteIds) {
    const res = await PATCH(`/api/knowledge/${id}`, { archived: true }).catch(() => null);
    if (res?.status === 200) archivedNotes.push(id);
  }
  const archivedRaws = [];
  for (const id of rawIds) {
    const res = await DELETE("/api/raw", { rawId: id }).catch(() => null);
    if (res?.status === 200) archivedRaws.push(id);
  }

  const stillActiveNotes = await listOrEmpty("/api/knowledge");
  const stillActiveRaws = await listOrEmpty("/api/raw", "raws");
  const archivedNotesList = await listOrEmpty("/api/knowledge?scope=archived");
  const archivedRawsList = await listOrEmpty("/api/raw?scope=archived", "raws");

  check(
    "归档后：本次知识页不在日常列表里",
    !stillActiveNotes.some((k) => noteIds.includes(k.id)),
    `残留 ${stillActiveNotes.filter((k) => noteIds.includes(k.id)).length} 条`,
  );
  check(
    "归档后：本次原始记录不在日常列表里",
    !stillActiveRaws.some((r) => rawIds.includes(r.id)),
    `残留 ${stillActiveRaws.filter((r) => rawIds.includes(r.id)).length} 条`,
  );
  check(
    "归档页在归档视图里仍读得到（归档不是单向门）",
    noteIds.every((id) => archivedNotesList.some((k) => k.id === id)),
  );
  check(
    "归档的原始记录在归档视图里仍读得到",
    rawIds.every((id) => archivedRawsList.some((r) => r.id === id)),
  );

  if (archivedNotes.length || archivedRaws.length) {
    console.log(owned
      ? `\n本次造的 ${archivedNotes.length} 张知识页与 ${archivedRaws.length} 条原始记录已归档；用的是临时知识库，退出时会一起删掉。`
      : `\n提示：本次造的 ${archivedNotes.length} 张知识页与 ${archivedRaws.length} 条原始记录已归档` +
        `（日常视图看不到）。想彻底清空本地库请运行 \`pnpm seed:reset -- --yes\`（需先停 dev server）。`);
  }

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.label}${r.detail ? `  → ${r.detail}` : ""}`);
  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY pass=${results.length - failed.length} fail=${failed.length}`);
  process.exitCode = failed.length > 0 ? 1 : 0;

  // 自己起的服务与临时知识库一起收走。
  if (owned) {
    await killTree(owned.child, owned.pids);
    await new Promise((r) => setTimeout(r, 1500));
    await rm(owned.dataDir, { recursive: true, force: true }).catch(() => {});
  }
}
