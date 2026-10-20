import { listNotes } from "./notes";
import { listSources, createSource } from "./sources";
import { requireUserActor } from "../auth/authorize";
import { getUserContext } from "../auth/context";
import { parseWikiReferences, resolveReference, safeDocumentPath, makeMarkdown } from "../documents/markdown";

/** Derived on every query from canonical Markdown, so edits, proposals and restores cannot leave stale backlinks. */
export async function listDocuments() {
  const [raws, knowledge] = await Promise.all([listSources(), listNotes()]);
  return [...raws.map(r => ({ id: r.id, kind: "raw" as const, title: r.title ?? "未命名", path: r.path!, markdown: r.markdown! })),
    ...knowledge.map(n => ({ id: n.id, kind: "knowledge" as const, title: n.title, path: n.path!, markdown: n.markdown! }))];
}
export async function documentReferences() {
  const documents = await listDocuments();
  return { documents, references: documents.flatMap(doc => parseWikiReferences(doc.markdown).map(ref => {
    // A Raw and a Knowledge page can intentionally share a title after promotion.
    // Resolve an unqualified link within the source's own layer first so a Raw
    // note keeps pointing at Raw and a Knowledge page keeps pointing at Knowledge.
    // Explicit paths (for example `raw/inbox/<id>.md`) still fall back to the
    // complete document set and remain the escape hatch for cross-layer links.
    const sameLayer = documents.filter(candidate => candidate.kind === doc.kind);
    const target = resolveReference(ref.target, sameLayer) ?? resolveReference(ref.target, documents);
    return { ...ref, sourceId: doc.id, targetId: target?.id ?? null };
  })) };
}
/** Explicit user action only. Unresolved targets create Raw, preserving the new-note boundary. */
export async function createLinkedDocument(target: string) {
  requireUserActor(getUserContext());
  const documents = await listDocuments();
  const existing = resolveReference(target, documents);
  if (existing) return existing;
  const path = safeDocumentPath(target.includes("/") ? target : `raw/${target}`);
  if (documents.some(doc => doc.path.toLocaleLowerCase() === path.toLocaleLowerCase())) throw new Error("PATH_EXISTS");
  const title = path.split("/").at(-1)!.replace(/\.md$/i, "");
  const markdown = makeMarkdown(title, "");
  const raw = await createSource(markdown, title, {markdown,path});
  return { ...raw, kind: "raw" as const };
}
