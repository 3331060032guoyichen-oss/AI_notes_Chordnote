import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defaultSettingsPath } from "../ai/config";
import { replacePreferences } from "../agent/preferences";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const schemaPath = () => resolve(dirname(defaultSettingsPath()), "Schema.md");

export async function readAgentSchema() {
  let schema: string;
  try { schema = await readFile(schemaPath(), "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    schema = await readFile(resolve(process.cwd(), "lib/agent/Schema.md"), "utf8");
  }
  return { schema, hash: hash(schema) };
}

// Schema editing and proposal application live in separate Next route bundles.
const host = process as typeof process & { chordnoteSchemaWrites?: Promise<unknown> };
function serialize<T>(write: () => Promise<T>): Promise<T> {
  const result = (host.chordnoteSchemaWrites ?? Promise.resolve()).then(write);
  host.chordnoteSchemaWrites = result.catch(() => {});
  return result;
}
export function saveAgentSchema(schema: string, expectedHash: string) {
  return serialize(async () => {
    const current = await readAgentSchema();
    if (current.hash !== expectedHash) return null;
    const path = schemaPath();
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, schema, "utf8");
    await rename(temp, path);
    return { schema, hash: hash(schema) };
  });
}

/** Serialized with manual saves; receipt permits retry after a DB commit failure. */
export function applyPreferences(content: string, expectedHash: string, proposalId: string) {
  return serialize(async () => {
    const current = await readAgentSchema();
    if (current.schema.includes(`<!-- preference-proposal:${proposalId} -->`)) return current;
    if (current.hash !== expectedHash) return null;
    const schema = replacePreferences(current.schema, content, proposalId);
    const path = schemaPath();
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, schema, "utf8");
    await rename(temp, path);
    return { schema, hash: hash(schema) };
  });
}
