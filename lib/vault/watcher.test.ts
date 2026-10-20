import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { sha256 } from "./files";
import { ensureVault } from "./paths";
import { scanVault } from "./scan";
import { startVaultWatcher, type VaultWatchEvent } from "./watcher";

async function makeVault(t: { after: (fn: () => void | Promise<void>) => void }): Promise<string> {
  const parent = await mkdtemp(path.join(tmpdir(), "chordnote-watch-"));
  const root = path.join(parent, "Vault");
  await ensureVault(root);
  t.after(() => rm(parent, { recursive: true, force: true }));
  return root;
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error("等待 Watcher 事件超时");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

test("2. Obsidian 新建与修改文件后 Watcher 能发现变化", async (t) => {
  const root = await makeVault(t);
  const events: VaultWatchEvent[] = [];
  const watcher = await startVaultWatcher({
    root,
    initial: new Map(),
    onEvent: (event) => {
      events.push(event);
    },
    debounceMs: 50,
    renameWindowMs: 300,
  });
  t.after(() => watcher.close());

  const relative = "raw/notes/外部新建.md";
  const file = path.join(root, relative);
  await writeFile(file, "# 外部新建\n", "utf8");
  await waitFor(() => events.some((event) => event.kind === "add" && event.path === relative && !event.self));

  await writeFile(file, "# 外部新建\n\n外部修改\n", "utf8");
  await waitFor(() => events.some((event) => event.kind === "change" && event.path === relative && !event.self));
});

test("自写抑制：登记过 hash 的写入不会被当成外部变化", async (t) => {
  const root = await makeVault(t);
  const events: VaultWatchEvent[] = [];
  const watcher = await startVaultWatcher({
    root,
    initial: await scanVault(root),
    onEvent: (event) => {
      events.push(event);
    },
    debounceMs: 50,
    renameWindowMs: 300,
  });
  t.after(() => watcher.close());

  const relative = "wiki/notes/自写.md";
  const content = "# 自写\n";
  watcher.suppress(relative, sha256(content));
  await writeFile(path.join(root, relative), content, "utf8");

  await waitFor(() => events.some((event) => event.kind === "add" && event.path === relative && event.self));
  assert.ok(!events.some((event) => event.kind === "add" && event.path === relative && !event.self));
});
