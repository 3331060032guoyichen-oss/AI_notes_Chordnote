export type RelatedKnowledgeSuggestion = {
  knowledgeId: string;
  reason: string;
};

export type OrganizeDraft = {
  rawCategory?: import("../lib/documents/structure").RawCategory;
  title: string;
  summary: string;
  content: string;
  keyPoints: string[];
  concepts: string[];
  keywords: string[];
  relatedKnowledge: RelatedKnowledgeSuggestion[];
};
