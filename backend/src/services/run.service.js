const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const prisma = require("../database/prisma");
const fsWorkspace = require("./fs-workspace.service");
const projectRepository = require("../repositories/project.repository");

class RunService extends EventEmitter {
  constructor() {
    super();
    this.runs = new Map(); // runId -> { proc, projectId }
  }

  async start({ userId, projectId, command: overrideCmd }) {
    const project = await projectRepository.findById(projectId, userId);
    if (!project) throw new Error("Project not found");

    // Stop any existing run for this project
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

    const run = await prisma.codeRun.create({
      data: {
        projectId,
        command,
        status: "running",
        projectType: detected.type,
        output: "",
      },
    });

    await projectRepository.update(projectId, userId, { status: "running" });
    await projectRepository.createLog(projectId, {
      level: "info",
      source: "run",
      message: `Run started: ${command}`,
    });

    const isWin = process.platform === "win32";
    const proc = spawn(command, {
      cwd: root,
      env: { ...process.env, FORCE_COLOR: "1" },
      shell: true,
    });

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

    proc.stdout.on("data", (d) => append(d, "stdout"));
    proc.stderr.on("data", (d) => append(d, "stderr"));

    proc.on("exit", async (code, signal) => {
      const durationMs = Date.now() - started;
      const status = signal === "SIGTERM" || signal === "SIGKILL" ? "stopped" : code === 0 ? "completed" : "failed";
      this.runs.delete(run.id);
      try {
        await prisma.codeRun.update({
          where: { id: run.id },
          data: {
            status,
            exitCode: code,
            finishedAt: new Date(),
            durationMs,
            output,
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

    this.runs.set(run.id, { proc, projectId, userId });
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
        spawn("taskkill", ["/pid", String(r.proc.pid), "/f", "/t"]);
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
