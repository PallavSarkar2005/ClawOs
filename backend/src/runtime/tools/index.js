const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const { spawn } = require("child_process");
const axios = require("axios");
const prisma = require("../../database/prisma");
const fsWorkspace = require("../../services/fs-workspace.service");
const gitService = require("../../services/git.service");
const { memoryService, retrievalEngine } = require("../../memory");
const webSearch = require("../../agents/websearch.agent");
const { getToolSchemas } = require("./schemas");

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

function ok(data) {
  return { ok: true, ...data };
}

function fail(error, code = "TOOL_ERROR") {
  return { ok: false, error: String(error?.message || error), code };
}

async function runCommand(cwd, command, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const proc = spawn(isWin ? "cmd.exe" : "bash", isWin ? ["/c", command] : ["-lc", command], {
      cwd,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
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
      resolve({ code: 1, stdout, stderr: stderr || "command timeout" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > 100_000) stdout = stdout.slice(-100_000);
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 50_000) stderr = stderr.slice(-50_000);
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

async function resolveProjectRoot(ctx) {
  if (!ctx.userId || !ctx.projectId) return null;
  const project = await prisma.project.findFirst({
    where: { id: ctx.projectId, userId: ctx.userId },
    include: { files: true },
  });
  if (!project) return null;
  return fsWorkspace.syncProjectToDisk(ctx.userId, project);
}

const handlers = {
  async filesystem(args, ctx) {
    const root = await resolveProjectRoot(ctx);
    if (!root) return fail("No project workspace available", "NO_WORKSPACE");
    const rel = String(args.path || ".").replace(/^[/\\]+/, "");
    const full = path.resolve(root, rel);
    if (!full.startsWith(path.resolve(root))) {
      return fail("Path escapes workspace", "PATH_ESCAPE");
    }
    const action = args.action;
    try {
      if (action === "list") {
        const entries = await readdir(full, { withFileTypes: true });
        return ok({
          path: rel,
          entries: entries.map((e) => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : "file",
          })),
        });
      }
      if (action === "read") {
        const content = await readFile(full, "utf8");
        return ok({ path: rel, content: content.slice(0, 80_000) });
      }
      if (action === "write") {
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, args.content ?? "", "utf8");
        if (ctx.projectId) {
          await fsWorkspace.writeFileToDisk(ctx.userId, ctx.projectId, rel, args.content ?? "");
        }
        return ok({ path: rel, written: true, bytes: String(args.content ?? "").length });
      }
      if (action === "delete") {
        await unlink(full);
        return ok({ path: rel, deleted: true });
      }
      if (action === "exists") {
        try {
          await access(full);
          return ok({ path: rel, exists: true });
        } catch {
          return ok({ path: rel, exists: false });
        }
      }
      return fail(`Unknown filesystem action: ${action}`, "BAD_ACTION");
    } catch (error) {
      return fail(error);
    }
  },

  async terminal(args, ctx) {
    const root = await resolveProjectRoot(ctx);
    if (!root) return fail("No project workspace available", "NO_WORKSPACE");
    const cwd = args.cwd ? path.resolve(root, args.cwd) : root;
    if (!cwd.startsWith(path.resolve(root))) return fail("cwd escapes workspace", "PATH_ESCAPE");
    const blocked = /\b(rm\s+-rf\s+\/|format\s+|mkfs|dd\s+if=|shutdown|reboot)\b/i;
    if (blocked.test(args.command || "")) {
      return fail("Command blocked by policy", "BLOCKED");
    }
    const result = await runCommand(cwd, args.command, args.timeoutMs || 30000);
    return ok({
      command: args.command,
      exitCode: result.code,
      stdout: result.stdout.slice(0, 40_000),
      stderr: result.stderr.slice(0, 20_000),
    });
  },

  async git(args, ctx) {
    if (!ctx.userId || !ctx.projectId) return fail("No project for git", "NO_PROJECT");
    try {
      const project = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
      });
      if (!project) return fail("Project not found", "NOT_FOUND");
      const action = args.action;
      if (action === "status") return ok(await gitService.getStatus(ctx.userId, ctx.projectId));
      if (action === "diff") return ok(await gitService.getDiff(ctx.userId, ctx.projectId));
      if (action === "log") {
        const root = await resolveProjectRoot(ctx);
        if (!root) return fail("No workspace", "NO_WORKSPACE");
        const { spawnSync } = require("child_process");
        const r = spawnSync("git", ["log", "-n", "10", "--oneline"], { cwd: root, encoding: "utf8" });
        return ok({ log: r.stdout || r.stderr || "" });
      }
      if (action === "branch") {
        const root = await resolveProjectRoot(ctx);
        if (!root) return fail("No workspace", "NO_WORKSPACE");
        const { spawnSync } = require("child_process");
        const r = spawnSync("git", ["branch", "--show-current"], { cwd: root, encoding: "utf8" });
        return ok({ branch: (r.stdout || "").trim() });
      }
      if (action === "add") {
        return ok(await gitService.stage(ctx.userId, ctx.projectId, args.paths || ["."]));
      }
      if (action === "commit") {
        return ok(
          await gitService.commit(ctx.userId, ctx.projectId, args.message || "OpenClaw commit"),
        );
      }
      return fail(`Unknown git action: ${action}`, "BAD_ACTION");
    } catch (error) {
      return fail(error);
    }
  },

  async memory(args, ctx) {
    try {
      if (args.action === "search") {
        const result = await retrievalEngine.hybridSearch(ctx.userId, args.query || "", {
          topK: 8,
          includeChunks: false,
        });
        return ok({
          results: (result.results || []).map((m) => ({
            id: m.id,
            content: m.content,
            score: m.score,
            scope: m.scope,
          })),
        });
      }
      if (args.action === "save") {
        const mem = await memoryService.create(ctx.userId, {
          content: args.content,
          scope: "AGENT",
          conversationId: ctx.conversationId || null,
          projectId: ctx.projectId || null,
          agentType: ctx.agentType || null,
          source: "agent-runtime",
          importance: args.importance ?? 0.6,
          tags: ["agent", ctx.agentType, ...(args.tags || [])].filter(Boolean),
        });
        return ok({ id: mem.id, saved: true });
      }
      return fail(`Unknown memory action: ${args.action}`, "BAD_ACTION");
    } catch (error) {
      return fail(error);
    }
  },

  async documents(args, ctx) {
    try {
      const result = await retrievalEngine.hybridSearch(ctx.userId, args.query, {
        topK: args.topK || 6,
        includeMemories: false,
        includeChunks: true,
        documentIds: args.documentId ? [args.documentId] : undefined,
      });
      return ok({
        results: (result.results || []).map((r) => ({
          id: r.id,
          content: r.content?.slice(0, 4000),
          score: r.score,
          documentId: r.documentId,
        })),
      });
    } catch (error) {
      return fail(error);
    }
  },

  async workspace(args, ctx) {
    try {
      if (!ctx.projectId) return fail("No projectId", "NO_PROJECT");
      const project = await prisma.project.findFirst({
        where: { id: ctx.projectId, userId: ctx.userId },
        include: {
          files: { orderBy: { path: "asc" } },
          diffs: { orderBy: { createdAt: "desc" }, take: 20 },
        },
      });
      if (!project) return fail("Project not found", "NOT_FOUND");
      if (args.action === "project_info") {
        return ok({
          id: project.id,
          name: project.name,
          framework: project.framework,
          status: project.status,
          fileCount: project.files.length,
        });
      }
      if (args.action === "list_files") {
        return ok({
          files: project.files.map((f) => ({
            id: f.id,
            name: f.name,
            path: f.path,
            isFolder: f.isFolder,
            size: (f.content || "").length,
          })),
        });
      }
      if (args.action === "get_file") {
        const file = project.files.find(
          (f) => f.id === args.fileId || f.path === args.path || f.name === args.path,
        );
        if (!file) return fail("File not found", "NOT_FOUND");
        return ok({
          id: file.id,
          path: file.path,
          name: file.name,
          content: (file.content || "").slice(0, 80_000),
        });
      }
      if (args.action === "list_diffs") {
        return ok({
          diffs: project.diffs.map((d) => ({
            id: d.id,
            filePath: d.filePath,
            status: d.status,
            reason: d.reason,
          })),
        });
      }
      return fail(`Unknown workspace action: ${args.action}`, "BAD_ACTION");
    } catch (error) {
      return fail(error);
    }
  },

  async search(args) {
    try {
      const text = await webSearch(args.query);
      return ok({ query: args.query, results: text });
    } catch (error) {
      return fail(error);
    }
  },

  async browser(args) {
    try {
      const url = String(args.url || "");
      if (!/^https?:\/\//i.test(url)) return fail("Only http/https URLs allowed", "BAD_URL");
      const response = await axios.get(url, {
        timeout: 15000,
        maxContentLength: 2_000_000,
        headers: { "User-Agent": "OpenClawAgent/1.0" },
        validateStatus: () => true,
      });
      const maxChars = args.maxChars || 12000;
      const raw = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
      const text = raw
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maxChars);
      return ok({ url, status: response.status, content: text });
    } catch (error) {
      return fail(error);
    }
  },

  async preview(args) {
    const html = args.html || "";
    const css = args.css || "";
    const js = args.javascript || args.js || "";
    const title = args.title || "Preview";
    const document = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>${css}</style></head><body>${html}<script>${js}</script></body></html>`;
    return ok({ title, html: document, css, javascript: js });
  },
};

async function executeTool(name, rawArgs, ctx = {}) {
  const handler = handlers[name];
  if (!handler) return fail(`Unknown tool: ${name}`, "UNKNOWN_TOOL");
  let args = rawArgs;
  if (typeof rawArgs === "string") {
    try {
      args = JSON.parse(rawArgs || "{}");
    } catch {
      return fail("Invalid tool arguments JSON", "BAD_ARGS");
    }
  }
  return handler(args || {}, ctx);
}

function listTools() {
  return getToolSchemas("all").map((t) => t.function.name);
}

module.exports = {
  executeTool,
  listTools,
  getToolSchemas,
  handlers,
};
