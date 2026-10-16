// 预置演示数据 —— 按 seed/demo-notes.json 幂等地写入知识库。
//
// 用法：
//   1) 另开终端 `pnpm dev`
//   2) `pnpm seed:demo`
//
// 打线上（给校赛截图用）：
//   SEED_BASE_URL=<部署地址> pnpm seed:demo
//
// 为什么走 HTTP 而不是直接写库：
//   一张知识页要同时写 raw_notes + notes + note_revisions 三处，还要满足
//   links_pair_idx 的唯一约束（重建同一关系必须"复活"而不是插入）。
//   这些不变量都封装在服务层里，裸 SQL 复刻一遍迟早会跟服务层脱节。
//   走接口 = 复用同一条写入路径，且与 scripts/regression.mjs 是同一个模式。
//
// 幂等：全部按 title 查找已有记录，存在就复用，不重复创建。
// 安全：只做创建与关联，不删除任何东西。可重复运行。

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const BASE = process.env.SEED_BASE_URL ?? process.env.REGRESSION_BASE_URL ?? "http://localhost:3000";
const here = dirname(fileURLToPath(import.meta.url));
const SEED_PATH = join(here, "..", "seed", "demo-notes.json");

const call = async (method, path, payload) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    ...(payload === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  return { status: res.status, body };
};

const created = { sources: 0, notes: 0, links: 0 };
const skipped = { sources: 0, notes: 0, links: 0 };
const problems = [];

const main = async () => {
  const seed = JSON.parse(await readFile(SEED_PATH, "utf8"));

  // ---- 0. 探活（区分"服务没起来"和"服务起来了但后端出错"）----
  let ping;
  try {
    ping = await call("GET", "/api/raw");
  } catch (err) {
    console.error(`\n✗ 连不上 ${BASE}（${err?.message ?? err}）`);
    console.error("  请先另开一个终端运行 `pnpm dev`，或用 SEED_BASE_URL 指定地址。\n");
    process.exitCode = 1;
    return;
  }
  if (ping.status >= 500) {
    console.error(`\n✗ ${BASE} 有响应，但后端报错（GET /api/raw → ${ping.status}）。`);
    console.error("  服务本身起来了，问题在数据这一层。按顺序查：");
    console.error("   1) `pnpm verify:db` —— 用一份干净的内存库跑迁移并检查表与约束");
    console.error("   2) 本地数据目录（默认 data/pglite）是否可写");
    console.error("   3) 看 dev server 终端的报错：迁移失败会打在那里");
    console.error("  注意：此时页面会显示「知识网络还没有内容」，那不是图谱的问题。\n");
    process.exitCode = 1;
    return;
  }
  if (ping.status !== 200) {
    console.error(`\n✗ 探活失败：GET /api/raw → ${ping.status}\n`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n目标：${BASE}\n`);

  // ---- 1. 现有数据，按 title 建索引（幂等的依据）----
  const [rawRes, knowRes, linkRes] = await Promise.all([
    call("GET", "/api/raw"),
    call("GET", "/api/knowledge"),
    call("GET", "/api/relations"),
  ]);
  const raws = rawRes.body?.raws ?? [];
  const knowledges = knowRes.body?.knowledges ?? [];
  const relations = linkRes.body?.relations ?? [];

  const rawByTitle = new Map(raws.map((r) => [r.title, r]));
  const knowledgeByTitle = new Map(knowledges.map((k) => [k.title, k]));
  const linkKey = (s, t) => `${s}→${t}`;
  const existingLinks = new Set(relations.map((r) => linkKey(r.sourceId, r.targetId)));

  console.log(`已有：${raws.length} 条原始记录 / ${knowledges.length} 条知识页 / ${relations.length} 条关联\n`);

  // ---- 2. 逐条写入 ----
  for (const note of seed.notes ?? []) {
    const title = note.title;
    const isDraftReady = Boolean(note.summary && note.summary.trim());

    // 2a. 原始记录
    let raw = rawByTitle.get(title);
    if (!raw) {
      const res = await call("POST", "/api/raw", { text: note.text, title });
      if (res.status !== 201 || !res.body?.raw) {
        problems.push(`原始记录「${title}」创建失败：HTTP ${res.status}`);
        continue;
      }
      raw = res.body.raw;
      rawByTitle.set(title, raw);
      created.sources += 1;
      console.log(`  + 原始记录  ${title}`);
    } else {
      skipped.sources += 1;
    }

    // 2b. 知识页 —— 只提升"已整理"的笔记。
    //     随手记（summary 为空）按设计意图停留在原始记录，不进知识页。
    if (!isDraftReady) {
      console.log(`  · 保留为原始记录（未整理）  ${title}`);
      continue;
    }
    if (knowledgeByTitle.has(title)) {
      skipped.notes += 1;
      continue;
    }
    const res = await call("POST", "/api/knowledge", {
      rawId: raw.id,
      origin: "user",
      draft: {
        title,
        summary: note.summary,
        content: note.text,
        keyPoints: note.keyPoints ?? [],
        concepts: note.concepts ?? [],
        keywords: note.keywords ?? [],
        relatedKnowledge: [],
      },
    });
    if ((res.status !== 201 && res.status !== 200) || !res.body?.knowledge) {
      problems.push(`知识页「${title}」创建失败：HTTP ${res.status} ${JSON.stringify(res.body)?.slice(0, 120)}`);
      continue;
    }
    knowledgeByTitle.set(title, res.body.knowledge);
    created.notes += 1;
    console.log(`  + 知识页    ${title}`);
  }

  // ---- 3. 关联 ----
  console.log("");
  for (const link of seed.links ?? []) {
    const source = knowledgeByTitle.get(link.from);
    const target = knowledgeByTitle.get(link.to);
    if (!source || !target) {
      problems.push(`关联「${link.from} → ${link.to}」跳过：知识页不存在`);
      continue;
    }
    if (existingLinks.has(linkKey(source.id, target.id))) {
      skipped.links += 1;
      continue;
    }
    const res = await call("POST", "/api/relations", {
      sourceId: source.id,
      targetId: target.id,
      type: "related",
      reason: link.reason,
    });
    if (res.status !== 201 && res.status !== 200) {
      problems.push(`关联「${link.from} → ${link.to}」创建失败：HTTP ${res.status}`);
      continue;
    }
    existingLinks.add(linkKey(source.id, target.id));
    created.links += 1;
    console.log(`  + 关联      ${link.from} → ${link.to}`);
  }

  // ---- 4. 汇总 ----
  const finalKnow = (await call("GET", "/api/knowledge")).body?.knowledges ?? [];
  const finalRel = (await call("GET", "/api/relations")).body?.relations ?? [];

  console.log(`\n新建：${created.sources} 条原始记录 / ${created.notes} 条知识页 / ${created.links} 条关联`);
  console.log(`跳过（已存在）：${skipped.sources} / ${skipped.notes} / ${skipped.links}`);
  console.log(`现在库里：${finalKnow.length} 条知识页 / ${finalRel.length} 条关联`);

  if (problems.length > 0) {
    console.log(`\n⚠️  ${problems.length} 处问题：`);
    for (const p of problems) console.log(`   - ${p}`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ 完成。打开 ${BASE} 的「知识网络」即可看到图谱。`);
    console.log("  演示意图：");
    for (const [k, v] of Object.entries(seed._设计意图 ?? {})) console.log(`    ${k}：${v}`);
  }
  console.log("");
};

main().catch((err) => {
  console.error("\n✗ 未预期的错误：", err);
  process.exitCode = 1;
});
