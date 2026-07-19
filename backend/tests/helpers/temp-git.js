/**
 * Temporary git repository helpers.
 */
"use strict";

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const { createTempDir, writeTree } = require("./temp-fs");

function git(cwd, args) {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "OpenClaw Test",
      GIT_AUTHOR_EMAIL: "test@openclaw.local",
      GIT_COMMITTER_NAME: "OpenClaw Test",
      GIT_COMMITTER_EMAIL: "test@openclaw.local",
    },
  }).trim();
}

function createTempGitRepo(files = {}) {
  const root = createTempDir("clawos-git-");
  writeTree(root, {
    "README.md": "# Temp Repo\n",
    ...files,
  });
  git(root, "init -b main");
  git(root, "config user.email test@openclaw.local");
  git(root, "config user.name \"OpenClaw Test\"");
  git(root, "add -A");
  git(root, 'commit -m "initial commit"');
  return root;
}

function commitAll(cwd, message = "update") {
  git(cwd, "add -A");
  try {
    git(cwd, `commit -m "${message.replace(/"/g, '\\"')}"`);
  } catch (err) {
    if (!String(err.stderr || err.message).includes("nothing to commit")) throw err;
  }
  return git(cwd, "rev-parse HEAD");
}

function getStatus(cwd) {
  return git(cwd, "status --porcelain");
}

function getLog(cwd, n = 5) {
  return git(cwd, `log -n ${n} --oneline`);
}

function ensureGitAvailable() {
  try {
    execSync("git --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  createTempGitRepo,
  commitAll,
  getStatus,
  getLog,
  git,
  ensureGitAvailable,
};
