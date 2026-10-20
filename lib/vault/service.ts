import { randomUUID } from "node:crypto";
import path from "node:path";

import { appendOnly, moveFile, patchFrontmatter, readState, today, writeAtomic } from "./files";
import { ensureVault, fileStemFromTitle, resolveInsideVault, safeRelativePath } from "./paths";
import { diffScans, pairRenames, readFrontmatter, scanVault } from "./scan";
import {
  VaultError,
  type AuditSink,
  type RenamePair,
  type ScanDiff,
  type VaultActor,
  type VaultFileState,
  type VaultMode,
} from "./types";

export type VaultServiceOptions = {
  root: string;
  mode: VaultMode;
  actor: VaultActor;
  audit: AuditSink;
  now?: () => Date;
};

type WriteOperation = "create_raw" | "append_raw" | "write_raw" | "write_page" | "archive" | "delete";

export type ReconcileResult = {
  diff: ScanDiff;
  renames: RenamePair[];
  ambiguous: Array<{ sha256: string; from: string[]; to: string[] }>;
  repathed: Array<{ page: string; from: string; to: string }>;
};

/**
 * 文件层之上的唯一写入口。
 *
 * 权限按「主体 × 模式」判定：用户可改 Raw；Agent 在任何模式下都不能改 Raw 正文，
 * 只能新建或追加；只读模式拒绝全部写入，Plan 模式返回 APPROVAL_REQUIRED。
 * 系统主体只用于重命名后的 source_path 维护。
 */
export class VaultService {
  readonly root: string;
  private state: Map<string, VaultFileState>;
  private readonly mode: VaultMode;
  private readonly actor: VaultActor;
  private readonly audit: AuditSink;
  private readonly now: () => Date;

  private constructor(options: VaultServiceOptions, state: Map<string, VaultFileState>) {
    this.root = path.resolve(options.root);
    this.mode = options.mode;
    this.actor = options.actor;
    this.audit = options.audit;
    this.now = options.now ?? (() => new Date());
    this.state = state;
  }

  static async create(options: VaultServiceOptions): Promise<VaultService> {
    await ensureVault(options.root);
    const state = await scanVault(path.resolve(options.root));
    return new VaultService(options, state);
  }

  snapshot(): VaultFileState[] {
    return [...this.state.values()];
  }

  async read(relative: string): Promise<{ path: string; text: string; state: VaultFileState }> {
    const safe = this.assertScope(relative, "any");
    const absolute = await resolveInsideVault(this.root, safe);
    const { bytes, state } = await readState(absolute, safe);
    this.state.set(safe, state);
    return { path: safe, text: bytes.toString("utf8"), state };
  }

  async createRaw(input: { title: string; content?: string; dir?: string }): Promise<VaultFileState> {
    this.authorize("create_raw");
    const dir = input.dir ? this.assertScope(input.dir, "raw") : "raw";
    const stem = fileStemFromTitle(input.title.trim() || "未命名");
    const relative = await this.availablePath(dir, stem);
    const body = (input.content ?? "").replace(/\s+$/, "");
    const content = body.startsWith("# ") ? `${body}\n` : `# ${input.title.trim() || stem}\n\n${body}\n`;
    const absolute = await resolveInsideVault(this.root, relative);
    const state = await writeAtomic(absolute, relative, content, { mode: "create" });
    this.state.set(relative, state);
    await this.record("raw.create", relative, { sha256: state.sha256 });
    return state;
  }

  async appendRaw(relative: string, content: string, options: { expectedSha256?: string; source?: string } = {}): Promise<VaultFileState> {
    this.authorize("append_raw");
    const safe = this.assertScope(relative, "raw");
    const absolute = await resolveInsideVault(this.root, safe);
    const { state, heading } = await appendOnly(absolute, safe, content, options.expectedSha256);
    this.state.set(safe, state);
    await this.record("raw.append", safe, { heading, sha256: state.sha256, source: options.source ?? null });
    return state;
  }

  /** 用户改写 Raw。AI 在结构上拿不到这个入口——不是靠提示词约束。 */
  async writeRaw(relative: string, content: string, options: { expectedSha256: string }): Promise<VaultFileState> {
    this.authorize("write_raw");
    const safe = this.assertScope(relative, "raw");
    const absolute = await resolveInsideVault(this.root, safe);
    const state = await writeAtomic(absolute, safe, content, { mode: "update", expectedSha256: options.expectedSha256 });
    this.state.set(safe, state);
    await this.record("raw.update", safe, { sha256: state.sha256 });
    return state;
  }

  async writePage(relative: string, content: string, options: { expectedSha256: string }): Promise<VaultFileState> {
    this.authorize("write_page");
    const safe = this.assertScope(relative, "wiki");
    const absolute = await resolveInsideVault(this.root, safe);
    const state = await writeAtomic(absolute, safe, content, { mode: "update", expectedSha256: options.expectedSha256 });
    this.state.set(safe, state);
    await this.record("page.write", safe, { sha256: state.sha256 });
    return state;
  }

  async archive(relative: string): Promise<VaultFileState> {
    this.authorize("archive");
    const safe = this.assertScope(relative, "any");
    const absolute = await resolveInsideVault(this.root, safe);
    const state = await patchFrontmatter(absolute, safe, { archived: true, archived_at: today(this.now()) });
    this.state.set(safe, state);
    await this.record("page.archive", safe, { sha256: state.sha256 });
    return state;
  }

