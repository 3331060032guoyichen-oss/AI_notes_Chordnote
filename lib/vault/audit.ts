import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import type { AuditSink, VaultAuditEvent } from "./types";

export class MemoryAuditSink implements AuditSink {
  readonly events: VaultAuditEvent[] = [];
  record(event: VaultAuditEvent): void {
    this.events.push(event);
  }
}

/** `.chordnote/audit.jsonl`：追加写，不进 Git，不参与索引。 */
export class JsonlAuditSink implements AuditSink {
  constructor(private readonly root: string) {}

  async record(event: VaultAuditEvent): Promise<void> {
    const file = path.join(this.root, ".chordnote", "audit.jsonl");
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, `${JSON.stringify(event)}\n`, "utf8");
  }
}
