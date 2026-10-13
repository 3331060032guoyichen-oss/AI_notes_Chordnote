import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull, or } from "drizzle-orm";

import type { KnowledgeRelation } from "../../types/relation";
import { getUserContext } from "../auth/context";
import { getDb } from "../db/client";
import { links } from "../db/schema";

// 正式关系（links）服务层。
// 读路径默认排除已软删除的关系（deleted_at is null）。
//
// 写路径：
//   - createOrReviveLink —— 建立关系；同一对知识页（**无序**）只保留一条 related 关系，
//     已软删的会被"复活"而不是插入新行（links_pair_idx 不是部分索引，插入会撞唯一约束）
//   - softDeleteLink     —— 普通"移除"= 软删除（写 deleted_at），不做物理删除

type LinkRow = typeof links.$inferSelect;

function toRelation(row: LinkRow): KnowledgeRelation {
  return {
    id: row.id,
    sourceId: row.sourceNoteId,
    targetId: row.targetNoteId,
    // 数据库 CHECK 限定只允许 'related'
    type: "related",
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listLinks(): Promise<KnowledgeRelation[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(links)
    .where(and(eq(links.userId, userId), isNull(links.deletedAt)))
    .orderBy(desc(links.createdAt));

  return rows.map(toRelation);
}

export async function listLinksForNote(noteId: string): Promise<KnowledgeRelation[]> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.userId, userId),
        isNull(links.deletedAt),
        or(eq(links.sourceNoteId, noteId), eq(links.targetNoteId, noteId)),
      ),
    )
    .orderBy(desc(links.createdAt));

  return rows.map(toRelation);
}

export type CreateLinkInput = {
  sourceId: string;
  targetId: string;
  reason: string;
};

/**
 * 建立正式关系。
 *
 * 语义与旧实现保持一致：**同一对知识页（无序）只保留一条 `related` 关系**——
 * 所以 A→B 与 B→A 被视为同一条，重复提交不会产生第二条。
 * 返回的 `relation` 保留**首次建立时**的方向。
 *
 * 已软删除的关系会被复活（清空 `deleted_at`）并视为 `created: true`（用户视角是"重新建立"）。
 */
export async function createOrReviveLink(
  input: CreateLinkInput,
): Promise<{ relation: KnowledgeRelation; created: boolean }> {
  const { db } = await getDb();
  const { userId } = getUserContext();

  return db.transaction(async (tx) => {
    const existing = (
      await tx
        .select()
        .from(links)
        .where(
          and(
            eq(links.userId, userId),
            eq(links.type, "related"),
            or(
              and(eq(links.sourceNoteId, input.sourceId), eq(links.targetNoteId, input.targetId)),
              and(eq(links.sourceNoteId, input.targetId), eq(links.targetNoteId, input.sourceId)),
            ),
          ),
        )
        .limit(1)
        .for("update")
    )[0];

    if (existing && existing.deletedAt === null) {
      return { relation: toRelation(existing), created: false };
    }

    if (existing) {
      const revived = (
        await tx
          .update(links)
          .set({ deletedAt: null, reason: input.reason })
          .where(eq(links.id, existing.id))
          .returning()
      )[0];

      return { relation: toRelation(revived), created: true };
    }

    const inserted = (
      await tx
        .insert(links)
        .values({
          id: `link_${randomUUID()}`,
          userId,
          sourceNoteId: input.sourceId,
          targetNoteId: input.targetId,
          type: "related",
          reason: input.reason,
          origin: "user",
        })
        .returning()
    )[0];

    return { relation: toRelation(inserted), created: true };
  });
}

/** 普通"移除"= 软删除。影响 0 行（不存在或已软删）返回 false，调用方据此返回 404。 */
export async function softDeleteLink(id: string): Promise<boolean> {
  const { db } = await getDb();
  const { userId } = getUserContext();
  const rows = await db
    .update(links)
    .set({ deletedAt: new Date() })
    .where(and(eq(links.id, id), eq(links.userId, userId), isNull(links.deletedAt)))
    .returning();

  return rows.length > 0;
}
