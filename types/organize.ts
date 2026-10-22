export type RelatedKnowledgeSuggestion = {
  knowledgeId: string;
  reason: string;
};

export type OrganizeDraft = {
  rawCategory: import("../lib/documents/structure").RawCategory;
  /** Wiki 中经 Agent 判断、供用户确认的目标类别。 */
  wikiCategory: import("../lib/documents/structure").WikiCategory;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  concepts: string[];
  keywords: string[];
  relatedKnowledge: RelatedKnowledgeSuggestion[];
};
