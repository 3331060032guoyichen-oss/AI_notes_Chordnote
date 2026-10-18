import { NextResponse } from "next/server";

import { getNote } from "../../../../../lib/services/notes";
import { documentReferences } from "../../../../../lib/services/documents";
import { listLinksForNote } from "../../../../../lib/services/links";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const knowledge = await getNote(id);

    if (!knowledge) {
      return NextResponse.json(
        { error: { code: "KNOWLEDGE_NOT_FOUND", message: "这张知识页已不存在，请刷新目录。" } },
        { status: 404 },
      );
    }

    const relations = await listLinksForNote(id);
    const backlinks = (
      await Promise.all(
        relations.map((relation) =>
          getNote(
            relation.sourceId === id ? relation.targetId : relation.sourceId,
          ),
        ),
      )
    ).filter((item): item is NonNullable<typeof item> => item !== null);

    const { documents, references } = await documentReferences();
    const ids = new Set(references.filter(r => r.targetId === id).map(r => r.sourceId));
    return NextResponse.json({ backlinks, documentBacklinks: documents.filter(d => ids.has(d.id)), references: references.filter(r => r.sourceId === id || r.targetId === id) });
  } catch {
    return NextResponse.json(
      { error: { code: "BACKLINK_READ_FAILED", message: "相关的交叉引用暂时没有载入。知识页没有受到影响，请稍后重试。" } },
      { status: 500 },
    );
  }
}
