"use client";

import { useCallback, useEffect, useState } from "react";

import type { AuditEvent } from "../../types/audit";

type Family = "ingest" | "query" | "review" | "maintenance" | "session" | "failure";

const familyLabel: Record<Family, string> = {
  ingest: "ingest",
  query: "query",
  review: "review",
  maintenance: "maintenance",
  session: "session",
  failure: "failed",
};

const operationLabel: Record<string, string> = {
  "agent.query": "整理运行",
  "agent.run.failed": "整理失败",
  "assistant.answer": "AI 问答",
  "session.end": "结束会话",
  "note.create": "收录知识页",
  "note.sources.attach": "绑定来源",
  "note.classify": "调整知识页分类",
  "note.archive": "归档知识页",
  "note.restore": "恢复知识页",
  "note.purge": "永久清除知识页",
  "raw.classify": "归类原始记录",
  "raw.archive": "归档原始记录",
  "raw.restore": "恢复原始记录",
  "raw.update": "修改原始记录",
  "raw.append": "写入原始记录",
  "raw.purge": "永久清除原始记录",
  "link.archive": "删除关联",
  "link.restore": "恢复关联",
  "link.purge": "永久清除关联",
  "proposal.create": "提交提议",
  "proposal.approve": "批准提议",
  "proposal.reject": "拒绝提议",
  "proposal.apply": "应用提议",
  "proposal.cancel": "取消提议",
  "proposal.stale": "提议过期",
  "bundle.import": "导入知识包",
  "settings.update": "修改模型设置",
};

function familyOf(operation: string): Family {
  if (operation === "agent.run.failed") return "failure";
  if (operation === "agent.query" || operation === "assistant.answer") return "query";
  if (operation.startsWith("proposal.")) return "review";
  if (operation === "session.end") return "session";
  if (/\.(archive|restore|purge)$/.test(operation) || operation === "link.archive") return "maintenance";
  return "ingest";
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function permissionLabel(value: unknown) {
  return value === "full" ? "完全允许" : value === "read" ? "只读" : value === "propose" ? "可提议" : null;
}

function detailLines(event: AuditEvent): string[] {
  const detail = event.detail ?? {};
  const lines: string[] = [];

  if (event.operation === "agent.query" || event.operation === "agent.run.failed") {
    const permission = permissionLabel(detail.permission);
    if (permission) lines.push(`权限：${permission}`);
    if (Array.isArray(detail.steps)) {
      const steps = detail.steps
        .filter((step): step is Record<string, unknown> => Boolean(step) && typeof step === "object" && !Array.isArray(step))
        .slice(-6)
        .map(step => typeof step.detail === "string" ? step.detail : null)
        .filter((line): line is string => Boolean(line));
      lines.push(...steps);
    }
    if (detail.health && typeof detail.health === "object" && !Array.isArray(detail.health)) {
      const health = detail.health as Record<string, unknown>;
      lines.push(`体检：${health.warn ?? 0} 项告警 / ${health.info ?? 0} 项提示 / ${health.passed ?? 0} 项通过`);
    }
    if (typeof detail.readCount === "number" || typeof detail.citedCount === "number") {
      lines.push(`读取 ${typeof detail.readCount === "number" ? detail.readCount : 0} 页；引用 ${typeof detail.citedCount === "number" ? detail.citedCount : 0} 页`);
    }
    if (typeof detail.error === "string" && detail.error) lines.push(`错误：${detail.error}`);
    return lines;
  }

  if (event.operation === "note.create") lines.push("已收录为知识页");
  else if (event.operation === "note.sources.attach") {
    const count = typeof detail.sourceCount === "number" ? detail.sourceCount : 0;
    lines.push(`绑定 ${count} 条来源`);
  } else if (event.operation === "note.classify" || event.operation === "raw.classify") {
    if (typeof detail.category === "string") lines.push(`分类：${detail.category}`);
  } else if (event.operation === "raw.update") lines.push("原始记录正文已更新");
  else if (event.operation === "note.archive") lines.push("知识页已归档");
  else if (event.operation === "note.restore") lines.push("知识页已恢复");
  else if (event.operation === "raw.archive") lines.push("原始记录已归档");
  else if (event.operation === "raw.restore") lines.push("原始记录已恢复");
  else if (event.operation === "link.archive") lines.push("关联已删除");
  else if (event.operation === "link.restore") lines.push("关联已恢复");
  else if (event.operation === "proposal.create") lines.push("等待确认");
  else if (event.operation === "proposal.apply") lines.push("提议已应用");
  else if (event.operation === "proposal.reject") lines.push("提议已拒绝");
  else if (event.operation === "proposal.stale") lines.push("提议已过期");
  else if (event.operation.endsWith(".purge")) lines.push(typeof detail.reason === "string" ? `理由：${detail.reason}` : "已永久清除");
  else if (typeof detail.reason === "string" && detail.reason) lines.push(detail.reason);

  return lines;
}

export function WikiLogView() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/audit?limit=80");
      const payload = await response.json() as { events?: AuditEvent[]; error?: { message?: string } };
      if (!response.ok || !payload.events) throw new Error(payload.error?.message ?? "操作日志暂时没有载入。");
      setEvents(payload.events);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <section className="wiki-log" aria-labelledby="wiki-log-title">
    <header className="wiki-log-head">
      <div>
        <h1 id="wiki-log-title">Wiki Log<span>{events.length}</span></h1>
        <p>只读操作记录，按时间倒序读取本机审计日志。Agent 整理、收录、关联与归档都会留下记录。</p>
      </div>
      <button className="button-secondary" type="button" onClick={() => void load()} disabled={status === "loading"}>
        {status === "loading" ? "读取中" : "刷新"}
      </button>
    </header>

    {status === "loading" && events.length === 0 ? <div className="library-empty"><h2>正在读取日志</h2><p>记录仍在本机，不会因为刷新而改变。</p></div>
      : status === "error" ? <div className="library-empty"><h2>日志暂时没有载入</h2><p>已有记录没有改变，稍后可以再试。</p><button className="button-secondary" type="button" onClick={() => void load()}>重试</button></div>
        : events.length === 0 ? <div className="library-empty"><h2>暂无操作记录</h2><p>Agent 整理或修改知识页后，这里会出现记录。</p></div>
          : <ol className="wiki-log-list">
            {events.map(event => {
              const family = familyOf(event.operation);
              const lines = detailLines(event);
              return <li className="wiki-log-entry" data-family={family} key={event.id}>
                <div className="wiki-log-top">
                  <span className="wiki-log-family">{familyLabel[family]}</span>
                  <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
                  <span className="wiki-log-result">{event.result === "ok" ? "完成" : event.result}</span>
                </div>
                <h2>
                  <code>{event.operation}</code>
                  {operationLabel[event.operation] ?? event.operation}
                  {event.targetTitle ? <span className="wiki-log-target"> · {event.targetTitle}</span> : null}
                </h2>
                {lines.length ? <ul>{lines.map((line, index) => <li key={`${event.id}-${index}`}>{line}</li>)}</ul> : null}
              </li>;
            })}
          </ol>}
  </section>;
}
