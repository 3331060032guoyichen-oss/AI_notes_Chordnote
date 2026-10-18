import { NextResponse } from "next/server";
import { archiveItems, purgeArchived, restoreRaw } from "../../../lib/services/archive";
import { setNoteArchived } from "../../../lib/services/notes";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ items: await archiveItems() }); }
export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !["raw","knowledge"].includes(body.kind)) return NextResponse.json({error:{message:"归档项无效"}}, {status:400});
  const result = body.kind === "raw" ? await restoreRaw(body.id) : await setNoteArchived(body.id,false);
  if (!result || ("status" in result && result.status === "not_found")) return NextResponse.json({error:{message:"归档项不存在"}}, {status:404});
  return NextResponse.json({ restored:true });
}
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string" || !["raw","knowledge"].includes(body.kind) || typeof body.reason !== "string" || !body.reason.trim() || body.reason.length > 2000) return NextResponse.json({error:{message:"需要归档项和永久删除原因"}}, {status:400});
  const result = await purgeArchived(body.kind,body.id,body.reason.trim(),body.confirmDependencies === true);
  if (result.status !== "ok") return NextResponse.json({error:{code:result.status,message:result.status === "referenced" ? "请先处理仍引用这条原始记录的知识页，包括已归档的知识页。" : "只能永久删除已归档且已确认依赖的内容。"}}, {status:result.status === "not_found" ? 404:409});
  return NextResponse.json({ purged:true });
}
