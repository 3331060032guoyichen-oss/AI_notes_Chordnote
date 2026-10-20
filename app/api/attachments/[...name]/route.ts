import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { resolveDataDir } from "../../../../lib/db/client";

export const runtime = "nodejs";

function attachmentDirectory() {
  return join(dirname(resolveDataDir()), "attachments");
}

function safeName(parts: string[]) {
  const name = parts.join("/").normalize("NFC");
  if (!name || name.startsWith("/") || name.split("/").some(part => !part || part === "." || part === ".." || /[<>:"\\|?*\u0000-\u001f]/.test(part))) throw new Error("附件路径无效。");
  return name;
}

export async function GET(_request: Request, context: { params: Promise<{ name: string[] }> }) {
  try {
    const { name: parts } = await context.params;
    const name = safeName(parts);
    const lower = name.toLowerCase();
    const contentType = lower.endsWith(".pdf") ? "application/pdf" : lower.endsWith(".html") || lower.endsWith(".xhtml") ? "text/html; charset=utf-8" : null;
    if (!contentType) return NextResponse.json({ error: { code: "FILE_TYPE_UNSUPPORTED", message: "目前只支持 PDF 和 HTML 附件。" } }, { status: 415 });
    const body = await readFile(join(attachmentDirectory(), name));
    return new NextResponse(body, { headers: { "Content-Type": contentType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: { code: "FILE_NOT_FOUND", message: "附件不存在。" } }, { status: 404 });
  }
}
