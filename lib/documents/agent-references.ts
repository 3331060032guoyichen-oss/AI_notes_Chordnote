import { resolveReference, type LinkCandidate } from "./markdown";

/** Resolve explicit references from replies; ambiguous names must never open another note. */
export function resolveAgentReference(value: string, candidates: readonly LinkCandidate[]) {
  let target = value.trim();
  try { target = decodeURIComponent(target); } catch { /* Keep literal malformed escapes. */ }
  target = target.replace(/\\/g, "/").split("#")[0];
  const exact = resolveReference(target, candidates);
  if (exact) return exact;

  const key = target.replace(/\.md$/i, "").normalize("NFC").toLocaleLowerCase();
  const matches = candidates.filter(candidate => {
    const basename = candidate.path?.replace(/\\/g, "/").split("/").pop()?.replace(/\.md$/i, "").normalize("NFC").toLocaleLowerCase();
    return !target.includes("/") && (basename === key || candidate.id.toLocaleLowerCase() === key);
  });
  if (matches.length === 1) return matches[0];

  // Older replies sometimes abbreviated generated ids. Only a unique, sufficiently
  // long id prefix can be recovered; titles and paths are never guessed.
  const abbreviated = /^(raw_|knowledge_)([a-f0-9-]{8,})(?:\.{3}|…)$/.exec(target);
  if (!abbreviated) return null;
  const prefix = abbreviated[1] + abbreviated[2];
  const ids = candidates.filter(candidate => candidate.id.startsWith(prefix));
  return ids.length === 1 ? ids[0] : null;
}
