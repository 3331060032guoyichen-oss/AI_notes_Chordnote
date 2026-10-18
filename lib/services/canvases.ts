import { and, eq } from "drizzle-orm";
import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { canvases } from "../db/schema";
export type CanvasCard = { id: string; x: number; y: number; text: string; noteId?: string; archived?: boolean };
export type CanvasDocument = { cards: CanvasCard[]; edges: { from: string; to: string }[] };
export function validCanvas(value: unknown): value is CanvasDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as CanvasDocument;
  return Array.isArray(d.cards) && d.cards.length <= 1000 && Array.isArray(d.edges) && d.edges.length <= 3000 &&
    d.cards.every(c => c && typeof c.id === "string" && c.id.length > 0 && c.id.length <= 200 && Number.isFinite(c.x) && Number.isFinite(c.y) && typeof c.text === "string" && c.text.length <= 50_000 && (c.noteId === undefined || typeof c.noteId === "string") && (c.archived === undefined || typeof c.archived === "boolean")) &&
    new Set(d.cards.map(c => c.id)).size === d.cards.length &&
    d.edges.every(e => e && typeof e.from === "string" && typeof e.to === "string" && e.from !== e.to && d.cards.some(c => c.id === e.from) && d.cards.some(c => c.id === e.to));
}
export async function readCanvas() {
  const { db } = await getDb(); const { userId } = getUserContext();
  return (await db.select().from(canvases).where(and(eq(canvases.userId, userId), eq(canvases.id, `${userId}:main`))))[0] ?? null;
}
export async function saveCanvas(document: CanvasDocument, version: number) {
  const { db } = await getDb(); const { userId } = getUserContext();
  return db.transaction(async tx => {
    const current = (await tx.select().from(canvases).where(and(eq(canvases.userId, userId), eq(canvases.id, `${userId}:main`))).for("update"))[0];
    if (current && current.version !== version) throw new Error("VERSION_CONFLICT");
    if (!current) {
      if(version !== 0) throw new Error("VERSION_CONFLICT");
      return (await tx.insert(canvases).values({ id: `${userId}:main`, userId, title: "canvas", document }).returning())[0];
    }
    return (await tx.update(canvases).set({ document, version: version + 1, updatedAt: new Date() }).where(and(eq(canvases.userId, userId), eq(canvases.id, current.id))).returning())[0];
  });
}
