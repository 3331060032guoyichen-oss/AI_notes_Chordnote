import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import { logAgentEvent } from "./agent-context";
import { listAuditEvents } from "./audit";
import { promoteFromSource } from "./notes";
import { createSource } from "./sources";
import * as schema from "../db/schema";
import type { DbHandle } from "../db/client";

test("audit log resolves titles and omits internal ids", { timeout: 60_000 }, async () => {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  const host = process as typeof process & { __chordnoteDbPromise?: Promise<DbHandle> };
  const prior = host.__chordnoteDbPromise;
  host.__chordnoteDbPromise = Promise.resolve({ db, client, close: () => client.close() });

  try {
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    const raw = await createSource("审计测试原文", "审计测试来源");
    const { knowledge } = await promoteFromSource({
      rawId: raw.id,
      title: "审计测试知识页",
      summary: "测试摘要",
      content: "# 审计测试知识页\n\n测试正文。",
      rawCategory: "articles",
      wikiCategory: "concept",
      keyPoints: [],
      concepts: [],
      keywords: [],
      origin: "ai",
    });
    await logAgentEvent("agent.query", "session_test", {
      permission: "full",
      steps: [],
      health: { warn: 0, info: 0, passed: 1 },
      readIds: [knowledge.id],
      citedIds: [knowledge.id],
    });

    const events = await listAuditEvents(20);
    assert.equal(events.find(event => event.operation === "note.create")?.targetTitle, "审计测试知识页");
    assert.equal(events.find(event => event.operation === "agent.query")?.targetTitle, "整理会话");
    assert.equal((events.find(event => event.operation === "agent.query")?.detail as Record<string, unknown>).readCount, 1);

    const payload = JSON.stringify(events);
    assert.ok(!payload.includes(raw.id), "raw id must not leak");
    assert.ok(!payload.includes(knowledge.id), "knowledge id must not leak");
  } finally {
    if (prior) host.__chordnoteDbPromise = prior;
    else delete host.__chordnoteDbPromise;
    await client.close();
  }
});
