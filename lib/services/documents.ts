import { listNotes } from "./notes";
import { listSources, createSource, updateSource } from "./sources";
import { parseWikiReferences, resolveReference, safeDocumentPath, makeMarkdown } from "../documents/markdown";

/** Derived on every query from canonical Markdown, so edits, proposals and restores cannot leave stale backlinks. */
export async function listDocuments() {
  const [raws, knowledge] = await Promise.all([listSources(), listNotes()]);
  return [...raws.map(r => ({ id: r.id, kind: "raw" as const, title: r.title ?? "未命名", path: r.path!, markdown: r.markdown! })),
    ...knowledge.map(n => ({ id: n.id, kind: "knowledge" as const, title: n.title, path: n.path!, markdown: n.markdown! }))];
}
export async function documentReferences() {
  const documents = await listDocuments();
  return { documents, references: documents.flatMap(doc => parseWikiReferences(doc.markdown).map(ref => ({
    ...ref, sourceId: doc.id, targetId: resolveReference(ref.target, documents)?.id ?? null,
  }))) };
}
/** Explicit user action only. Unresolved targets create Raw, preserving the new-note boundary. */
export async function createLinkedDocument(target: string) {
  const documents = await listDocuments();
  const existing = resolveReference(target, documents);
  if (existing) return existing;
  const path = safeDocumentPath(target.includes("/") ? target : `raw/articles/${target}`);
  if (documents.some(doc => doc.path.toLocaleLowerCase() === path.toLocaleLowerCase())) throw new Error("PATH_EXISTS");
  const title = path.split("/").at(-1)!.replace(/\.md$/i, "");
  const markdown = makeMarkdown(title, "");
  const raw = await createSource(markdown, title);
  const result = await updateSource(raw.id, markdown, { markdown, path });
  if (result.status !== "ok") throw new Error("CREATE_FAILED");
  return { ...result.raw, kind: "raw" as const };
}
