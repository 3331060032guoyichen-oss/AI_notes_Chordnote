import { and, eq } from "drizzle-orm";
import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { canvases } from "../db/schema";
export type CanvasPoint = { x: number; y: number };
export type CanvasCard = { id: string; x: number; y: number; text: string; noteId?: string; archived?: boolean };
export type CanvasImage = { id: string; x: number; y: number; width: number; height: number; src: string; name: string; archived?: boolean };
export type CanvasStroke = { id: string; color: string; width: number; points: CanvasPoint[] };
export type CanvasDocument = {
  cards: CanvasCard[];
  edges: { from: string; to: string }[];
  /** Optional for backward compatibility with canvases saved before freehand/image support. */
  images?: CanvasImage[];
  strokes?: CanvasStroke[];
};
export function validCanvas(value: unknown): value is CanvasDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as CanvasDocument;
  if (!Array.isArray(d.cards) || !Array.isArray(d.edges)) return false;
  const images = d.images ?? [];
  const strokes = d.strokes ?? [];
  if (!Array.isArray(images) || !Array.isArray(strokes)) return false;
  const nodeIds = new Set([...d.cards.map(c => c.id), ...images.map(image => image.id)]);
  return d.cards.length <= 1000 && d.edges.length <= 3000 && images.length <= 40 && strokes.length <= 2000 &&
    d.cards.every(c => c && typeof c.id === "string" && c.id.length > 0 && c.id.length <= 200 && Number.isFinite(c.x) && Number.isFinite(c.y) && typeof c.text === "string" && c.text.length <= 50_000 && (c.noteId === undefined || typeof c.noteId === "string") && (c.archived === undefined || typeof c.archived === "boolean")) &&
    images.every(image => image && typeof image.id === "string" && image.id.length > 0 && image.id.length <= 200 && Number.isFinite(image.x) && Number.isFinite(image.y) && Number.isFinite(image.width) && image.width >= 80 && image.width <= 1200 && Number.isFinite(image.height) && image.height >= 60 && image.height <= 1200 && typeof image.name === "string" && image.name.length <= 300 && typeof image.src === "string" && image.src.length <= 4_000_000 && /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(image.src) && (image.archived === undefined || typeof image.archived === "boolean")) &&
    strokes.every(stroke => stroke && typeof stroke.id === "string" && stroke.id.length > 0 && stroke.id.length <= 200 && typeof stroke.color === "string" && /^#[0-9a-f]{6}$/i.test(stroke.color) && Number.isFinite(stroke.width) && stroke.width >= 1 && stroke.width <= 24 && Array.isArray(stroke.points) && stroke.points.length >= 1 && stroke.points.length <= 10_000 && stroke.points.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))) &&
    nodeIds.size === d.cards.length + images.length &&
    d.edges.every(e => e && typeof e.from === "string" && typeof e.to === "string" && e.from !== e.to && nodeIds.has(e.from) && nodeIds.has(e.to));
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
