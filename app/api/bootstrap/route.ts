import { NextResponse } from "next/server";

import { readGraph } from "../../../lib/services/graph";
import { listArchivedNotes, listNotes } from "../../../lib/services/notes";
import { listProposals } from "../../../lib/services/proposals";
import { listSources } from "../../../lib/services/sources";

export const runtime = "nodejs";

/**
 * First-paint data is intentionally read in one route. PGlite has a single
 * writer and Next development route bundles can initialise independently;
 * a fan-out of six database routes on page load causes unnecessary contention.
 */
export async function GET() {
  try {
    const [raws, knowledges, archivedKnowledges, graph, pending, approved] = await Promise.all([
      listSources(),
      listNotes(),
      listArchivedNotes(),
      readGraph(),
      listProposals({ status: "pending", limit: 100 }),
      listProposals({ status: "approved", limit: 100 }),
    ]);
    return NextResponse.json({
      raws,
      knowledges,
      archivedKnowledges,
      graph,
      proposals: [...pending.proposals, ...approved.proposals],
    });
  } catch {
    return NextResponse.json(
      { error: { code: "WORKSPACE_BOOTSTRAP_FAILED", message: "工作区暂时没有载入。你的本地记录没有受到影响，请稍后重试。" } },
      { status: 500 },
    );
  }
}
