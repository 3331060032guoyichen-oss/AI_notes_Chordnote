/** 操作日志的一条只读记录，对应 audit_log。 */
export type AuditEvent = {
  id: string;
  operation: string;
  targetType: string;
  /** 已解析成可读标题；无法解析时为 null，不向前端暴露 UUID。 */
  targetTitle: string | null;
  result: string;
  detail: Record<string, unknown> | null;
  createdAt: string;
};
