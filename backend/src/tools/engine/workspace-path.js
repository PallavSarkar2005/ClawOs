/**
 * Shared workspace path helpers for sandboxed filesystem tools.
 */

const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const prisma = require("../../database/prisma");
const fsWorkspace = require("../../services/fs-workspace.service");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const rename = promisify(fs.rename);
const access = promisify(fs.access);
const stat = promisify(fs.stat);

async function resolveProjectRoot(ctx) {
  if (!ctx.userId || !ctx.projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: ctx.projectId, userId: ctx.userId },
    include: { files: true },
  });
  if (!project) return null;
  return fsWorkspace.syncProjectToDisk(ctx.userId, project);
}

function resolveSafePath(root, relPath) {
  const rel = String(relPath || ".").replace(/^[/\\]+/, "");
  const full = path.resolve(root, rel);
  const rootResolved = path.resolve(root);
  if (!full.startsWith(rootResolved)) {
    const err = new Error("Path escapes workspace");
    err.code = "PATH_ESCAPE";
    throw err;
  }
  return { rel: rel.replace(/\\/g, "/"), full };
}

async function walkTree(dir, base, maxDepth = 6, depth = 0, out = []) {
  if (depth > maxDepth) return out;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
    const rel = path.join(base, e.name).replace(/\\/g, "/");
    out.push({ path: rel, type: e.isDirectory() ? "dir" : "file" });
    if (e.isDirectory()) {
      await walkTree(path.join(dir, e.name), rel, maxDepth, depth + 1, out);
    }
  }
  return out;
}

module.exports = {
  fs,
  path,
  readFile,
  writeFile,
  readdir,
  unlink,
  rename,
  access,
  stat,
  resolveProjectRoot,
  resolveSafePath,
  walkTree,
  fsWorkspace,
  prisma,
};
