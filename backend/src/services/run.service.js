const { EventEmitter } = require("events");
const { spawn } = require("child_process");
const prisma = require("../database/prisma");
const fsWorkspace = require("./fs-workspace.service");
const projectRepository = require("../repositories/project.repository");
const { parseSafeCommand, spawnSafe } = require("../utils/safe-exec");
const { safeError } = require("../utils/secure-logger");

const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS) || 10 * 60 * 1000;

class RunService extends EventEmitter {
  constructor() {
    super();
    this.runs = new Map();
  }

  async start({ userId, projectId, command: overrideCmd }) {
    const project = await projectRepository.findById(projectId, userId);
    if (!project) throw new Error("Project not found");

    for (const [id, r] of this.runs) {
      if (r.projectId === projectId) {
        await this.stop(id);
      }
    }

    const root = await fsWorkspace.syncProjectToDisk(userId, project);
    const detected = fsWorkspace.detectProjectType(project.files, root);
    const command = overrideCmd || detected.command;

    if (!command) {
      if (detected.type === "static") {
        const run = await prisma.codeRun.create({
          data: {
            projectId,
            command: "preview:static",
            status: "completed",
            exitCode: 0,
            finishedAt: new Date(),
            durationMs: 0,
            output: "Static project — use Live Preview",
            projectType: detected.type,
          },
        });
        await projectRepository.update(projectId, userId, { status: "idle" });
        return run;
      }
      throw new Error("Could not detect runnable project type");
    }

    let parsed;
    try {
      parsed = parseSafeCommand(command);
    } catch (err) {
      throw new Error(`Rejected run command: ${err.message}`);
    }

    const run = await prisma.codeRun.create({
      data: {
        projectId,
        command: parsed.display,
        status: "running",
        projectType: detected.type,
        output: "",
      },
    });

    await projectRepository.update(projectId, userId, { status: "running" });
    await projectRepository.createLog(projectId, {
      level: "info",
      source: "run",
      message: `Run started: ${parsed.display}`,
    });

    const spawned = spawnSafe(parsed.file, parsed.args, {
      cwd: root,
      timeoutMs: RUN_TIMEOUT_MS,
    });
    const processHandle = spawned.proc;

    const started = Date.now();
    let output = "";

    const append = async (chunk, stream) => {
      const text = chunk.toString();
      output = (output + text).slice(-200000);
      this.emit("output", run.id, { stream, text });
      try {
        await prisma.codeRun.update({
          where: { id: run.id },
          data: { output },
        });
        await projectRepository.createLog(projectId, {
          level: stream === "stderr" ? "warning" : "info",
          source: "run",
          message: text.trim().slice(0, 500) || `(${stream})`,
        });
      } catch {
        /* ignore */
      }
    };

    processHandle.stdout.on("data", (d) => append(d, "stdout"));
    processHandle.stderr.on("data", (d) => append(d, "stderr"));

    processHandle.on("exit", async (code, signal) => {
      const durationMs = Date.now() - started;
      const status =
        spawned.timedOut || signal === "SIGTERM" || signal === "SIGKILL"
          ? "stopped"
          : code === 0
            ? "completed"
            : "failed";
      this.runs.delete(run.id);
      try {
        await prisma.codeRun.update({
          where: { id: run.id },
          data: {
            status,
            exitCode: code,
            finishedAt: new Date(),
            durationMs,
            output: spawned.timedOut ? `${output}\n[timed out]` : output,
          },
        });
        await projectRepository.update(projectId, userId, {
          status: status === "completed" ? "idle" : status === "failed" ? "error" : "idle",
        });
        await projectRepository.createLog(projectId, {
          level: status === "failed" ? "error" : "info",
          source: "run",
          message: `Run ${status} · exit ${code} · ${durationMs}ms`,
        });
        this.emit("exit", run.id, { code, status, durationMs });
      } catch {
        /* ignore */
      }
    });

    processHandle.on("error", (err) => {
      safeError("Run process error", err);
    });

    this.runs.set(run.id, { proc: processHandle, projectId, userId });
    return prisma.codeRun.findUnique({ where: { id: run.id } });
  }

  async stop(runId) {
    const r = this.runs.get(runId);
    if (!r) {
      const existing = await prisma.codeRun.findUnique({ where: { id: runId } });
      if (existing && existing.status === "running") {
        await prisma.codeRun.update({
          where: { id: runId },
          data: {
            status: "stopped",
            finishedAt: new Date(),
            exitCode: null,
          },
        });
      }
      return existing;
    }
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(r.proc.pid), "/f", "/t"], {
          shell: false,
          windowsHide: true,
        });
      } else {
        r.proc.kill("SIGTERM");
        setTimeout(() => {
          try {
            r.proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, 2000);
      }
    } catch {
      /* ignore */
    }
    this.runs.delete(runId);
    return prisma.codeRun.findUnique({ where: { id: runId } });
  }

  async stopProject(projectId) {
    const ids = [];
    for (const [id, r] of this.runs) {
      if (r.projectId === projectId) ids.push(id);
    }
    for (const id of ids) await this.stop(id);
  }

  getActive(projectId) {
    for (const [id, r] of this.runs) {
      if (r.projectId === projectId) return id;
    }
    return null;
  }
}

module.exports = new RunService();
