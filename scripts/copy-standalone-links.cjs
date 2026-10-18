/*
 * Next.js standalone output normally recreates traced pnpm package links.
 * Some Windows machines may run Node without the symbolic-link privilege.
 * In that case, copy the link target into standalone output so the runtime
 * remains self-contained. This preload is only enabled by next-build.mjs.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const nativeSymlink = fsp.symlink.bind(fsp);
const standaloneRoot = `${path.resolve(process.cwd(), ".next", "standalone")}${path.sep}`;

function isStandalonePath(destination) {
  return path.resolve(destination).startsWith(standaloneRoot);
}

fsp.symlink = async (target, destination, type) => {
  try {
    return await nativeSymlink(target, destination, type);
  } catch (error) {
    if (error?.code !== "EPERM" || !isStandalonePath(destination) || !path.isAbsolute(target)) {
      throw error;
    }

    const sourceInfo = await fsp.stat(target);
    await fsp.cp(target, destination, {
      recursive: sourceInfo.isDirectory(),
      dereference: true,
      force: false,
    });
  }
};

// Next.js imports `node:fs` and reads the promise API from this same object.
fs.promises.symlink = fsp.symlink;
