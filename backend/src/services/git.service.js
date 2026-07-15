const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const fsWorkspace = require("./fs-workspace.service");
const projectRepository = require("../repositories/project.repository");

function runGit(cwd, args, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        GIT_TERMINAL_PROMPT: "0",
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
      },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve({ code: 1, stdout, stderr: stderr || "git timeout" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

async function ensureRepo(userId, project) {
  const root = await fsWorkspace.syncProjectToDisk(userId, project);
  const gitDir = path.join(root, ".git");
  if (!fs.existsSync(gitDir)) {
    await runGit(root, ["init"]);
    await runGit(root, ["config", "user.email", "clawos@local"]);
    await runGit(root, ["config", "user.name", "OpenClaw"]);
    const ignore = path.join(root, ".gitignore");
    if (!fs.existsSync(ignore)) {
      fs.writeFileSync(
        ignore,
        "node_modules/\n.dist/\ndist/\nbuild/\n.env\n*.log\n",
        "utf8"
      );
    }
  }
  return root;
}

async function getStatus(userId, projectId) {
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);

  const [status, branch, log] = await Promise.all([
    runGit(root, ["status", "--porcelain", "-b"]),
    runGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
    runGit(root, ["log", "-n", "10", "--pretty=format:%h|%s|%an|%ar"]),
  ]);

  const lines = status.stdout.split("\n").filter(Boolean);
  let branchName = branch.stdout.trim() || "main";
  let tracking = null;
  const branchLine = lines.find((l) => l.startsWith("## "));
  if (branchLine) {
    const m = branchLine.replace("## ", "").split("...");
    branchName = m[0] || branchName;
    tracking = m[1] || null;
  }

  const files = lines
    .filter((l) => !l.startsWith("## "))
    .map((l) => {
      const xy = l.slice(0, 2);
      const file = l.slice(3).trim();
      let statusCode = "modified";
      if (xy.includes("?")) statusCode = "untracked";
      else if (xy.includes("A")) statusCode = "added";
      else if (xy.includes("D")) statusCode = "deleted";
      else if (xy.includes("R")) statusCode = "renamed";
      return { path: file, status: statusCode, code: xy };
    });

  const commits = log.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, author, when] = line.split("|");
      return { hash, subject, author, when };
    });

  const branches = await runGit(root, ["branch", "--list"]);
  const branchList = branches.stdout
    .split("\n")
    .filter(Boolean)
    .map((b) => ({
      name: b.replace(/^\*?\s+/, "").trim(),
      current: b.startsWith("*"),
    }));

  return {
    branch: branchName,
    tracking,
    files,
    commits,
    branches: branchList,
    clean: files.length === 0,
  };
}

async function getDiff(userId, projectId, filePath) {
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);
  const args = filePath
    ? ["diff", "--", filePath]
    : ["diff", "HEAD"];
  const staged = await runGit(root, ["diff", "--cached", ...(filePath ? ["--", filePath] : [])]);
  const unstaged = await runGit(root, args);
  return {
    staged: staged.stdout,
    unstaged: unstaged.stdout,
  };
}

async function stage(userId, projectId, paths = []) {
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);
  if (!paths.length) {
    await runGit(root, ["add", "-A"]);
  } else {
    await runGit(root, ["add", "--", ...paths]);
  }
  return getStatus(userId, projectId);
}

async function commit(userId, projectId, message) {
  if (!message?.trim()) throw new Error("Commit message required");
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);
  await runGit(root, ["add", "-A"]);
  const result = await runGit(root, ["commit", "-m", message.trim()]);
  if (result.code !== 0 && !/nothing to commit/i.test(result.stdout + result.stderr)) {
    throw new Error(result.stderr || result.stdout || "Commit failed");
  }
  await projectRepository.createLog(projectId, {
    level: "info",
    source: "git",
    message: `Commit: ${message.trim()}`,
  });
  return getStatus(userId, projectId);
}

async function checkout(userId, projectId, branch, create = false) {
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);
  const args = create ? ["checkout", "-b", branch] : ["checkout", branch];
  const result = await runGit(root, args);
  if (result.code !== 0) throw new Error(result.stderr || "Checkout failed");
  return getStatus(userId, projectId);
}

async function push(userId, projectId, remote = "origin", branch) {
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);
  const status = await getStatus(userId, projectId);
  const b = branch || status.branch;
  const result = await runGit(root, ["push", "-u", remote, b], 60000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Push failed");
  await projectRepository.createLog(projectId, {
    level: "info",
    source: "git",
    message: `Pushed ${b} → ${remote}`,
  });
  return { ok: true, output: result.stdout || result.stderr };
}

async function pull(userId, projectId, remote = "origin", branch) {
  const project = await projectRepository.findById(projectId, userId);
  if (!project) throw new Error("Project not found");
  const root = await ensureRepo(userId, project);
  const status = await getStatus(userId, projectId);
  const b = branch || status.branch;
  const result = await runGit(root, ["pull", remote, b], 60000);
  if (result.code !== 0) throw new Error(result.stderr || result.stdout || "Pull failed");
  await projectRepository.createLog(projectId, {
    level: "info",
    source: "git",
    message: `Pulled ${remote}/${b}`,
  });
  return { ok: true, output: result.stdout || result.stderr, status: await getStatus(userId, projectId) };
}

module.exports = {
  getStatus,
  getDiff,
  stage,
  commit,
  checkout,
  push,
  pull,
  ensureRepo,
};