  async unarchive(relative: string): Promise<VaultFileState> {
    this.authorize("archive");
    const safe = this.assertScope(relative, "any");
    const absolute = await resolveInsideVault(this.root, safe);
    const state = await patchFrontmatter(absolute, safe, {}, { remove: ["archived", "archived_at"] });
    this.state.set(safe, state);
    await this.record("page.unarchive", safe, { sha256: state.sha256 });
    return state;
  }

  async trash(relative: string): Promise<{ trashPath: string }> {
    this.authorize("delete");
    const safe = this.assertScope(relative, "any");
    const source = await resolveInsideVault(this.root, safe);
    const { state } = await readState(source, safe);
    const stamp = this.now().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
    let trashPath = `.chordnote/trash/${stamp}/${safe}`;
    let target = await resolveInsideVault(this.root, trashPath, { allowInternal: true });
    try {
      await moveFile(source, target);
    } catch (error) {
      if (!(error instanceof VaultError) || error.code !== "FILE_EXISTS") throw error;
      trashPath = `.chordnote/trash/${stamp}-${randomUUID().slice(0, 6)}/${safe}`;
      target = await resolveInsideVault(this.root, trashPath, { allowInternal: true });
      await moveFile(source, target);
    }
    this.state.delete(safe);
    await this.record("file.trash", safe, { trashPath, sha256: state.sha256 });
    return { trashPath };
  }

  async restore(trashPath: string): Promise<VaultFileState> {
    this.authorize("delete");
    const internal = safeRelativePath(trashPath, { allowInternal: true });
    const prefix = ".chordnote/trash/";
    if (!internal.startsWith(prefix)) throw new VaultError("PATH_INVALID", "不是可恢复的回收站路径。");
    const relative = safeRelativePath(internal.slice(prefix.length).split("/").slice(1).join("/"));
    const source = await resolveInsideVault(this.root, internal, { allowInternal: true });
    const destination = await resolveInsideVault(this.root, relative);
    await moveFile(source, destination);
    const { state } = await readState(destination, relative);
    this.state.set(relative, state);
    await this.record("file.restore", relative, { fromPath: internal, sha256: state.sha256 });
    return state;
  }

  /**
   * 重新扫描并处理重命名。这是系统操作，不受 Agent 模式限制，但每次写入都留审计。
   * 只有 hash 唯一匹配的文件才会被认成同一身份；重复内容或重命名同时编辑一律不猜。
   */
  async reconcile(): Promise<ReconcileResult> {
    const next = await scanVault(this.root, this.state);
    const diff = diffScans(this.state, next);
    const { renames, ambiguous } = pairRenames(this.state, next, diff);

    for (const item of ambiguous) {
      await this.record("rename.ambiguous", item.from.join(", "), { sha256: item.sha256, to: item.to });
    }

    const repathed: ReconcileResult["repathed"] = [];
    for (const rename of renames) {
      const pages = await this.findSourcePages(next, rename.from);
      if (pages.length === 1) {
        const absolute = await resolveInsideVault(this.root, pages[0]);
        const state = await patchFrontmatter(absolute, pages[0], { source_path: rename.to });
        next.set(pages[0], state);
        repathed.push({ page: pages[0], from: rename.from, to: rename.to });
        await this.record("source.repath", pages[0], { from: rename.from, to: rename.to, sha256: rename.sha256 });
      } else if (pages.length > 1) {
        await this.record("rename.ambiguous", rename.from, { to: rename.to, pages });
      }
    }

    this.state = next;
    return { diff, renames, ambiguous, repathed };
  }

  private async findSourcePages(states: Map<string, VaultFileState>, rawPath: string): Promise<string[]> {
    const matches: string[] = [];
    for (const relative of states.keys()) {
      if (!relative.startsWith("wiki/") || !relative.toLowerCase().endsWith(".md")) continue;
      try {
        const data = await readFrontmatter(this.root, relative);
        if (data.source_path === rawPath) matches.push(relative);
      } catch {
        // 扫描后的竞态：文件刚被删掉，忽略。
      }
    }
    return matches;
  }

  private async availablePath(dir: string, stem: string): Promise<string> {
    for (let index = 1; index < 100; index += 1) {
      const relative = `${dir}/${stem}${index === 1 ? "" : `-${index}`}.md`;
      const absolute = await resolveInsideVault(this.root, relative);
      try {
        await readState(absolute, relative);
      } catch {
        return relative;
      }
    }
    throw new VaultError("FILE_EXISTS", "同名文件过多。");
  }

  private assertScope(relative: string, scope: "raw" | "wiki" | "any"): string {
    const safe = safeRelativePath(relative);
    if (scope !== "any" && !safe.startsWith(`${scope}/`)) {
      throw new VaultError("PATH_INVALID", `该操作只能作用于 ${scope}/ 下的文件。`);
    }
    return safe;
  }

  private authorize(operation: WriteOperation): void {
    if (operation === "write_raw") {
      if (this.actor.type !== "user") throw new VaultError("PERMISSION_DENIED", "AI 不得改写 Raw 正文。");
      return;
    }
    if (this.actor.type === "user") return;
    if (this.actor.type === "system") {
      if (operation === "write_page" || operation === "archive") return;
      throw new VaultError("PERMISSION_DENIED", "系统主体不允许执行该写入。");
    }
    if (this.mode === "readonly") throw new VaultError("PERMISSION_DENIED", "只读模式下不允许写入。");
    if (this.mode === "plan") throw new VaultError("APPROVAL_REQUIRED", "该写入需要用户审批。");
  }

  private async record(operation: string, relative: string, detail?: Record<string, unknown>): Promise<void> {
    await this.audit.record({
      at: this.now().toISOString(),
      actorType: this.actor.type,
      actorId: this.actor.id,
      operation,
      path: relative,
      detail,
    });
  }
}
