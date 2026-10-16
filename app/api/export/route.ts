import { NextResponse } from "next/server";

import { exportBundle, exportMarkdownBundle } from "../../../lib/services/bundle";

export const runtime = "nodejs";

/**
 * 导出知识包（`GET /api/export`）。
 *
 * 这是「数据是你的」这条承诺的兑现方式：一次性拿走原始记录、知识页、关联与修订历史，
 * 纯 JSON，不依赖这个应用也能读懂。附带 `Content-Disposition`，浏览器会直接下载
 * 成 `chordnote-bundle-<日期>.json`。
 */
export async function GET(request: Request) {
  const format = new URL(request.url).searchParams.get("format");

  // markdown 知识包：纯 markdown + YAML frontmatter 打成 zip，给"拿出去读/迁移"用。
  if (format === "markdown") {
    try {
      const { file, fileName } = await exportMarkdownBundle();

      return new NextResponse(new Uint8Array(file), {
        status: 200,
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${fileName}"`,
        },
      });
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "BUNDLE_EXPORT_FAILED",
            message: "markdown 知识包暂时没有导出。已保存的内容没有改变，请稍后重试。",
          },
        },
        { status: 500 },
      );
    }
  }

  try {
    const bundle = await exportBundle();
    const stamp = bundle.exportedAt.slice(0, 10);

    return new NextResponse(JSON.stringify(bundle, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="chordnote-bundle-${stamp}.json"`,
      },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "BUNDLE_EXPORT_FAILED",
          message: "知识包暂时没有导出。已保存的内容没有改变，请稍后重试。",
        },
      },
      { status: 500 },
    );
  }
}
