import { randomUUID } from "node:crypto";
import { and, eq, or, count, sql, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { getUserContext } from "../auth/context";
import { requireUserActor } from "../auth/authorize";
import { auditLog, notes, rawNotes, noteRevisions, proposals, links, noteAiMetadata } from "../db/schema";
import { listArchivedNotes } from "./notes";
import { listArchivedSources } from "./sources";

const proposalReferences = (id: string) => or(eq(proposals.targetNoteId,id), sql`${proposals.payload}->>'sourceId' = ${id}`, sql`${proposals.payload}->>'targetId' = ${id}`, sql`${proposals.payload}->>'noteId' = ${id}`);

export async function archiveItems() {
  const [raws, knowledge] = await Promise.all([listArchivedSources(), listArchivedNotes()]);
  const { db } = await getDb(); const { userId } = getUserContext();
  const archivedLinks = await db.select().from(links).where(and(eq(links.userId,userId),isNotNull(links.deletedAt)));
  const titles = new Map((await db.select({id:notes.id,title:notes.title}).from(notes).where(eq(notes.userId,userId))).map(note => [note.id,note.title]));
  const documents = await Promise.all([...raws.map(item => ({ ...item, kind:"raw" as const })), ...knowledge.map(item => ({ ...item, kind:"knowledge" as const }))].map(async item => {
    const revisions = item.kind === "knowledge" ? (await db.select({ n:count() }).from(noteRevisions).where(and(eq(noteRevisions.userId,userId),eq(noteRevisions.noteId,item.id))))[0].n : 0;
    const relations = item.kind === "knowledge" ? (await db.select({ n:count() }).from(links).where(and(eq(links.userId,userId),or(eq(links.sourceNoteId,item.id),eq(links.targetNoteId,item.id)))))[0].n : 0;
    const pending = item.kind === "knowledge" ? (await db.select({ n:count() }).from(proposals).where(and(eq(proposals.userId,userId),proposalReferences(item.id))))[0].n : 0;
    return { ...item, dependencies:{ revisions, relations, proposals:pending } };
  }));
  return [...documents,...archivedLinks.map(link => ({
    id:link.id,kind:"relation" as const,title:`${titles.get(link.sourceNoteId)??link.sourceNoteId} ↔ ${titles.get(link.targetNoteId)??link.targetNoteId}`,
    path:"正式关系",dependencies:{revisions:0,relations:0,proposals:0},
  }))];
}
export async function restoreRelation(id: string) {
  requireUserActor(getUserContext());
  const { db } = await getDb(); const { userId } = getUserContext();
  return db.transaction(async tx => {
    const [row] = await tx.update(links).set({deletedAt:null}).where(and(eq(links.id,id),eq(links.userId,userId),isNotNull(links.deletedAt))).returning();
    if (!row) return null;
    await tx.insert(auditLog).values({id:`audit_${randomUUID()}`,userId,actorType:"user",actorId:userId,operation:"link.restore",targetType:"link",targetId:id,result:"ok",detail:{sourceId:row.sourceNoteId,targetId:row.targetNoteId}});
    return row;
  });
}
export async function restoreRaw(id: string) {
  requireUserActor(getUserContext());
  const { db } = await getDb(); const { userId } = getUserContext();
  return db.transaction(async tx => {
    const [row] = await tx.update(rawNotes).set({ archivedAt:null,updatedAt:new Date() }).where(and(eq(rawNotes.id,id),eq(rawNotes.userId,userId))).returning();
    if (!row) return null;
    await tx.insert(auditLog).values({ id:`audit_${randomUUID()}`,userId,actorType:"user",actorId:userId,operation:"raw.restore",targetType:"raw",targetId:id,result:"ok",detail:{path:row.path} });
    return row;
  });
}
export async function purgeArchived(kind: "raw"|"knowledge"|"relation", id: string, reason: string, consent: boolean) {
  requireUserActor(getUserContext());
  const { db } = await getDb(); const { userId } = getUserContext();
  return db.transaction(async tx => {
    if (kind === "relation") {
      const [link] = await tx.select().from(links).where(and(eq(links.id,id),eq(links.userId,userId))).for("update");
      if (!link) return {status:"not_found" as const};
      if (!link.deletedAt) return {status:"not_archived" as const};
      if (!consent) return {status:"consent_required" as const};
      await tx.delete(links).where(and(eq(links.id,id),eq(links.userId,userId)));
      await tx.insert(auditLog).values({id:`audit_${randomUUID()}`,userId,actorType:"user",actorId:userId,operation:"link.purge",targetType:"link",targetId:id,result:"ok",detail:{reason,sourceId:link.sourceNoteId,targetId:link.targetNoteId}});
      return {status:"ok" as const};
    }
    const table = kind === "raw" ? rawNotes : notes;
    const [row] = await tx.select().from(table).where(and(eq(table.id,id),eq(table.userId,userId))).for("update");
    if (!row) return { status:"not_found" as const };
    if (!row.archivedAt) return { status:"not_archived" as const };
    if (!consent) return { status:"consent_required" as const };
    if (kind === "raw") {
      const dependents = await tx.select({id:notes.id}).from(notes).where(and(eq(notes.userId,userId),eq(notes.rawId,id)));
      if (dependents.length) return { status:"referenced" as const };
    } else {
      // Explicit, user-reviewed removals. No cascading history/relationship deletion.
      await tx.delete(links).where(and(eq(links.userId,userId),or(eq(links.sourceNoteId,id),eq(links.targetNoteId,id))));
      await tx.delete(proposals).where(and(eq(proposals.userId,userId),proposalReferences(id)));
      await tx.delete(noteRevisions).where(and(eq(noteRevisions.userId,userId),eq(noteRevisions.noteId,id)));
      await tx.delete(noteAiMetadata).where(and(eq(noteAiMetadata.userId,userId),eq(noteAiMetadata.noteId,id)));
    }
    await tx.delete(table).where(and(eq(table.userId,userId),eq(table.id,id)));
    await tx.insert(auditLog).values({id:`audit_${randomUUID()}`,userId,actorType:"user",actorId:userId,operation:`${kind === "raw" ? "raw" : "note"}.purge`,targetType:kind,targetId:id,result:"ok",detail:{reason,path:row.path,title:row.title}});
    return { status:"ok" as const };
  });
}
