/**
 * Git tools — status, diff, branch, commit, checkout, merge, push, pull, clone.
 */

const { spawn } = require("child_process");
const { defineTool, ok, fail } = require("../sdk/define-tool");
const gitService = require("../../services/git.service");
const { resolveProjectRoot, path, fs } = require("../engine/workspace-path");
const prisma = require("../../database/prisma");

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

async function requireProject(ctx) {
  if (!ctx.userId || !ctx.projectId) {
    const err = new Error("No project for git");
    err.code = "NO_PROJECT";
    throw err;
  }
  const project = await prisma.project.findFirst({
    where: { id: ctx.projectId, userId: ctx.userId },
  });
  if (!project) {
    const err = new Error("Project not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  return project;
}

const gitTools = [
  defineTool({
    id: "git.status",
    name: "Git Status",
    description: "Get git status, branch, and changed files",
    category: "git",
    version: "1.0.0",
    permissions: ["git:read"],
    timeout: 20000,
    retries: 1,
    cacheable: true,
    cacheTtlMs: 2000,
    schema: { type: "object", properties: {}, required: [] },
    async executor(_args, ctx) {
      try {
        await requireProject(ctx);
        return ok(await gitService.getStatus(ctx.userId, ctx.projectId));
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.diff",
    name: "Git Diff",
    description: "Show staged and unstaged diffs",
    category: "git",
    version: "1.0.0",
    permissions: ["git:read"],
    timeout: 30000,
    retries: 1,
    schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: [],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        return ok(await gitService.getDiff(ctx.userId, ctx.projectId, args.path));
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.branch",
    name: "Git Branch",
    description: "List branches or show current branch; optionally create",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        create: { type: "boolean" },
        list: { type: "boolean" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        if (args.create && args.name) {
          return ok(await gitService.checkout(ctx.userId, ctx.projectId, args.name, true));
        }
        const status = await gitService.getStatus(ctx.userId, ctx.projectId);
        return ok({ branch: status.branch, branches: status.branches });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.commit",
    name: "Git Commit",
    description: "Stage all changes and create a commit",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 30000,
    retries: 0,
    dangerous: true,
    schema: {
      type: "object",
      properties: {
        message: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
      },
      required: ["message"],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        if (args.paths?.length) {
          await gitService.stage(ctx.userId, ctx.projectId, args.paths);
        }
        return ok(await gitService.commit(ctx.userId, ctx.projectId, args.message));
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.checkout",
    name: "Git Checkout",
    description: "Checkout a branch",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 20000,
    retries: 0,
    schema: {
      type: "object",
      properties: {
        branch: { type: "string" },
        create: { type: "boolean" },
      },
      required: ["branch"],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        return ok(await gitService.checkout(ctx.userId, ctx.projectId, args.branch, Boolean(args.create)));
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.merge",
    name: "Git Merge",
    description: "Merge a branch into the current branch",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 60000,
    retries: 0,
    dangerous: true,
    schema: {
      type: "object",
      properties: { branch: { type: "string" } },
      required: ["branch"],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        const root = await resolveProjectRoot(ctx);
        const r = await runGit(root, ["merge", args.branch], 60000);
        if (r.code !== 0) return fail(r.stderr || r.stdout || "Merge failed", "GIT_ERROR");
        return ok({ merged: args.branch, output: r.stdout });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.push",
    name: "Git Push",
    description: "Push current branch to remote",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 90000,
    retries: 1,
    dangerous: true,
    schema: {
      type: "object",
      properties: {
        remote: { type: "string" },
        branch: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        return ok(await gitService.push(ctx.userId, ctx.projectId, args.remote || "origin", args.branch));
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.pull",
    name: "Git Pull",
    description: "Pull from remote",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 90000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        remote: { type: "string" },
        branch: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        await requireProject(ctx);
        return ok(await gitService.pull(ctx.userId, ctx.projectId, args.remote || "origin", args.branch));
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git.clone",
    name: "Git Clone",
    description: "Clone a repository into the project workspace subdirectory",
    category: "git",
    version: "1.0.0",
    permissions: ["git:write"],
    timeout: 120000,
    retries: 0,
    dangerous: true,
    schema: {
      type: "object",
      properties: {
        url: { type: "string" },
        directory: { type: "string" },
      },
      required: ["url"],
    },
    async executor(args, ctx) {
      try {
        if (!/^https?:\/\//i.test(args.url) && !/^git@/i.test(args.url)) {
          return fail("Only http(s) or git@ URLs allowed", "BAD_URL");
        }
        const root = await resolveProjectRoot(ctx);
        if (!root) return fail("No workspace", "NO_WORKSPACE");
        const dir = args.directory || "repo";
        const target = path.resolve(root, dir);
        if (!target.startsWith(path.resolve(root))) return fail("Path escapes workspace", "PATH_ESCAPE");
        if (fs.existsSync(target)) return fail("Target directory already exists", "EXISTS");
        const r = await runGit(root, ["clone", args.url, dir], 120000);
        if (r.code !== 0) return fail(r.stderr || r.stdout || "Clone failed", "GIT_ERROR");
        return ok({ cloned: true, directory: dir, output: r.stdout });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "git",
    name: "Git",
    description: "Run git operations: status, diff, log, commit, branch, checkout, merge, push, pull, clone",
    category: "git",
    version: "1.0.0",
    permissions: ["git:execute"],
    timeout: 90000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["status", "diff", "log", "commit", "branch", "add", "checkout", "merge", "push", "pull", "clone"],
        },
        message: { type: "string" },
        paths: { type: "array", items: { type: "string" } },
        branch: { type: "string" },
        create: { type: "boolean" },
        remote: { type: "string" },
        url: { type: "string" },
        directory: { type: "string" },
        path: { type: "string" },
        name: { type: "string" },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      const map = {
        status: "git.status",
        diff: "git.diff",
        branch: "git.branch",
        commit: "git.commit",
        checkout: "git.checkout",
        merge: "git.merge",
        push: "git.push",
        pull: "git.pull",
        clone: "git.clone",
      };
      if (args.action === "add") {
        try {
          await requireProject(ctx);
          return ok(await gitService.stage(ctx.userId, ctx.projectId, args.paths || ["."]));
        } catch (e) {
          return fail(e, e.code || "TOOL_ERROR");
        }
      }
      if (args.action === "log") {
        try {
          const root = await resolveProjectRoot(ctx);
          if (!root) return fail("No workspace", "NO_WORKSPACE");
          const r = await runGit(root, ["log", "-n", "10", "--oneline"]);
          return ok({ log: r.stdout || r.stderr || "" });
        } catch (e) {
          return fail(e, e.code || "TOOL_ERROR");
        }
      }
      const id = map[args.action];
      if (!id) return fail(`Unknown git action: ${args.action}`, "BAD_ACTION");
      const tool = gitTools.find((t) => t.id === id);
      const mapped = { ...args };
      if (args.action === "branch" && args.name) mapped.name = args.name;
      if (args.action === "checkout") mapped.branch = args.branch || args.name;
      return tool.executor(mapped, ctx);
    },
  }),
];

module.exports = { gitTools };
