/**
 * Run the normal Next.js production build. On Windows hosts where the current
 * process cannot create symbolic links, preload the standalone-copy fallback.
 */
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nextCli = join(root, "node_modules", "next", "dist", "bin", "next");
const fallback = join(root, "scripts", "copy-standalone-links.cjs");

async function canCreateSymbolicLink() {
  const probeDir = await mkdtemp(join(tmpdir(), "chordnote-symlink-"));
  const source = join(probeDir, "source.txt");
  const link = join(probeDir, "link.txt");

  try {
    await writeFile(source, "probe\n", "utf8");
    await symlink(source, link, "file");
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return false;
    throw error;
  } finally {
    await rm(probeDir, { recursive: true, force: true });
  }
}

const args = (await canCreateSymbolicLink())
  ? [nextCli, "build"]
  : ["--require", fallback, nextCli, "build"];
const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit", windowsHide: true });

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  if (signal) {
    console.error(`Next.js build was terminated by ${signal}.`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
