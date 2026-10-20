import assert from "node:assert/strict";
import { mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { JsonlAuditSink, MemoryAuditSink } from "./audit";
import { sha256 } from "./files";
import { ensureVault } from "./paths";
import { diffScans, pairRenames, scanVault } from "./scan";
import { VaultService } from "./service";
import { VaultError, type VaultActor, type VaultMode } from "./types";

async function makeVault(t: { after: (fn: () => void | Promise<void>) => void }): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), "chordnote-vault-"));
  const root = path.join(parent, "Vault");
  await ensureVault(root);
  t.after(() => rm(parent, { recursive: true, force: true }));
  return root;
}

async function openService(
  root: string,
  options: { mode?: VaultMode; actor?: VaultActor } = {},
): Promise<{ service: VaultService; audit: MemoryAuditSink }> {
  const audit = new MemoryAuditSink();
  const service = await VaultService.create({
    root,
    mode: options.mode ?? "trusted",
    actor: options.actor ?? { type: "agent", id: "agent-test" },
    audit,
  });
  return { service, audit };
}

const code = (expected: string) => (error: unknown) =>
  error instanceof VaultError && error.code === expected;

test("1. 无 frontmatter 的 Raw 可以读取、扫描和编辑", async (t) => {
  const root = await makeVault(t);
  await writeFile(path.join(root, "raw/notes/课堂.md"), "# 课堂笔记\n\n原始正文\n", "utf8");

  const { service } = await openService(root, { actor: { type: "user", id: "u" } });
  const read = await service.read("raw/notes/课堂.md");
  assert.equal(read.text, "# 课堂笔记\n\n原始正文\n");
  assert.ok(service.snapshot().some((entry) => entry.path === "raw/notes/课堂.md"));

  await service.writeRaw("raw/notes/课堂.md", "# 课堂笔记\n\n改过的正文\n", { expectedSha256: read.state.sha256 });
  assert.equal(await readFile(path.join(root, "raw/notes/课堂.md"), "utf8"), "# 课堂笔记\n\n改过的正文\n");
});

test("4. 只读模式拒绝 Agent 的全部写入；Plan 模式要求审批", async (t) => {
  const root = await makeVault(t);
  const { service } = await openService(root, { mode: "readonly" });
  const cases: Array<Promise<unknown>> = [
    service.createRaw({ title: "A" }),
    service.appendRaw("raw/notes/a.md", "x"),
    service.writeRaw("raw/notes/a.md", "x", { expectedSha256: "0" }),
    service.writePage("wiki/sources/a.md", "x", { expectedSha256: "0" }),
    service.archive("raw/notes/a.md"),
    service.unarchive("raw/notes/a.md"),
    service.trash("raw/notes/a.md"),
    service.restore(".chordnote/trash/20260101-000000/raw/notes/a.md"),
  ];
  for (const request of cases) await assert.rejects(request, code("PERMISSION_DENIED"));

  const { service: plan } = await openService(root, { mode: "plan" });
  await assert.rejects(plan.createRaw({ title: "A" }), code("APPROVAL_REQUIRED"));
  await assert.rejects(plan.appendRaw("raw/notes/a.md", "x"), code("APPROVAL_REQUIRED"));
});

