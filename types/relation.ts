export type LinkType = "related" | "supports" | "contradicts" | "example" | "prerequisite";

export type KnowledgeRelation = {
  id: string;
  sourceId: string;
  targetId: string;
  type: LinkType;
  reason: string;
  /** 支撑这条关系的原文片段；有方向的关系类型必须有。 */
  evidence: string | null;
  createdAt: string;
};
