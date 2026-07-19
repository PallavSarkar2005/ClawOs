/**
 * Workspace helpers — create projects via API and bind temp directories.
 */
"use strict";

const path = require("path");
const fs = require("fs");
const { createSampleProject, createTempDir } = require("./temp-fs");
const { createTempGitRepo } = require("./temp-git");

async function createWorkspaceViaApi(api, jar, overrides = {}) {
  const name = overrides.name || `ws-${Date.now()}`;
  const res = await api.post(
    "/api/projects",
    {
      name,
      description: overrides.description || "Integration workspace",
      framework: overrides.framework || "javascript",
      generate: false,
    },
    { jar },
  );
  return { res, project: res.body?.project || res.body, name };
}

function bindLocalRepo(userId, projectId, sourceDir) {
  const fsWorkspace = require("../../src/services/fs-workspace.service");
  const dest = fsWorkspace.projectDir(userId, projectId);
  fs.mkdirSync(dest, { recursive: true });
  copyRecursive(sourceDir, dest);
  return dest;
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyRecursive(from, to);
    else fs.copyFileSync(from, to);
  }
}

async function createIndexedWorkspace(api, jar, userId) {
  const sample = createSampleProject();
  const { res, project } = await createWorkspaceViaApi(api, jar);
  if (res.status >= 400) {
    throw new Error(`project create failed: ${res.status} ${res.text}`);
  }
  const projectId = project.id || project?.project?.id;
  const dest = bindLocalRepo(userId, projectId, sample);
  return { project, projectId, localPath: dest, sample };
}

async function createGitWorkspace() {
  const repo = createTempGitRepo({
    "src/app.js": "module.exports = { ok: true };\n",
    "package.json": JSON.stringify({ name: "git-ws", version: "0.0.1" }),
  });
  return { repo };
}

module.exports = {
  createWorkspaceViaApi,
  bindLocalRepo,
  createIndexedWorkspace,
  createGitWorkspace,
  createTempDir,
};
