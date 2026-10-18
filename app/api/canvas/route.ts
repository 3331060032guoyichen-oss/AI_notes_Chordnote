import { NextResponse } from "next/server";
import { readCanvas, saveCanvas, validCanvas } from "../../../lib/services/canvases";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ canvas: await readCanvas() }); }
export async function PUT(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !validCanvas(body.document) || !Number.isInteger(body.version) || body.version < 0) return NextResponse.json({ error: { message: "白板内容无效" } }, { status: 400 });
  try { return NextResponse.json({ canvas: await saveCanvas(body.document, body.version) }); }
  catch { return NextResponse.json({ error: { message: "白板已有新版本，请保存当前内容后重新载入" } }, { status: 409 }); }
}
