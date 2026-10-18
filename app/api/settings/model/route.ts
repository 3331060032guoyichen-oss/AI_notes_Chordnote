import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";

import {
  PROVIDER_DEFAULTS,
  PROVIDER_IDS,
  isProviderId,
  publicModelSettings,
  readModelSettings,
  resolveModelSettings,
  updateModelSettings,
  type LockedField,
  type ModelSettingsPatch,
} from "../../../../lib/ai/config";
import { ProviderError } from "../../../../lib/ai/provider";
import { isLocalJsonRequest } from "../../../../lib/api/local-request";
import { getUserContext } from "../../../../lib/auth/context";
import { getDb } from "../../../../lib/db/client";
import { auditLog } from "../../../../lib/db/schema";

export const runtime = "nodejs";

/**
 * 模型配置（服务端唯一真相）。
 *
 * GET 返回脱敏状态：provider / 模型名 / 地址 / 超时 / 是否已配置密钥 / 哪些字段被环境变量锁住。
 * PATCH 只写 data/settings.json；密钥语义是「不传=保持、null=清除、字符串=设置」。
 * 前端永远拿不到密钥原文，也不能通过请求参数选择内部 provider。
 */

const PUBLIC_DEFAULTS = PROVIDER_IDS.map((id) => {
  const defaults = PROVIDER_DEFAULTS[id];

  return {
    provider: defaults.provider,
    model: defaults.model,
    baseUrl: defaults.baseUrl,
    timeoutMs: defaults.timeoutMs,
  };
});

function errorResponse(message: string, status: number, code: string) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function GET() {
  try {
    const { settings, locked } = resolveModelSettings(await readModelSettings());

    return NextResponse.json({
      settings: publicModelSettings(settings, locked),
      defaults: PUBLIC_DEFAULTS,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      return errorResponse(error.message, 500, error.code);
    }

    return errorResponse("模型配置暂时读不出来。", 500, "SETTINGS_READ_FAILED");
  }
}

const PATCH_KEYS = ["provider", "model", "baseUrl", "timeoutMs", "apiKey", "category", "vendor", "agentBackend", "acp"] as const;
const LOCKABLE: LockedField[] = ["provider", "model", "baseUrl", "timeoutMs", "apiKey"];

type PatchBody = Record<string, unknown>;

export async function PATCH(request: Request) {
  if (!isLocalJsonRequest(request)) {
    return errorResponse("只接受本页面的设置修改。", 403, "FORBIDDEN_ORIGIN");
  }

  let parsed: unknown;

  try {
    parsed = await request.json();
  } catch {
    return errorResponse("请求内容无法识别，请重新提交。", 400, "INVALID_JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return errorResponse("请求格式无法识别，请重新提交。", 400, "INVALID_BODY");
  }

  const body = parsed as PatchBody;

  for (const key of Object.keys(body)) {
    if (!(PATCH_KEYS as readonly string[]).includes(key)) {
      return errorResponse(`不认识的设置项：${key}。`, 400, "UNKNOWN_FIELD");
    }
  }

  const patch: ModelSettingsPatch = {};
  if (body.agentBackend !== undefined) {
    if (body.agentBackend !== "api" && body.agentBackend !== "acp") return errorResponse("Agent 运行方式无效",400,"INVALID_BACKEND");
    patch.agentBackend = body.agentBackend;
  }
  if (body.acp !== undefined) {
    const acp = body.acp as ModelSettingsPatch["acp"];
    if (!acp || typeof acp.command !== "string" || !isAbsolute(acp.command) || typeof acp.label !== "string" || acp.label.length > 100 || !Array.isArray(acp.args) || acp.args.length > 64 || acp.args.some(a=>typeof a !== "string" || a.length > 4000)) return errorResponse("ACP 需要可执行文件绝对路径和参数数组",400,"INVALID_ACP");
    patch.acp = {label:acp.label,command:acp.command,args:acp.args};
  }
  if (body.category !== undefined) {
    if (!["local","vendor","custom"].includes(String(body.category))) return errorResponse("配置分类无效",400,"INVALID_CATEGORY");
    patch.category = body.category as "local"|"vendor"|"custom";
  }
  if (body.vendor !== undefined) {
    if (typeof body.vendor !== "string" || body.vendor.length > 80) return errorResponse("厂商类型无效",400,"INVALID_VENDOR");
    patch.vendor = body.vendor;
  }

  if (body.provider !== undefined) {
    if (!isProviderId(body.provider)) {
      return errorResponse("不认识的模型提供者。", 400, "INVALID_PROVIDER");
    }

    patch.provider = body.provider;
  }

  if (body.model !== undefined) {
    if (typeof body.model !== "string") {
      return errorResponse("模型名必须是字符串。", 400, "INVALID_MODEL");
    }

    patch.model = body.model;
  }

  if (body.baseUrl !== undefined) {
    if (typeof body.baseUrl !== "string") {
      return errorResponse("服务地址必须是字符串。", 400, "INVALID_BASE_URL");
    }

    patch.baseUrl = body.baseUrl;
  }

  if (body.timeoutMs !== undefined) {
    if (typeof body.timeoutMs !== "number") {
      return errorResponse("超时时间必须是数字。", 400, "INVALID_TIMEOUT");
    }

    patch.timeoutMs = body.timeoutMs;
  }

  if (body.apiKey !== undefined) {
    // 空串与 undefined 都表示「保持现有密钥」；清除必须显式传 null。
    if (body.apiKey !== null && typeof body.apiKey !== "string") {
      return errorResponse("API Key 格式不对。", 400, "INVALID_API_KEY");
    }

    if (body.apiKey !== null && body.apiKey.trim() === "") {
      delete patch.apiKey;
    } else {
      patch.apiKey = body.apiKey as string | null;
    }
  }

  try {
    const current = resolveModelSettings(await readModelSettings());

    for (const field of LOCKABLE) {
      if (field in patch && current.locked.includes(field)) {
        return errorResponse(
          `${field} 由环境变量设置，界面不能修改。`,
          409,
          "ENV_LOCKED",
        );
      }
    }

    const saved = await updateModelSettings(patch);
    const warnings: string[] = [];

    try {
      const { db } = await getDb();
      const { userId } = getUserContext();

      await db.insert(auditLog).values({
        id: `audit_${randomUUID()}`,
        userId,
        actorType: "user",
        actorId: userId,
        operation: "settings.update",
        targetType: "settings",
        targetId: "model",
        result: "ok",
        // 只记录密钥状态，永远不记录密钥本身。
        detail: {
          provider: saved.provider,
          model: saved.model,
          baseUrl: saved.baseUrl,
          timeoutMs: saved.timeoutMs,
          apiKey:
            patch.apiKey === null ? "cleared" : patch.apiKey ? "set" : "unchanged",
        },
      });
    } catch {
      warnings.push("设置已保存，但审计记录没有写入。");
    }

    const resolved = resolveModelSettings(saved);

    return NextResponse.json({
      settings: publicModelSettings(resolved.settings, resolved.locked),
      warnings,
    });
  } catch (error) {
    if (error instanceof ProviderError) {
      const status = error.code === "CONFIG_INVALID" ? 400 : 500;

      return errorResponse(error.message, status, error.code);
    }

    return errorResponse("设置没有保存。", 500, "SETTINGS_WRITE_FAILED");
  }
}
