/**
 * Terminal tools — execute, stream logs, stop, restart, history.
 */

const { spawn } = require("child_process");
const { defineTool, ok, fail } = require("../sdk/define-tool");
const { resolveProjectRoot, path } = require("../engine/workspace-path");
const terminalService = require("../../services/terminal.service");

/** In-memory process registry for agent terminal jobs */
const jobs = new Map();
const history = [];

const BLOCKED = /\b(rm\s+-rf\s+\/|format\s+|mkfs|dd\s+if=|shutdown|reboot)\b/i;

function pushHistory(entry) {
  history.unshift(entry);
  if (history.length > 200) history.pop();
}

function runCommand(cwd, command, { timeoutMs = 30000, onChunk, signal } = {}) {
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
      resolve({ code: 1, stdout, stderr: stderr || "command timeout", timedOut: true });
    }, timeoutMs);

    const onAbort = () => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });

    proc.stdout.on("data", (d) => {
      const s = d.toString();
      stdout += s;
      if (stdout.length > 100_000) stdout = stdout.slice(-100_000);
      onChunk?.({ stream: "stdout", chunk: s });
    });
    proc.stderr.on("data", (d) => {
      const s = d.toString();
      stderr += s;
      if (stderr.length > 50_000) stderr = stderr.slice(-50_000);
      onChunk?.({ stream: "stderr", chunk: s });
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener?.("abort", onAbort);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

const terminalTools = [
  defineTool({
    id: "terminal.execute",
    name: "Execute Command",
    description: "Run a shell command in the project workspace (sandboxed)",
    category: "terminal",
    version: "1.0.0",
    permissions: ["terminal:execute"],
    timeout: 120000,
    retries: 0,
    dangerous: true,
    aliases: ["shell", "run_command"],
    schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
        timeoutMs: { type: "number" },
        jobId: { type: "string" },
      },
      required: ["command"],
    },
    async executor(args, ctx) {
      try {
        const root = await resolveProjectRoot(ctx);
        if (!root) return fail("No project workspace available", "NO_WORKSPACE");
        const cwd = args.cwd ? path.resolve(root, args.cwd) : root;
        if (!cwd.startsWith(path.resolve(root))) return fail("cwd escapes workspace", "PATH_ESCAPE");
        if (BLOCKED.test(args.command || "")) return fail("Command blocked by policy", "BLOCKED");

        const jobId = args.jobId || `job_${Date.now()}`;
        const logs = [];
        jobs.set(jobId, { status: "running", command: args.command, startedAt: Date.now(), logs });

        ctx.emit?.("tool_progress", {
          tool: "terminal.execute",
          jobId,
          status: "running",
          message: `Running: ${args.command}`,
        });

        const result = await runCommand(cwd, args.command, {
          timeoutMs: args.timeoutMs || 30000,
          signal: ctx.signal,
          onChunk: (c) => {
            logs.push(c);
            if (logs.length > 500) logs.shift();
            ctx.emit?.("tool_progress", {
              tool: "terminal.execute",
              jobId,
              status: "streaming",
              stream: c.stream,
              chunk: c.chunk.slice(0, 2000),
            });
          },
        });

        const entry = {
          jobId,
          command: args.command,
          exitCode: result.code,
          stdout: result.stdout.slice(0, 40_000),
          stderr: result.stderr.slice(0, 20_000),
          at: new Date().toISOString(),
        };
        pushHistory(entry);
        jobs.set(jobId, { status: result.code === 0 ? "completed" : "failed", ...entry, logs });

        return ok(entry);
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "terminal.stream_logs",
    name: "Stream Terminal Logs",
    description: "Fetch buffered logs for a terminal job",
    category: "terminal",
    version: "1.0.0",
    permissions: ["terminal:execute"],
    timeout: 5000,
    retries: 0,
    aliases: ["terminal.logs"],
    schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["jobId"],
    },
    async executor(args) {
      const job = jobs.get(args.jobId);
      if (!job) return fail("Job not found", "NOT_FOUND");
      const limit = args.limit || 100;
      return ok({
        jobId: args.jobId,
        status: job.status,
        logs: (job.logs || []).slice(-limit),
        stdout: job.stdout,
        stderr: job.stderr,
      });
    },
  }),

  defineTool({
    id: "terminal.stop",
    name: "Stop Terminal Job",
    description: "Stop a running terminal job or PTY session",
    category: "terminal",
    version: "1.0.0",
    permissions: ["terminal:control"],
    timeout: 10000,
    retries: 0,
    schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
        sessionId: { type: "string" },
      },
      required: [],
    },
    async executor(args) {
      if (args.sessionId && terminalService.sessions?.has(args.sessionId)) {
        terminalService.kill(args.sessionId);
        return ok({ sessionId: args.sessionId, stopped: true });
      }
      const job = jobs.get(args.jobId);
      if (!job) return fail("Job or session not found", "NOT_FOUND");
      job.status = "stopped";
      return ok({ jobId: args.jobId, stopped: true });
    },
  }),

  defineTool({
    id: "terminal.restart",
    name: "Restart Terminal Job",
    description: "Re-run the last command for a terminal job",
    category: "terminal",
    version: "1.0.0",
    permissions: ["terminal:execute"],
    timeout: 120000,
    retries: 0,
    schema: {
      type: "object",
      properties: {
        jobId: { type: "string" },
      },
      required: ["jobId"],
    },
    async executor(args, ctx) {
      const job = jobs.get(args.jobId);
      if (!job?.command) return fail("Job not found", "NOT_FOUND");
      return terminalTools
        .find((t) => t.id === "terminal.execute")
        .executor({ command: job.command, jobId: `${args.jobId}_retry` }, ctx);
    },
  }),

  defineTool({
    id: "terminal.history",
    name: "Terminal History",
    description: "List recent terminal command history for this process",
    category: "terminal",
    version: "1.0.0",
    permissions: ["terminal:execute"],
    timeout: 5000,
    retries: 0,
    cacheable: true,
    cacheTtlMs: 1000,
    schema: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
      required: [],
    },
    async executor(args) {
      const limit = args.limit || 20;
      return ok({ history: history.slice(0, limit) });
    },
  }),

  defineTool({
    id: "terminal",
    name: "Terminal",
    description: "Run a shell command in the project workspace (sandboxed)",
    category: "terminal",
    version: "1.0.0",
    permissions: ["terminal:execute"],
    timeout: 120000,
    retries: 0,
    dangerous: true,
    schema: {
      type: "object",
      properties: {
        command: { type: "string" },
        cwd: { type: "string" },
        timeoutMs: { type: "number" },
        action: { type: "string", enum: ["execute", "stream_logs", "stop", "restart", "history"] },
        jobId: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      const action = args.action || "execute";
      if (action === "execute" || args.command) {
        return terminalTools.find((t) => t.id === "terminal.execute").executor(args, ctx);
      }
      const id = `terminal.${action}`;
      const tool = terminalTools.find((t) => t.id === id);
      if (!tool) return fail(`Unknown terminal action: ${action}`, "BAD_ACTION");
      return tool.executor(args, ctx);
    },
  }),
];

module.exports = { terminalTools, jobs, history };