test("5. AI 可创建 Raw、末尾追加，且不能改变已有字节", async (t) => {
  const root = await makeVault(t);
  const { service, audit } = await openService(root);
  const created = await service.createRaw({ title: "PID 控制", content: "课堂笔记正文" });
  assert.equal(created.path, "raw/PID 控制.md");
  const file = path.join(root, created.path);
  assert.equal(await readFile(file, "utf8"), "# PID 控制\n\n课堂笔记正文\n");

  const before = await readFile(file);
  await service.appendRaw(created.path, "第一条补充");
  await service.appendRaw(created.path, "第二条补充");
  const after = await readFile(file, "utf8");
  assert.ok(after.startsWith(before.toString("utf8")), "追加不得改动已有字节");
  assert.match(after, /## AI append-1\n\n第一条补充/);
  assert.match(after, /## AI append-2\n\n第二条补充/);

  await assert.rejects(service.appendRaw(created.path, "## AI append-9\n伪造边界"), code("APPEND_CONFLICT"));
  await assert.rejects(
    service.writeRaw(created.path, "整段覆盖", { expectedSha256: created.sha256 }),
    code("PERMISSION_DENIED"),
  );
  assert.deepEqual(audit.events.map((event) => event.operation), ["raw.create", "raw.append", "raw.append"]);
});

test("6. 唯一 hash 的重命名更新 Source 路径并留下审计", async (t) => {
  const root = await makeVault(t);
  await writeFile(path.join(root, "raw/notes/旧名.md"), "# 来源\n\n正文\n", "utf8");
  await writeFile(
    path.join(root, "wiki/sources/来源.md"),
    "---\nid: source_test\ntype: source\nsource_path: raw/notes/旧名.md\n---\n# 来源\n",
    "utf8",
  );
  const { service, audit } = await openService(root);
  await rename(path.join(root, "raw/notes/旧名.md"), path.join(root, "raw/notes/新名.md"));

  const result = await service.reconcile();
  assert.equal(result.renames.length, 1);
  assert.deepEqual(result.repathed, [{ page: "wiki/sources/来源.md", from: "raw/notes/旧名.md", to: "raw/notes/新名.md" }]);
  assert.match(await readFile(path.join(root, "wiki/sources/来源.md"), "utf8"), /source_path: raw\/notes\/新名\.md/);
  assert.ok(audit.events.some((event) => event.operation === "source.repath"));
});

test("7. 重复 hash 或重命名同时编辑时不会错误匹配身份", async (t) => {
  const duplicateRoot = await makeVault(t);
  await Promise.all([
    writeFile(path.join(duplicateRoot, "raw/notes/a.md"), "# 同一份\n", "utf8"),
    writeFile(path.join(duplicateRoot, "raw/notes/b.md"), "# 同一份\n", "utf8"),
  ]);
  const duplicatePrevious = await scanVault(duplicateRoot);
  await rename(path.join(duplicateRoot, "raw/notes/a.md"), path.join(duplicateRoot, "raw/notes/c.md"));
  const duplicateNext = await scanVault(duplicateRoot, duplicatePrevious);
  const duplicate = pairRenames(duplicatePrevious, duplicateNext, diffScans(duplicatePrevious, duplicateNext));
  assert.equal(duplicate.renames.length, 0);
  assert.ok(duplicate.ambiguous.length > 0);

  const editedRoot = await makeVault(t);
  await writeFile(path.join(editedRoot, "raw/notes/a.md"), "# 原文\n", "utf8");
  const editedPrevious = await scanVault(editedRoot);
  await rename(path.join(editedRoot, "raw/notes/a.md"), path.join(editedRoot, "raw/notes/b.md"));
  await writeFile(path.join(editedRoot, "raw/notes/b.md"), "# 原文\n\n重命名时又改了\n", "utf8");
  const editedNext = await scanVault(editedRoot);
  const edited = pairRenames(editedPrevious, editedNext, diffScans(editedPrevious, editedNext));
  assert.equal(edited.renames.length, 0);

  const { service } = await openService(editedRoot);
  const result = await service.reconcile();
  assert.equal(result.renames.length, 0);
  assert.equal(result.repathed.length, 0);
});

test("8. Archive / Trash / Restore 的状态与路径正确", async (t) => {
  const root = await makeVault(t);
  await writeFile(path.join(root, "raw/notes/a.md"), "# A\n\n正文\n", "utf8");
  const { service, audit } = await openService(root, { actor: { type: "user", id: "u" } });
  const file = path.join(root, "raw/notes/a.md");

  const archived = await service.archive("raw/notes/a.md");
  const archivedText = await readFile(file, "utf8");
  assert.match(archivedText, /archived: true/);
  assert.match(archivedText, /archived_at: \d{4}-\d{2}-\d{2}/);
  assert.match(archivedText, /# A\n\n正文\n$/);

  const { trashPath } = await service.trash("raw/notes/a.md");
  await assert.rejects(stat(file));
  assert.equal(await readFile(path.join(root, trashPath), "utf8"), archivedText);

  const restored = await service.restore(trashPath);
  assert.equal(restored.path, "raw/notes/a.md");
  assert.equal(restored.sha256, archived.sha256);
  assert.equal(await readFile(file, "utf8"), archivedText);

  await service.unarchive("raw/notes/a.md");
  assert.doesNotMatch(await readFile(file, "utf8"), /archived/);
  assert.ok(audit.events.some((event) => event.operation === "file.restore"));
});

test("9. 文件被外部修改或删除时不覆盖、不损坏数据", async (t) => {
  const root = await makeVault(t);
  await writeFile(path.join(root, "wiki/sources/a.md"), "# A\n", "utf8");
  await writeFile(path.join(root, "raw/notes/a.md"), "# Raw\n", "utf8");
  const { service } = await openService(root, { actor: { type: "user", id: "u" } });

  const page = await service.read("wiki/sources/a.md");
  await writeFile(path.join(root, "wiki/sources/a.md"), "# 外部改过\n", "utf8");
  await assert.rejects(
    service.writePage("wiki/sources/a.md", "整段覆盖", { expectedSha256: page.state.sha256 }),
    code("EXTERNAL_MODIFICATION"),
  );
  assert.equal(await readFile(path.join(root, "wiki/sources/a.md"), "utf8"), "# 外部改过\n");

  const raw = await service.read("raw/notes/a.md");
  await writeFile(path.join(root, "raw/notes/a.md"), "# Raw 外部改过\n", "utf8");
  await assert.rejects(service.appendRaw("raw/notes/a.md", "追加", { expectedSha256: raw.state.sha256 }), code("EXTERNAL_MODIFICATION"));
  assert.equal(await readFile(path.join(root, "raw/notes/a.md"), "utf8"), "# Raw 外部改过\n");

  await rm(path.join(root, "raw/notes/a.md"));
  await assert.rejects(service.appendRaw("raw/notes/a.md", "追加"), code("FILE_MISSING"));
});

test("3. Watcher 漏事件或重启后，扫描能恢复文件状态", async (t) => {
  const root = await makeVault(t);
  await writeFile(path.join(root, "raw/notes/会改.md"), "# 旧\n", "utf8");
  await writeFile(path.join(root, "raw/notes/会删.md"), "# 删\n", "utf8");
  const { service } = await openService(root);

  await writeFile(path.join(root, "raw/notes/会改.md"), "# 新\n", "utf8");
  await rm(path.join(root, "raw/notes/会删.md"));
  await writeFile(path.join(root, "raw/notes/会加.md"), "# 加\n", "utf8");

  const result = await service.reconcile();
  assert.deepEqual(result.diff.changed, ["raw/notes/会改.md"]);
  assert.deepEqual(result.diff.removed, ["raw/notes/会删.md"]);
  assert.deepEqual(result.diff.added, ["raw/notes/会加.md"]);
});

test("审计可落盘到 .chordnote/audit.jsonl", async (t) => {
  const root = await makeVault(t);
  const service = await VaultService.create({
    root,
    mode: "trusted",
    actor: { type: "agent", id: "agent-audit" },
    audit: new JsonlAuditSink(root),
  });
  await service.createRaw({ title: "审计" });

  const lines = (await readFile(path.join(root, ".chordnote/audit.jsonl"), "utf8")).trim().split("\n");
  const event = JSON.parse(lines[0]) as { operation: string; actorId: string; path: string };
  assert.deepEqual([event.operation, event.actorId, event.path], ["raw.create", "agent-audit", "raw/审计.md"]);
});

test("路径约束：Vault 外、内部目录与非法路径一律拒绝", async (t) => {
  const root = await makeVault(t);
  const { service } = await openService(root);
  await assert.rejects(service.read("../outside.md"), code("PATH_INVALID"));
  await assert.rejects(service.read("C:\\secret.md"), code("PATH_INVALID"));
  await assert.rejects(service.read(".chordnote/index/x.md"), code("PATH_INVALID"));
  await assert.rejects(service.writePage("raw/notes/a.md", "x", { expectedSha256: sha256("x") }), code("PATH_INVALID"));
});
