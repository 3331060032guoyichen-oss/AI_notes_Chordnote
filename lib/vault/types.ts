/** Vault 文件的共享类型与错误。独立模块：不依赖数据库、HTTP 或 React。 */

export type VaultMode = "readonly" | "plan" | "trusted";
export type VaultActorType = "user" | "agent" | "system";
export type VaultActor = { type: VaultActorType; id: string };

export type VaultErrorCode =
  | "PERMISSION_DENIED"
  | "APPROVAL_REQUIRED"
  | "PATH_INVALID"
  | "PATH_OUTSIDE_VAULT"
  | "FILE_MISSING"
  | "FILE_EXISTS"
  | "EXTERNAL_MODIFICATION"
  | "EXTERNAL_DELETE"
  | "FILE_LOCKED"
  | "APPEND_CONFLICT"
  | "INVALID_ARGUMENT";

export class VaultError extends Error {
  constructor(
    public readonly code: VaultErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VaultError";
  }
}

export type VaultFileState = {
  /** Vault 相对路径，正斜杠，NFC。 */
  path: string;
  sha256: string;
  size: number;
  mtimeMs: number;
};

export type VaultAuditEvent = {
  at: string;
  actorType: VaultActorType;
  actorId: string;
  operation: string;
  path: string;
  detail?: Record<string, unknown>;
};

export interface AuditSink {
  record(event: VaultAuditEvent): void | Promise<void>;
}

export type ScanDiff = { added: string[]; changed: string[]; removed: string[] };
export type RenamePair = { from: string; to: string; sha256: string };
