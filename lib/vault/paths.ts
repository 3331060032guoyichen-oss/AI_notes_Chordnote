import { mkdir, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { VaultError } from "./types";

/** 测试与开发用环境变量优先；产品默认放在用户文档目录。 */
export function resolveVaultRoot(explicit?: string): string {
  return path.resolve(explicit ?? process.env.CHORDNOTE_VAULT_DIR ?? path.join(homedir(), "Documents", "Chordnote"));
}

const VAULT_DIRS = [
  "raw/notes",
  "raw/papers",
  "raw/books",
  "raw/articles",
  "raw/assets",
  "wiki/sources",
  "wiki/concepts",
  "wiki/entities",
  "wiki/notes",
  ".chordnote/index",
  ".chordnote/trash",
];

/** 只建目录与忽略规则。CLAUDE.md 的内容属于产品决策，不在这里凭空生成。 */
export async function ensureVault(root: string): Promise<void> {
  await Promise.all(VAULT_DIRS.map((dir) => mkdir(path.join(root, dir), { recursive: true })));
  const ignore = path.join(root, ".gitignore");
  try {
    await stat(ignore);
  } catch {
    await writeFile(ignore, ".chordnote/\n", "utf8");
  }
}

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;

/** 校验并规范化一个 Vault 相对路径。拒绝绝对路径、上跳、Windows 非法名与保留名。 */
export function safeRelativePath(input: string, options: { allowInternal?: boolean } = {}): string {
  const normalized = input.normalize("NFC").replace(/\\/g, "/").trim();
  if (!normalized || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith("/")) {
    throw new VaultError("PATH_INVALID", "路径必须是 Vault 内的相对路径。");
  }
  const segments = normalized.split("/");
  for (const segment of segments) {
    if (!segment || segment === "." || segment === "..") throw new VaultError("PATH_INVALID", "路径不能包含 . 或 ..。");
    if (/[<>:"|?*\u0000-\u001f]/.test(segment)) throw new VaultError("PATH_INVALID", "路径包含非法字符。");
    if (/[. ]$/.test(segment)) throw new VaultError("PATH_INVALID", "路径段不能以点或空格结尾。");
    if (WINDOWS_RESERVED.test(segment)) throw new VaultError("PATH_INVALID", "路径使用了系统保留名。");
  }
  if (!options.allowInternal && segments[0] === ".chordnote") {
    throw new VaultError("PATH_INVALID", "内部目录不对外开放。");
  }
  return segments.join("/");
}

function comparable(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

/** 目标或它的最近祖先不存在时，用最近一个存在祖先的真实路径做越界判断。 */
async function realpathNearest(target: string): Promise<string> {
  let current = target;
  for (;;) {
    try {
      return await realpath(current);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) throw new VaultError("PATH_INVALID", "无法解析路径。");
      current = parent;
    }
  }
}

/** 解析为绝对路径，并确认真实路径（含软链）仍在 Vault 内。 */
export async function resolveInsideVault(root: string, relative: string, options: { allowInternal?: boolean } = {}): Promise<string> {
  const safe = safeRelativePath(relative, options);
  const absolute = path.resolve(root, safe);
  const relativeCheck = path.relative(root, absolute);
  if (relativeCheck.startsWith("..") || path.isAbsolute(relativeCheck)) {
    throw new VaultError("PATH_OUTSIDE_VAULT", "路径超出 Vault。");
  }

  const realRoot = await realpath(root);
  const probe = await realpathNearest(absolute);
  const prefix = comparable(realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep);
  const value = comparable(probe);
  if (value !== comparable(realRoot) && !value.startsWith(prefix)) {
    throw new VaultError("PATH_OUTSIDE_VAULT", "路径经软链指向 Vault 之外。");
  }
  return absolute;
}

export function toVaultPath(root: string, absolute: string): string {
  return path.relative(root, absolute).split(path.sep).join("/").normalize("NFC");
}

/** 标题 → 文件名。Windows 非法字符、首尾点与空格在这里被清理，而不是报错。 */
export function fileStemFromTitle(title: string): string {
  const cleaned = title
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[. ]+|[. ]+$/g, "")
    .slice(0, 80);
  return cleaned && !WINDOWS_RESERVED.test(cleaned) ? cleaned : "未命名";
}
