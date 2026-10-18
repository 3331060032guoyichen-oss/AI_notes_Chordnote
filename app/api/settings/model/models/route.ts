import { NextResponse } from "next/server";
import { readModelSettings, resolveModelSettings, toProviderConfig } from "../../../../../lib/ai/config";
import { createChatProvider } from "../../../../../lib/ai/provider";
export const runtime = "nodejs";
export async function GET() {
  try { const { settings } = resolveModelSettings(await readModelSettings());
    if(settings.agentBackend === "acp") return NextResponse.json({models:[settings.model],selected:settings.model,discovery:"ACP 模型由会话协商；可在自定义模型中指定 model id。"});
    return NextResponse.json({ models: await createChatProvider(toProviderConfig(settings)).listModels(), selected: settings.model }); }
  catch { return NextResponse.json({ error: { message: "获取模型失败，请检查端点与凭据。" } }, { status: 502 }); }
}
