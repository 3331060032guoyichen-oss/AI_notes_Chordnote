import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
import { runOrganizeAgent } from "../agent/loop";
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
    const currentDirectory = (await agentContext("协程")).directory.split("\n").map(line => JSON.parse(line));
    assert.deepEqual(currentDirectory.find(row => row.id === source.id), {
      title: "协程来源", layer: "Raw", category: "articles", path: `raw/articles/${source.id}.md`, id: source.id, status: "已整理",
    });
    assert.equal(currentDirectory.find(row => row.id === knowledge.id)?.layer, "Wiki");
    let requests = 0;
    let scenario = "propose", fullRawId = "", fullNoteId = "";
    const mock = createServer(async (req, res) => {
      let body = ""; for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      requests++;
      const messages = request.messages as { role: string; content: string }[];
      const serialized = JSON.stringify(messages);
      assert.ok(serialized.includes("Schema 整理规则"));
      assert.ok(serialized.includes("近期工作日志"));
      assert.ok(serialized.includes("目录索引"));
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
      if (scenario === "full") {
        if (tools.length >= 2 && !fullNoteId) fullNoteId = (await listNotes()).find(note => note.rawId === fullRawId)?.id ?? "";
        const current = fullNoteId ? await getNote(fullNoteId) : null;
        const actions: [string, Record<string, unknown>][] = [
          ["read_raw", { id: fullRawId }],
          ["draft_knowledge", { rawId: fullRawId, draftJson: JSON.stringify({ title: "授权整理页", summary: "测试", content: "# 授权整理页\n\n来源明确的正文", rawCategory: "papers", keyPoints: [], concepts: [], keywords: [], relatedKnowledge: [] }) }],
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
        name = "propose_operations"; args = { operations: [
          { type: "update_note", target_note_id: knowledge.id, expected_version: knowledge.version, reason: "补充示例", changes: { content: "补充后的正文" } },
          { type: "schema_preferences", reason: "明确偏好", evidence: "以后多用表格", changes: { content: "- 以后多用表格。" } },
          { type: "schema_preferences", reason: "不应采纳的推测", evidence: "喜欢图表", changes: { content: "- 喜欢图表" } },
        ] };
      }
      const delta = name ? { role: "assistant", tool_calls: [{ index: 0, id: `call_${requests}`, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
        : { role: "assistant", content: `已提交两项建议，等待确认。来源 ${knowledge.id}` };
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
      assert.equal((await getNote(knowledge.id))?.content, "原有正文");
      assert.equal((await readAgentSchema()).hash, concurrent[0]!.hash);
      const continued = await runOrganizeAgent({ question: "继续刚才的建议", contextType: "none", sessionId: trace.sessionId });
      assert.equal(continued.counters.pendingProposals, 0);
      assert.equal(continued.sessionId, trace.sessionId);
      assert.equal(closeSession(getUserContext().userId, trace.sessionId!), 2);
      assert.equal(requests, 4, "continuing the conversation must replay history without re-executing old tools");

      const originalRaw = await createSource("原文不可由 AI 改写", "授权整理来源");
      fullRawId = originalRaw.id;
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
