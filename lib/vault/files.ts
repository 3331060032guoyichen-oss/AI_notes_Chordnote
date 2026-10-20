import { createHash, randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseDocument } from "yaml";

import { splitFrontmatter } from "../documents/markdown";
import { VaultError, type VaultFileState } from "./types";

export function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export async function readBytes(absolute: string): Promise<Buffer> {
  try {
    return await readFile(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new VaultError("FILE_MISSING", "文件不存在。");
    }
    throw error;
  }
}

export async function readState(absolute: string, relative: string): Promise<{ bytes: Buffer; state: VaultFileState }> {
  const [bytes, info] = await Promise.all([readBytes(absolute), stat(absolute).catch(() => null)]);
  if (!info) throw new VaultError("FILE_MISSING", "文件不存在。");
  return {
    bytes,
    state: { path: relative, sha256: sha256(bytes), size: bytes.byteLength, mtimeMs: info.mtimeMs },
  };
}

/** Windows 上目标被占用时 rename 会短暂失败，重试而不是直接报错。 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!["EPERM", "EBUSY", "EACCES"].includes(code ?? "") || attempt === 2) {
        throw code === "EPERM" || code === "EBUSY" || code === "EACCES"
          ? new VaultError("FILE_LOCKED", "文件正被其他程序占用，稍后重试。")
          : error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export async function writeAtomic(
  absolute: string,
  relative: string,
  content: string,
  options: { mode: "create" | "update"; expectedSha256?: string },
): Promise<VaultFileState> {
  const bytes = Buffer.from(content, "utf8");
  const temporary = path.join(path.dirname(absolute), `.${path.basename(absolute)}.${randomUUID()}.tmp`);

  if (options.mode === "create") {
    let exists = true;
    try {
      await stat(absolute);
    } catch {
      exists = false;
    }
    if (exists) throw new VaultError("FILE_EXISTS", "目标文件已存在。");
  } else {
    const current = await readBytes(absolute).catch(() => null);
    if (!current) throw new VaultError("EXTERNAL_DELETE", "文件已被外部删除，未写入。");
    if (!options.expectedSha256) throw new VaultError("INVALID_ARGUMENT", "更新已有文件必须提供 expectedSha256。");
    if (sha256(current) !== options.expectedSha256) {
      throw new VaultError("EXTERNAL_MODIFICATION", "文件已被外部修改，未写入。");
    }
  }

  await mkdir(path.dirname(absolute), { recursive: true });
  try {
    await writeFile(temporary, bytes);
    await renameWithRetry(temporary, absolute);
  } finally {
    await unlink(temporary).catch(() => {});
  }

  const info = await stat(absolute);
  return { path: relative, sha256: sha256(bytes), size: bytes.byteLength, mtimeMs: info.mtimeMs };
}

const APPEND_HEADING = /^## AI append-(\d+)\s*$/gm;

export function nextAppendNumber(text: string): number {
  const numbers = [...text.matchAll(APPEND_HEADING)].map((match) => Number(match[1]));
  return Math.max(0, ...numbers) + 1;
}

export function formatAppendBlock(text: string, content: string): { chunk: string; heading: string } {
  if (/^## AI append-\d+\s*$/m.test(content)) {
    // 追加块用这个标题定界；内容自带同样的行会让边界消失。
    throw new VaultError("APPEND_CONFLICT", "追加内容不能包含 AI append 标题行。");
  }
  const number = nextAppendNumber(text);
  const leading = text.length === 0 ? "" : text.endsWith("\n\n") ? "" : text.endsWith("\n") ? "\n" : "\n\n";
  return {
    chunk: `${leading}## AI append-${number}\n\n${content.trimEnd()}\n`,
    heading: `## AI append-${number}`,
  };
}

/**
 * 只允许在末尾追加。写前校验 hash，写后再验算前缀字节，
 * 这样即使调用方拿到的是过期快照，也不会覆盖已有内容。
 */
export async function appendOnly(
  absolute: string,
  relative: string,
  content: string,
  expectedSha256?: string,
): Promise<{ state: VaultFileState; heading: string }> {
  const { bytes, state } = await readState(absolute, relative);
  if (expectedSha256 && state.sha256 !== expectedSha256) {
    throw new VaultError("EXTERNAL_MODIFICATION", "文件已被外部修改，未追加。");
  }

  const { chunk, heading } = formatAppendBlock(bytes.toString("utf8"), content);
  await appendFile(absolute, chunk, "utf8");

  const handle = await open(absolute, "r");
  try {
    const prefix = Buffer.alloc(bytes.byteLength);
    let offset = 0;
    while (offset < prefix.byteLength) {
      const { bytesRead } = await handle.read(prefix, offset, prefix.byteLength - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    if (offset !== bytes.byteLength || sha256(prefix) !== state.sha256) {
      throw new VaultError("APPEND_CONFLICT", "追加写入改变了已有字节。");
    }
  } finally {
    await handle.close();
  }

  const next = await readState(absolute, relative);
  return { state: next.state, heading };
}

/** 原子地改 frontmatter；正文一字不动。 */
export async function patchFrontmatter(
  absolute: string,
  relative: string,
  patch: Record<string, unknown>,
  options: { remove?: string[]; expectedSha256?: string } = {},
): Promise<VaultFileState> {
  const { bytes, state } = await readState(absolute, relative);
  if (options.expectedSha256 && state.sha256 !== options.expectedSha256) {
    throw new VaultError("EXTERNAL_MODIFICATION", "文件已被外部修改，未写入。");
  }
  const text = bytes.toString("utf8");
  const { yaml, body } = splitFrontmatter(text);
  const document = parseDocument(yaml);
  if (document.errors.length) throw new VaultError("INVALID_ARGUMENT", `属性格式有误：${document.errors[0].message}`);
  for (const [key, value] of Object.entries(patch)) document.set(key, value);
  for (const key of options.remove ?? []) document.delete(key);
  return writeAtomic(absolute, relative, `---\n${document.toString()}---\n${body}`, {
    mode: "update",
    expectedSha256: state.sha256,
  });
}

export async function moveFile(from: string, to: string): Promise<void> {
  await mkdir(path.dirname(to), { recursive: true });
  let exists = true;
  try {
    await stat(to);
  } catch {
    exists = false;
  }
  if (exists) throw new VaultError("FILE_EXISTS", "目标路径已被占用。");
  await renameWithRetry(from, to);
}
