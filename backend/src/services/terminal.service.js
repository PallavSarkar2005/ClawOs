const { spawn } = require("child_process");
const os = require("os");
const path = require("path");
const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");
const fsWorkspace = require("./fs-workspace.service");

let pty = null;
try {
  pty = require("node-pty");
} catch {
  pty = null;
}

class TerminalManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> { pty|proc, projectId, userId, buffer, cols, rows }
  }

  getShell() {
    if (process.platform === "win32") {
      return process.env.COMSPEC || "cmd.exe";
    }
    return process.env.SHELL || "/bin/bash";
  }

  async createSession({ sessionId, userId, projectId, cwd, cols = 80, rows = 24 }) {
    const id = sessionId || uuidv4();
    const workDir =
      cwd || fsWorkspace.projectDir(userId, projectId);
    await fsWorkspace.ensureDir(workDir);

    const existing = this.sessions.get(id);
    if (existing) return { id, ...existing.meta };

    const shell = this.getShell();
    let handle;

    if (pty) {
      handle = pty.spawn(shell, [], {
        name: "xterm-color",
        cols,
        rows,
        cwd: workDir,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      });
      handle.onData((data) => {
        this.emit("data", id, data);
        const s = this.sessions.get(id);
        if (s) {
          s.buffer = (s.buffer + data).slice(-100000);
        }
      });
      handle.onExit(({ exitCode }) => {
        this.emit("exit", id, exitCode);
        this.sessions.delete(id);
      });
    } else {
      // Fallback: line-buffered shell without full PTY
      const proc = spawn(shell, process.platform === "win32" ? [] : ["-i"], {
        cwd: workDir,
        env: { ...process.env, TERM: "xterm-256color" },
        shell: false,
      });
      handle = {
        write: (data) => proc.stdin.write(data),
        resize: () => {},
        kill: () => {
          try {
            proc.kill();
          } catch {
            /* ignore */
          }
        },
        pid: proc.pid,
      };
      const banner =
        `\r\n\x1b[33m[OpenClaw]\x1b[0m Interactive shell (fallback mode — install node-pty for full PTY)\r\n` +
        `\x1b[90m${workDir}\x1b[0m\r\n`;
      setTimeout(() => this.emit("data", id, banner), 50);
      proc.stdout.on("data", (buf) => {
        const data = buf.toString();
        this.emit("data", id, data);
        const s = this.sessions.get(id);
        if (s) s.buffer = (s.buffer + data).slice(-100000);
      });
      proc.stderr.on("data", (buf) => {
        const data = buf.toString();
        this.emit("data", id, data);
        const s = this.sessions.get(id);
        if (s) s.buffer = (s.buffer + data).slice(-100000);
      });
      proc.on("exit", (code) => {
        this.emit("exit", id, code);
        this.sessions.delete(id);
      });
    }

    this.sessions.set(id, {
      handle,
      userId,
      projectId,
      cols,
      rows,
      buffer: "",
      cwd: workDir,
      meta: { cwd: workDir, cols, rows, shell, pty: Boolean(pty) },
      history: [],
    });

    return { id, cwd: workDir, cols, rows, shell, pty: Boolean(pty) };
  }

  write(sessionId, data) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    if (data && !data.startsWith("\x1b")) {
      const line = String(data).replace(/\r?\n$/, "");
      if (line.trim()) {
        s.history.push(line.trim());
        if (s.history.length > 200) s.history.shift();
      }
    }
    s.handle.write(data);
    return true;
  }

  resize(sessionId, cols, rows) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.cols = cols;
    s.rows = rows;
    try {
      s.handle.resize?.(cols, rows);
    } catch {
      /* ignore */
    }
    return true;
  }

  kill(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    try {
      s.handle.kill();
    } catch {
      /* ignore */
    }
    this.sessions.delete(sessionId);
    return true;
  }

  getBuffer(sessionId) {
    return this.sessions.get(sessionId)?.buffer || "";
  }

  getHistory(sessionId) {
    return this.sessions.get(sessionId)?.history || [];
  }

  listByProject(projectId) {
    const out = [];
    for (const [id, s] of this.sessions) {
      if (s.projectId === projectId) {
        out.push({
          id,
          cwd: s.cwd,
          cols: s.cols,
          rows: s.rows,
          active: true,
        });
      }
    }
    return out;
  }
}

module.exports = new TerminalManager();
