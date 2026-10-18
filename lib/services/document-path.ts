import { and, eq } from "drizzle-orm";
import { getUserContext } from "../auth/context";
import type { DbTransaction } from "../db/client";
import { notes, rawNotes } from "../db/schema";
import { safeDocumentPath } from "../documents/markdown";

export async function availableDocumentPath(tx: DbTransaction, path: string, id: string) {
  const normalized = safeDocumentPath(path);
  const { userId } = getUserContext();
  for (const table of [rawNotes, notes]) {
    const rows = await tx.select({id:table.id,path:table.path}).from(table).where(and(eq(table.userId,userId)));
    if (rows.some(row => row.id !== id && row.path?.normalize("NFC").toLowerCase() === normalized.toLowerCase())) throw new Error("笔记路径已被占用。");
  }
  return normalized;
}
