import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "yaml";

import { splitFrontmatter } from "../documents/markdown";
import { readState } from "./files";
import type { RenamePair, ScanDiff, VaultFileState } from "./types";

const IGNORED_DIRS = new Set([".chordnote", ".obsidian", ".git", "node_modules"]);

function ignoredFile(name: string): boolean {
  return name.startsWith(".") || name.endsWith(".tmp") || name.startsWith("~$");
}

async function walk(root: string, relativeDir: string, output: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(path.join(root, relativeDir), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relative = `${relativeDir}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) await walk(root, relative, output);
      continue;
    }
    if (entry.isFile() && !ignoredFile(entry.name)) output.push(relative);
  }
}

/**
 * 扫描 Vault 中的文件并计算 hash。
 * `previous` 命中且 size/mtime 未变时复用旧 hash，避免每次全量重算。
 */
export async function scanVault(root: string, previous?: Map<string, VaultFileState>): Promise<Map<string, VaultFileState>> {
  const files: string[] = [];
  await Promise.all([walk(root, "raw", files), walk(root, "wiki", files)]);
  const result = new Map<string, VaultFileState>();

  for (const relative of files) {
    const absolute = path.join(root, relative);
    const info = await stat(absolute).catch(() => null);
    if (!info?.isFile()) continue;
    const known = previous?.get(relative);
    if (known && known.size === info.size && known.mtimeMs === info.mtimeMs) {
      result.set(relative, known);
      continue;
    }
    try {
      const { state } = await readState(absolute, relative);
      result.set(relative, state);
    } catch {
      // 扫描期间文件被删掉是正常竞态，下一轮再算。
    }
  }
  return result;
}

export function diffScans(previous: Map<string, VaultFileState>, next: Map<string, VaultFileState>): ScanDiff {
  const added = [...next.keys()].filter((key) => !previous.has(key));
  const removed = [...previous.keys()].filter((key) => !next.has(key));
  const changed = [...next.keys()].filter((key) => {
    const before = previous.get(key);
    return before !== undefined && before.sha256 !== next.get(key)?.sha256;
  });
  return { added, changed, removed };
}

function countByHash(states: Map<string, VaultFileState>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const state of states.values()) counts.set(state.sha256, (counts.get(state.sha256) ?? 0) + 1);
  return counts;
}

/**
 * 只在「旧目录里该 hash 唯一、新目录里该 hash 唯一」时认定重命名。
 * 重复内容或重命名同时编辑都会让 hash 不唯一/不相等，因此不会被误配。
 */
export function pairRenames(
  previous: Map<string, VaultFileState>,
  next: Map<string, VaultFileState>,
  diff: ScanDiff,
): { renames: RenamePair[]; ambiguous: Array<{ sha256: string; from: string[]; to: string[] }> } {
  const before = countByHash(previous);
  const after = countByHash(next);
  const removedByHash = new Map<string, string[]>();
  const addedByHash = new Map<string, string[]>();

  for (const key of diff.removed) {
    const sha = previous.get(key)!.sha256;
    removedByHash.set(sha, [...(removedByHash.get(sha) ?? []), key]);
  }
  for (const key of diff.added) {
    const sha = next.get(key)!.sha256;
    addedByHash.set(sha, [...(addedByHash.get(sha) ?? []), key]);
  }

  const renames: RenamePair[] = [];
  const ambiguous: Array<{ sha256: string; from: string[]; to: string[] }> = [];
  for (const [sha, from] of removedByHash) {
    const to = addedByHash.get(sha);
    if (!to) continue;
    if (from.length === 1 && to.length === 1 && before.get(sha) === 1 && after.get(sha) === 1) {
      renames.push({ from: from[0], to: to[0], sha256: sha });
    } else {
      ambiguous.push({ sha256: sha, from, to });
    }
  }
  return { renames, ambiguous };
}

/** 读取 wiki 页面的 frontmatter，用于重命名后更新 source_path。 */
export async function readFrontmatter(root: string, relative: string): Promise<Record<string, unknown>> {
  const { bytes } = await readState(path.join(root, relative), relative);
  const document = parseDocument(splitFrontmatter(bytes.toString("utf8")).yaml);
  return document.errors.length ? {} : ((document.toJS({ maxAliasCount: 50 }) ?? {}) as Record<string, unknown>);
}
