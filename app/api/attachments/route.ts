import { mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { NextResponse } from "next/server";
import { resolveDataDir } from "../../../lib/db/client";

export const runtime = "nodejs";

const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["application/pdf", ".pdf"],
  ["text/html", ".html"],
  ["application/xhtml+xml", ".html"],
]);

function attachmentDirectory() {
  return join(dirname(resolveDataDir()), "attachments");
}

function safeFileName(value: string, extension: string) {
  const name = basename(value).normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
  if (!name || name === "." || name === ".." || name.length > 180) throw new Error("附件文件名无效。");
  const withoutExtension = name.replace(/\.(pdf|html?|xhtml)$/i, "");
  return `${withoutExtension || "附件"}${extension}`;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const entry = form.get("file");
  if (!(entry instanceof File)) return NextResponse.json({ error: { code: "FILE_REQUIRED", message: "请选择 PDF 或 HTML 文件。" } }, { status: 400 });
  if (entry.size > MAX_ATTACHMENT_BYTES) return NextResponse.json({ error: { code: "FILE_TOO_LARGE", message: "附件不能超过 50 MB。" } }, { status: 413 });
  const extension = ALLOWED_TYPES.get(entry.type) ?? (entry.name.toLowerCase().endsWith(".pdf") ? ".pdf" : entry.name.toLowerCase().match(/\.x?html?$/) ? ".html" : null);
  if (!extension) return NextResponse.json({ error: { code: "FILE_TYPE_UNSUPPORTED", message: "目前只支持 PDF 和 HTML 附件。" } }, { status: 415 });
  try {
    const name = safeFileName(entry.name, extension);
    const directory = attachmentDirectory();
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), Buffer.from(await entry.arrayBuffer()));
    return NextResponse.json({ attachment: { name, kind: extension === ".pdf" ? "pdf" : "html", href: `/api/attachments/${encodeURIComponent(name)}` } }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: { code: "ATTACHMENT_WRITE_FAILED", message: error instanceof Error ? error.message : "附件保存失败。" } }, { status: 500 });
  }
}
