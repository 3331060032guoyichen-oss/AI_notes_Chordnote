import path from "node:path";

import { readState } from "./files";
import type { VaultFileState } from "./types";

const IGNORED_DIRS = new Set([".chordnote", ".obsidian", ".git", "node_modules"]);

function ignoredName(name: string): boolean {
  return name.startsWith(".") || name.endsWith(".tmp") || name.startsWith("~$");
}

export type VaultWatchEvent =
  | { kind: "add" | "change" | "unlink"; path: string; self: boolean }
  | { kind: "rename"; from: string; to: string; sha256: string; self: boolean }
  | { kind: "error"; error: Error };

export type VaultWatcher = {
  close(): Promise<void>;
  /** 应用自己的写入先登记 hash，Watcher 事件据此标记为 self，避免重复解析。 */
  suppress(relative: string, digest: string): void;
};

export type StartVaultWatcherOptions = {
  root: string;
  initial: Map<string, VaultFileState>;
  onEvent: (event: VaultWatchEvent) => void | Promise<void>;
  debounceMs?: number;
  renameWindowMs?: number;
};

/**
 * Chokidar 为主、hash 为准。
 * 事件只是提醒，是否真的变了由文件 hash 判断；漏掉的事件交给 service.reconcile 扫描兜底。
 */
export async function startVaultWatcher(options: StartVaultWatcherOptions): Promise<VaultWatcher> {
  const root = path.resolve(options.root);
  const debounceMs = options.debounceMs ?? 150;
  const renameWindowMs = options.renameWindowMs ?? 2_000;
  const states = new Map(options.initial);
  const suppressed = new Map<string, string>();
  const pending = new Map<string, NodeJS.Timeout>();
  const unlinked = new Map<string, { digest: string; timer: NodeJS.Timeout }>();
  let closed = false;
  let attempt = 0;

  const { watch } = await import("chokidar");
  const watchOptions = {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
    ignored: (candidate: string) => {
      const relative = path.relative(root, candidate);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
      const segments = relative.split(path.sep);
      if (segments.some((segment) => IGNORED_DIRS.has(segment))) return true;
      const name = segments[segments.length - 1] ?? "";
      return Boolean(name) && ignoredName(name);
    },
  };
  let watcher = watch(root, watchOptions);

  const emit = (event: VaultWatchEvent) => options.onEvent(event);

  const relativeOf = (absolute: string) => path.relative(root, absolute).split(path.sep).join("/");

  const stateOf = async (absolute: string) => {
    try {
      const { state } = await readState(absolute, relativeOf(absolute));
      return state;
    } catch {
      return null;
    }
  };

  const schedule = (event: "add" | "change", absolute: string) => {
    const key = `${event}:${absolute}`;
    clearTimeout(pending.get(key));
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        void settle(event, absolute);
      }, debounceMs),
    );
  };

  const settle = async (event: "add" | "change", absolute: string) => {
    if (closed) return;
    const relative = relativeOf(absolute);
    const state = await stateOf(absolute);
    if (!state) return;

    if (event === "add") {
      const candidate = [...unlinked.entries()].find(([, value]) => value.digest === state.sha256);
      if (candidate) {
        clearTimeout(candidate[1].timer);
        unlinked.delete(candidate[0]);
        states.delete(candidate[0]);
        states.set(relative, state);
        const self = suppressed.get(relative) === state.sha256;
        if (self) suppressed.delete(relative);
        await emit({ kind: "rename", from: candidate[0], to: relative, sha256: state.sha256, self });
        return;
      }
    }

    const before = states.get(relative);
    states.set(relative, state);
    if (event === "change" && before?.sha256 === state.sha256) return;
    const self = suppressed.get(relative) === state.sha256;
    if (self) suppressed.delete(relative);
    await emit({ kind: event, path: relative, self });
  };

  const markUnlinked = (relative: string) => {
    const known = states.get(relative);
    states.delete(relative);
    const digest = known?.sha256 ?? "";
    const timer = setTimeout(() => {
      unlinked.delete(relative);
      void emit({ kind: "unlink", path: relative, self: false });
    }, renameWindowMs);
    unlinked.set(relative, { digest, timer });
  };

  const bind = () => {
    watcher
      .on("add", (absolute: string) => schedule("add", absolute))
      .on("change", (absolute: string) => schedule("change", absolute))
      .on("unlink", (absolute: string) => markUnlinked(relativeOf(absolute)))
      .on("unlinkDir", (absolute: string) => {
        const prefix = `${relativeOf(absolute)}/`;
        for (const relative of [...states.keys()]) if (relative.startsWith(prefix)) markUnlinked(relative);
      })
      .on("error", (cause: unknown) => {
        void emit({ kind: "error", error: cause instanceof Error ? cause : new Error(String(cause)) });
        if (closed || attempt >= 3) return;
        attempt += 1;
        void watcher.close().finally(() => {
          const delay = 1_000 * 3 ** (attempt - 1);
          setTimeout(() => {
            if (closed) return;
            watcher = watch(root, watchOptions);
            bind();
          }, delay);
        });
      })
      .on("ready", () => {
        attempt = 0;
      });
  };

  bind();

  // 等到初始扫描结束再返回，否则启动瞬间的写入会被 ignoreInitial 吞掉。
  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    watcher.once("ready", done);
    setTimeout(done, 5_000);
  });

  return {
    async close() {
      closed = true;
      for (const timer of pending.values()) clearTimeout(timer);
      for (const value of unlinked.values()) clearTimeout(value.timer);
      pending.clear();
      unlinked.clear();
      await watcher.close();
    },
    suppress(relative, digest) {
      suppressed.set(relative.normalize("NFC"), digest);
    },
  };
}
