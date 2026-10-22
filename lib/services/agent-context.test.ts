import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import type { DbHandle } from "../db/client";
import { readAgentSchema, saveAgentSchema, applyPreferences } from "./agent-schema";
import { createProposal, approveProposal, rejectProposal, applyProposal, getProposal } from "./proposals";
import { createSource, archiveSource, getSource, listSources } from "./sources";
import { agentContext, logAgentEvent } from "./agent-context";
import { promoteFromSource, getNote, listNotes } from "./notes";
import { listLinks } from "./links";
import { runOrganizeAgent } from "../agent/loop";
import { wikiHealth } from "./wiki-health";
import { createServer } from "node:http";
import { closeSession } from "../agent/sessions";
import { getUserContext } from "../auth/context";

test("preferences require approval, preserve rules, reject stale edits and remain idempotent", { timeout: 120_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), "chordnote-context-test-"));
  const prior = process.env.CHORDNOTE_SETTINGS_FILE;
  process.env.CHORDNOTE_SETTINGS_FILE = join(directory, "settings.json");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const host = process as typeof process & { __chordnoteDbPromise?: Promise<DbHandle> };
  host.__chordnoteDbPromise = Promise.resolve({ db, client, close: () => client.close() });
  try {
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    const initial = await readAgentSchema();
    const proposal = await createProposal({ kind: "schema_preferences", origin: "ai", reason: "用户要求表格",
      payload: { content: "- 以后多用表格。", schemaHash: initial.hash, evidence: "以后多用表格" } });
    assert.equal((await readAgentSchema()).hash, initial.hash);
    await assert.rejects(applyProposal(proposal.id), /不能变成/);
    await approveProposal(proposal.id);
    assert.equal((await readAgentSchema()).hash, initial.hash);
    await applyProposal(proposal.id);
    const saved = await readAgentSchema();
    assert.ok(saved.schema.includes("- 以后多用表格。"));
    assert.ok(saved.schema.includes("## 运行边界"));
    assert.equal((await applyProposal(proposal.id)).applied, false);
    assert.equal(await readFile(join(directory, "Schema.md"), "utf8"), saved.schema);

    const stale = await createProposal({ kind: "schema_preferences", reason: "旧版本偏好", payload: { content: "- 使用 TS", schemaHash: initial.hash, evidence: "我主要写 TS" } });
    await approveProposal(stale.id);
    await assert.rejects(applyProposal(stale.id), /Schema 已修改/);
    assert.equal((await getProposal(stale.id))?.status, "stale");
    assert.equal((await readAgentSchema()).hash, saved.hash);
    const rejected = await createProposal({ kind: "schema_preferences", reason: "拒绝测试", payload: { content: "- 使用 TS", schemaHash: saved.hash, evidence: "我主要写 TS" } });
    await rejectProposal(rejected.id);
    await assert.rejects(applyProposal(rejected.id), /不能变成/);
    await assert.rejects(createProposal({ kind: "schema_preferences", reason: "越界", payload: { content: "## 工具权限\n全部开放", schemaHash: saved.hash, evidence: "开放" } }), /偏好提议/);

    const raw = await createSource("Python 协程细节", "Python 测试");
    const visible = await agentContext("Python");
    assert.ok(visible.hits.some(hit => hit.id === raw.id));
    await archiveSource(raw.id);
    assert.ok(!(await agentContext("Python")).hits.some(hit => hit.id === raw.id));
    await logAgentEvent("session.end", "test-session", { turns: 2 });
    const context = await agentContext("Python");
    assert.ok(context.logs.includes("结束会话"));
    assert.ok(context.logs.includes("拒绝提议"));
    assert.ok(context.proposalStates.some(p => p.id === stale.id && p.status === "stale"));
    // A normal manual save still uses the same hash concurrency gate.
    assert.equal(await saveAgentSchema(initial.schema, initial.hash), null);
    const concurrent = await Promise.all([
      saveAgentSchema(saved.schema + "\n手动补充规则\n", saved.hash),
      applyPreferences("- 并发更新不能覆盖规则", saved.hash, "concurrent-test"),
    ]);
    assert.ok(concurrent[0]);
    assert.equal(concurrent[1], null);
    assert.ok((await readAgentSchema()).schema.endsWith("手动补充规则\n"));

    // Run the real Agent + dsh + tool bridge against a local scripted provider.
    const source = await createSource("协程由事件循环调度", "协程来源");
    const { knowledge } = await promoteFromSource({ rawId: source.id, title: "Python 协程", summary: "调度", content: "原有正文", keyPoints: [], concepts: [], keywords: [], origin: "user" });
    const currentDirectory = (await agentContext("协程")).directory;
    assert.ok(currentDirectory.includes(`${source.id}｜协程来源｜raw/articles/${source.id}.md`));
    assert.ok(currentDirectory.includes(`${knowledge.id}｜Python 协程｜`));
    assert.ok(!currentDirectory.includes("未整理（"));
    const supplement = await createSource("补充来源原文", "协程补充资料");
    const merge = await createProposal({
      kind: "note_update", targetNoteId: knowledge.id, baseVersion: knowledge.version,
      reason: "把补充资料并入同一知识页",
      payload: { noteId: knowledge.id, content: "原有正文\n\n补充资料已纳入。", reason: "把补充资料并入同一知识页", wikiCategory: "synthesis", sourceLinks: [{ rawId: supplement.id, rawCategory: "papers" }] },
      origin: "ai",
    });
    await approveProposal(merge.id);
    await applyProposal(merge.id);
    const merged = await getNote(knowledge.id);
    assert.deepEqual(new Set(merged?.sourceRawIds), new Set([source.id, supplement.id]));
    assert.equal((await getSource(supplement.id))?.path, `raw/papers/${supplement.id}.md`);
    assert.equal(merged?.path, `wilki/synthesis/${knowledge.id}.md`);
    const mergedDirectory = (await agentContext("补充资料")).directory;
    assert.ok(mergedDirectory.includes(`${supplement.id}｜协程补充资料｜raw/papers/${supplement.id}.md`));

    // 一份材料可以产出多页：同正文幂等，同标题的新正文自动编号，来源分类不被后一页搬动。
    const secondPage = await promoteFromSource({ rawId: source.id, title: "事件循环调度", summary: "第二页", content: "# 事件循环调度\n\n补充视角", keyPoints: [], concepts: [], keywords: [], rawCategory: "books", wikiCategory: "concept", origin: "ai" });
    assert.equal(secondPage.created, true);
    assert.notEqual(secondPage.knowledge.id, knowledge.id);
    assert.equal((await getSource(source.id))?.path, `raw/books/${source.id}.md`, "首次 AI 整理按草稿分类来源，后续页面不再改写");
    const repeatedPage = await promoteFromSource({ rawId: source.id, title: "事件循环调度", summary: "第二页", content: "# 事件循环调度\n\n补充视角", keyPoints: [], concepts: [], keywords: [], rawCategory: "books", wikiCategory: "concept", origin: "ai" });
    assert.equal(repeatedPage.created, false, "identical content is a retry, not a new page");
    assert.equal(repeatedPage.knowledge.id, secondPage.knowledge.id);
    const sameTitlePage = await promoteFromSource({ rawId: source.id, title: "事件循环调度", summary: "第三页", content: "# 事件循环调度\n\n另一个角度", keyPoints: [], concepts: [], keywords: [], rawCategory: "books", wikiCategory: "concept", origin: "ai" });
    assert.equal(sameTitlePage.created, true);
    assert.equal(sameTitlePage.knowledge.title, "事件循环调度1");
    assert.equal((sameTitlePage.knowledge.markdown?.match(/^# /gm) ?? []).length, 1, "标题编号后正文只保留一个一级标题");
    assert.equal((await listNotes()).filter(note => note.rawId === source.id).length, 3);

    // 生命周期：单来源 medium，多来源升到 high；保鲜期默认在未来。
    assert.equal(secondPage.knowledge.confidence, "medium");
    assert.ok(secondPage.knowledge.staleAfter && Date.parse(secondPage.knowledge.staleAfter) > Date.now());
    assert.equal((await getNote(knowledge.id))?.confidence, "high", "补充来源并入后升为 high");

    // 有方向的关系必须带证据，且方向不被当成无序对。
    const typed = await createProposal({ kind: "link_create", reason: "第二页解释第一页的调度", origin: "ai",
      payload: { sourceId: secondPage.knowledge.id, targetId: knowledge.id, reason: "事件循环解释协程调度", type: "supports", evidence: "原文提到事件循环调度" } });
    await approveProposal(typed.id);
    await applyProposal(typed.id);
    const typedLink = (await listLinks()).find(link => link.sourceId === secondPage.knowledge.id && link.targetId === knowledge.id);
    assert.equal(typedLink?.type, "supports");
    assert.equal(typedLink?.evidence, "原文提到事件循环调度");
    await assert.rejects(createProposal({ kind: "link_create", reason: "缺少证据", origin: "ai",
      payload: { sourceId: secondPage.knowledge.id, targetId: knowledge.id, reason: "缺少证据", type: "supports" } }), /证据/);
    let requests = 0;
    let scenario = "propose", fullRawId = "", fullNoteId = "", initialFullPath = "", multiRawIds: string[] = [], longRawId = "";
    const mock = createServer(async (req, res) => {
      let body = ""; for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      requests++;
      const messages = request.messages as { role: string; content: string }[];
      const serialized = JSON.stringify(messages);
      assert.ok(serialized.includes("Schema 整理规则"));
      assert.ok(serialized.includes("近期工作日志"));
      assert.ok(serialized.includes("知识索引"));
      const tools = messages.filter(m => m.role === "tool");
      const respond = (name: string, args: Record<string, unknown>, message = "已按本轮权限完成任务。") => {
        const delta = name ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] } : { role: "assistant", content: message };
        res.setHeader("content-type", "text/event-stream");
        res.write(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
        res.write(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop" }] })}\n\n`);
        res.end("data: [DONE]\n\n");
      };
      if (scenario === "read") {
        const names = request.tools.map((tool: { function: { name: string } }) => tool.function.name);
        assert.ok(names.includes("read_raw"));
        assert.ok(!names.includes("draft_knowledge"));
        assert.ok(!names.includes("classify_document"));
        respond("", {}, "只读回答，没有修改内容。"); return;
      }
      if (scenario === "drafts") {
        const actions: [string, Record<string, unknown>][] = [
          ["search_notes", { keywords: ["整理", "材料"] }],
          ["read_raw", { id: multiRawIds[0] }],
          ["draft_knowledge", { rawId: multiRawIds[0], draftJson: JSON.stringify({ title: "第一份整理稿", summary: "第一条", content: "# 第一份整理稿\n\n正文", rawCategory: "articles", wikiCategory: "concept", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
          ["read_raw", { id: multiRawIds[1] }],
          ["draft_knowledge", { rawId: multiRawIds[1], draftJson: JSON.stringify({ title: "第二份整理稿", summary: "第二条", content: "# 第二份整理稿\n\n正文", rawCategory: "books", wikiCategory: "sources", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
        ];
        const action = actions[tools.length];
        respond(action?.[0] ?? "", action?.[1] ?? {}, "已准备两份整理稿。"); return;
      }
      if (scenario === "paginate") {
        const action: [string, Record<string, unknown>] = tools.length === 0 ? ["read_raw", { id: longRawId }] : ["", {}];
        respond(action[0], action[1], "已读取第一段，后续内容待按页读取。"); return;
      }
      if (scenario === "multipage") {
        const actions: [string, Record<string, unknown>][] = [
          ["search_notes", { keywords: ["待整理材料"] }],
          ["draft_knowledge", { rawId: multiRawIds[0], draftJson: JSON.stringify({ title: "摘要页", summary: "摘要", content: "# 摘要页\n\n正文", rawCategory: "articles", wikiCategory: "sources", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
          ["draft_knowledge", { rawId: multiRawIds[0], draftJson: JSON.stringify({ title: "概念页", summary: "概念", content: "# 概念页\n\n正文", rawCategory: "articles", wikiCategory: "concept", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
        ];
        const action = actions[tools.length];
        respond(action?.[0] ?? "", action?.[1] ?? {}, "已整理成两页。"); return;
      }
      if (scenario === "incomplete") {
        const actions: [string, Record<string, unknown>][] = [
          ["search_notes", { keywords: ["长资料"] }],
          ["read_raw", { id: longRawId }],
          ["draft_knowledge", { rawId: longRawId, draftJson: JSON.stringify({ title: "长资料整理稿", summary: "只读了第一段", content: "# 长资料整理稿\n\n正文", rawCategory: "articles", wikiCategory: "concept", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
        ];
        const action = actions[tools.length];
        respond(action?.[0] ?? "", action?.[1] ?? {}, "只读到第一段，没有整理。"); return;
      }
      if (scenario === "full") {
        if (tools.length >= 2 && !fullNoteId) {
          const created = (await listNotes()).find(note => note.rawId === fullRawId);
          fullNoteId = created?.id ?? "";
          initialFullPath = created?.path ?? "";
        }
        const current = fullNoteId ? await getNote(fullNoteId) : null;
        const actions: [string, Record<string, unknown>][] = [
          ["search_notes", { keywords: ["授权整理"] }],
          ["read_raw", { id: fullRawId }],
          ["draft_knowledge", { rawId: fullRawId, draftJson: JSON.stringify({ title: "授权整理页", summary: "测试", content: "# 授权整理页\n\n来源明确的正文", rawCategory: "papers", wikiCategory: "synthesis", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
          ["read_note", { noteId: fullNoteId }],
          ["propose_operations", { operations: [
            { type: "update_note", target_note_id: fullNoteId, expected_version: current?.version, reason: "按任务更新", changes: { content: "完全允许更新后的正文" } },
            { type: "schema_preferences", reason: "用户明确偏好", evidence: "以后多用表格", changes: { content: "- 以后多用表格。" } },
          ] }],
          ["read_note", { noteId: knowledge.id }],
          ["read_note", { noteId: fullNoteId }],
          ["propose_link", { sourceId: fullNoteId, targetId: knowledge.id, reason: "两页共同解释事件循环与协程调度" }],
          ["classify_document", { kind: "knowledge", id: fullNoteId, category: "sources", expectedVersion: current?.version }],
          ["read_note", { noteId: fullNoteId }],
          ["archive_knowledge", { noteId: fullNoteId, expectedVersion: current?.version }],
          ["propose_source", { title: "补充来源", text: "补充来源原文" }],
        ];
        const action = actions[tools.length];
        respond(action?.[0] ?? "", action?.[1] ?? {}); return;
      }
      let name = "", args: Record<string, unknown> = {};
      if (tools.length === 0) { name = "read_note"; args = { noteId: knowledge.id }; }
      else if (tools.length === 1) {
        const currentKnowledge = await getNote(knowledge.id);
        name = "propose_operations"; args = { operations: [
          { type: "update_note", target_note_id: knowledge.id, expected_version: currentKnowledge?.version, reason: "补充示例", changes: { content: "补充后的正文" } },
          { type: "schema_preferences", reason: "明确偏好", evidence: "以后多用表格", changes: { content: "- 以后多用表格。" } },
          { type: "schema_preferences", reason: "不应采纳的推测", evidence: "喜欢图表", changes: { content: "- 喜欢图表" } },
        ] };
      }
      const delta = name ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
        : { role: "assistant", content: `已提交两项建议，等待确认。来源 [[${knowledge.path}|${knowledge.title}]]` };
      res.setHeader("content-type", "text/event-stream");
      res.write(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ id: "fixture", choices: [{ index: 0, delta: {}, finish_reason: name ? "tool_calls" : "stop" }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
    await new Promise<void>(ok => mock.listen(0, "127.0.0.1", ok));
    const overrides = { CHORDNOTE_PROVIDER: "ollama", CHORDNOTE_MODEL: "test", CHORDNOTE_BASE_URL: `http://127.0.0.1:${(mock.address() as { port: number }).port}/v1` };
    const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
    Object.assign(process.env, overrides);
    try {
      const trace = await runOrganizeAgent({ question: "整理 Python 协程；以后多用表格", contextType: "none" });
      assert.equal(trace.counters.pendingProposals, 2);
      assert.equal((await getNote(knowledge.id))?.content, "原有正文\n\n补充资料已纳入。");
      assert.equal((await readAgentSchema()).hash, concurrent[0]!.hash);
      const runAudit = (await db.select().from(schema.auditLog)).filter(row => row.operation === "agent.query" && row.targetId === trace.sessionId);
      assert.equal(runAudit.length, 1, "each completed run leaves exactly one agent.query audit row");
      const auditDetail = runAudit[0].detail as { steps: Array<{ tool: string }>; citedIds: string[]; readIds: string[]; searchedIds: string[]; health?: { passed?: number } };
      assert.ok(auditDetail.steps.some(step => step.tool === "read_note"), "tool steps are persisted with the run");
      assert.ok(auditDetail.citedIds.includes(knowledge.id), "citations resolve from wikilinks in the reply");
      assert.equal(typeof auditDetail.health?.passed, "number", "the closing health summary is audited");
      assert.ok(trace.steps.some(step => step.tool === "check_knowledge_health"), "every run ends with a health check step");
      const continued = await runOrganizeAgent({ question: "继续刚才的建议", contextType: "none", sessionId: trace.sessionId });
      assert.equal(continued.counters.pendingProposals, 0);
      assert.equal(continued.sessionId, trace.sessionId);
      assert.equal(closeSession(getUserContext().userId, trace.sessionId!), 2);
      assert.equal(requests, 4, "continuing the conversation must replay history without re-executing old tools");

      const originalRaw = await createSource("原文不可由 AI 改写", "授权整理来源");
      fullRawId = originalRaw.id;
      await assert.rejects(promoteFromSource({ rawId: fullRawId, title: "缺少类别", summary: "测试", content: "# 缺少类别", keyPoints: [], concepts: [], keywords: [], rawCategory: "papers", origin: "ai" }), /AI_DRAFT_CATEGORY_REQUIRED/);
      assert.ok(!(await listNotes()).some(note => note.rawId === fullRawId));
      const beforeFullSchema = await readAgentSchema();
      scenario = "full";
      const full = await runOrganizeAgent({ question: "整理来源，建立联系，分类并归档整理页；保留补充来源原文；以后多用表格", contextType: "raw", contextId: fullRawId, permission: "full" });
      assert.equal(full.counters.pendingProposals, 0);
      assert.equal(full.draft, undefined, "full mode must not leave a draft awaiting confirmation");
      assert.equal(full.runtime?.permissions.mode, "full");
      assert.ok(!full.steps.some(step => step.status === "failed"), JSON.stringify(full.steps));
      const rawAfter = await getSource(fullRawId);
      assert.equal(rawAfter?.text, originalRaw.text);
      assert.equal(rawAfter?.markdown, originalRaw.markdown);
      assert.equal(rawAfter?.path, `raw/papers/${fullRawId}.md`);
      assert.equal(initialFullPath, `wilki/synthesis/${fullNoteId}.md`, "draft_knowledge must place the page in its chosen Wiki category before any later move");
      const written = await getNote(fullNoteId);
      assert.equal(written?.content, "完全允许更新后的正文");
      assert.equal(written?.path, `wilki/sources/${fullNoteId}.md`);
      assert.ok(written?.archivedAt);
      assert.notEqual((await readAgentSchema()).hash, beforeFullSchema.hash);
      assert.ok((await listSources()).some(raw => raw.title === "补充来源"));
      for (const step of trace.steps.filter(step => step.proposalId)) assert.equal((await getProposal(step.proposalId!))?.status, "pending", "full mode must not approve proposals from earlier runs");
      const revisions = (await db.select().from(schema.noteRevisions)).filter(row => row.noteId === fullNoteId);
      assert.ok(revisions.length >= 3 && revisions.every(row => row.authorType === "agent"));
      assert.ok((await db.select().from(schema.auditLog)).some(row => row.operation === "proposal.apply" && row.actorType === "agent"));

      scenario = "read";
      const rawCount = (await listSources()).length;
      const read = await runOrganizeAgent({ question: "继续，但本轮只读", contextType: "none", permission: "read", sessionId: full.sessionId });
      assert.equal(read.runtime?.permissions.mode, "read");
      assert.equal((await listSources()).length, rawCount);
      assert.equal((await getNote(fullNoteId))?.content, written?.content);
      assert.equal(closeSession(getUserContext().userId, full.sessionId!), 2);

      multiRawIds = [(await createSource("第一条待整理材料", "第一条")).id, (await createSource("第二条待整理材料", "第二条")).id];
      scenario = "drafts";
      const multiDraft = await runOrganizeAgent({ question: "分别整理两条材料", contextType: "none", permission: "propose" });
      assert.equal(multiDraft.counters.pendingDrafts, 2);
      assert.deepEqual(multiDraft.drafts.map(item => item.rawId), multiRawIds);
      assert.equal(multiDraft.draft?.rawId, multiRawIds[1], "legacy draft points at the final draft without discarding earlier ones");
      assert.ok(multiDraft.drafts.every(item => item.draftId.startsWith("draft_")), "each draft carries its own id");

      // 同一份材料在一轮里产出两页：full 模式两页都落库，互不覆盖。
      scenario = "multipage";
      const multipage = await runOrganizeAgent({ question: "一份材料整理成两页", contextType: "raw", contextId: multiRawIds[0], permission: "full" });
      const multiPages = (await listNotes()).filter(note => note.rawId === multiRawIds[0]);
      assert.equal(multiPages.length, 2, JSON.stringify(multipage.steps));
      assert.deepEqual(multiPages.map(page => page.title).sort(), ["摘要页", "概念页"]);

      longRawId = (await createSource("长资料".repeat(4_000), "长资料")).id;
      scenario = "paginate";
      const paged = await runOrganizeAgent({ question: "读取长资料", contextType: "none", permission: "read" });
      const firstRead = paged.steps.find(step => step.tool === "read_raw");
      assert.equal(firstRead?.payload?.truncated, true);
      assert.equal(typeof firstRead?.payload?.nextOffset, "number");

      // 只读了首页就提交整理稿：必须被挡下，且不能产生知识页。
      scenario = "incomplete";
      const incomplete = await runOrganizeAgent({ question: "整理长资料", contextType: "none", permission: "full" });
      assert.ok(incomplete.steps.some(step => step.tool === "draft_knowledge" && step.status === "failed"), JSON.stringify(incomplete.steps));
      assert.ok(!(await listNotes()).some(note => note.rawId === longRawId));

      // 体检报告只读、可重复，统计口径要和列表接口一致。
      const health = await wikiHealth();
      assert.equal(health.totals.knowledge, (await listNotes()).length);
      assert.equal(health.totals.raw, (await listSources()).length);
      assert.ok(health.rules.some(item => item.rule === "unorganized-source"));
      assert.ok(health.rules.every(item => Array.isArray(item.issues) && item.issues.length <= item.total));
      const again = await wikiHealth();
      assert.deepEqual({ ...again, generatedAt: "" }, { ...health, generatedAt: "" });

      // 运行失败也要留下一条审计，否则这一轮产生的待确认项会成为无主数据。
      const broken = join(directory, "broken.json");
      await writeFile(broken, "{not json");
      process.env.CHORDNOTE_SETTINGS_FILE = broken;
      await assert.rejects(runOrganizeAgent({ question: "失败也要留痕", contextType: "none" }));
      process.env.CHORDNOTE_SETTINGS_FILE = join(directory, "settings.json");
      const failedRun = (await db.select().from(schema.auditLog)).filter(row => row.operation === "agent.run.failed");
      assert.equal(failedRun.length, 1);
      assert.ok(Array.isArray((failedRun[0].detail as { steps?: unknown[] }).steps));
    } finally {
      mock.closeAllConnections(); await new Promise<void>(ok => mock.close(() => ok()));
      for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  } finally {
    delete host.__chordnoteDbPromise;
    await client.close();
    if (prior === undefined) delete process.env.CHORDNOTE_SETTINGS_FILE; else process.env.CHORDNOTE_SETTINGS_FILE = prior;
    const target = resolve(directory);
    assert.ok(target.startsWith(resolve(tmpdir()) + "\\") || target.startsWith(resolve(tmpdir()) + "/"));
    assert.ok(target.split(/[\\/]/).at(-1)?.startsWith("chordnote-context-test-"));
    await rm(target, { recursive: true, force: true });
  }
});
