import { NextResponse } from "next/server";
import { createLinkedDocument, documentReferences } from "../../../lib/services/documents";
export const runtime = "nodejs";
export async function GET() { return NextResponse.json(await documentReferences()); }
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.target !== "string" || !body.target.trim()) return NextResponse.json({ error: { message: "缺少链接目标" } }, { status: 400 });
  try { return NextResponse.json({ document: await createLinkedDocument(body.target.trim()) }, { status: 201 }); }
  catch { return NextResponse.json({ error: { message: "链接目标路径无效或已存在" } }, { status: 409 }); }
}
