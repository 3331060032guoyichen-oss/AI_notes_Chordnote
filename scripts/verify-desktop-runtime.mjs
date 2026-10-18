/**
 * Smoke-test the bundled standalone server without using user data. This is a
 * local acceptance check: a temporary PGlite directory is created, health is
 * polled, then the desktop-only shutdown endpoint must stop the child cleanly.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const runtime = join(root, ".desktop", "runtime");
const node = join(runtime, process.platform === "win32" ? "node.exe" : "node");
const testRoot = await mkdtemp(join(tmpdir(), "chordnote-desktop-runtime-"));
const token = "desktop-runtime-verification-token";
const baseUrl = "http://127.0.0.1:3210";

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForHealth(child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Standalone server exited early (${child.exitCode}).`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok" && body.database === "ok") return;
      }
    } catch {
      // The service has not started listening yet.
    }
    await delay(250);
  }
  throw new Error("Standalone server did not pass /api/health within 30 seconds.");
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Standalone server did not exit within 10 seconds.")), 10_000);
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0 && !signal) resolve();
      else reject(new Error(`Standalone server exited unexpectedly (code=${code}, signal=${signal}).`));
    });
  });
}

let child;
try {
  child = spawn(node, ["server.js"], {
    cwd: runtime,
    env: {
      ...process.env,
      HOSTNAME: "127.0.0.1",
      PORT: "3210",
      CHORDNOTE_DESKTOP: "1",
      PGLITE_DATA_DIR: join(testRoot, "db"),
      CHORDNOTE_SETTINGS_FILE: join(testRoot, "settings.json"),
      CHORDNOTE_MIGRATIONS_DIR: join(runtime, "drizzle"),
      CHORDNOTE_LOG_DIR: join(testRoot, "logs"),
      CHORDNOTE_SHUTDOWN_TOKEN: token,
    },
    stdio: "ignore",
    windowsHide: true,
  });

  await waitForHealth(child);
  const shutdown = await fetch(`${baseUrl}/api/desktop/shutdown`, {
    method: "POST",
    headers: { "x-chordnote-shutdown-token": token },
  });
  if (!shutdown.ok) throw new Error(`Desktop shutdown endpoint returned ${shutdown.status}.`);
  await waitForExit(child);
  console.log("Desktop standalone runtime verification passed.");
} finally {
  if (child && child.exitCode === null) child.kill();
  await rm(testRoot, { recursive: true, force: true });
}
