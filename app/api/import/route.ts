import { NextResponse } from "next/server";

import { importBundle } from "../../../lib/services/bundle";

export const runtime = "nodejs";

/**
 * 导入知识包（`POST /api/import`）。
 *
 * 请求体：知识包 JSON，或直接给它一个对象（会自动识别 `sources` / `notes` / `links` 字段）。
 * `?dryRun=1` 只算数不写库，用来先看清"会新增多少、跳过多少"。
 *
 * 合并策略见 `lib/services/bundle.ts`：同名一律保留已有、跳过导入，永不覆盖。
 */
export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "知识包内容无法识别，请确认选的是导出的那个文件。" } },
      { status: 400 },
    );
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";

  try {
    const result = await importBundle(payload, { dryRun });
    return NextResponse.json({ dryRun, result });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "BUNDLE_IMPORT_FAILED",
          message: error instanceof Error ? error.message : "知识包暂时没有导入。请确认文件来自 Chordnote。",
        },
      },
      { status: 400 },
    );
  }
}
