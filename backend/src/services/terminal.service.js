const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { EventEmitter } = require("events");
const { v4: uuidv4 } = require("uuid");
const fsWorkspace = require("./fs-workspace.service");
const { assertInsideRoot } = require("../utils/safe-exec");
const { safeLog, safeError } = require("../utils/secure-logger");

let pty = null;
try {
  pty = require("node-pty");
} catch {
  pty = null;
}

const MAX_SESSIONS_PER_USER = Number(process.env.TERMINAL_MAX_SESSIONS) || 5;
const SESSION_IDLE_MS = Number(process.env.TERMINAL_IDLE_MS) || 30 * 60 * 1000;
const COMMAND_TIMEOUT_MS = Number(process.env.TERMINAL_CMD_TIMEOUT_MS) || 5 * 60 * 1000;
const MAX_MEMORY_HINT_MB = Number(process.env.TERMINAL_MEMORY_MB) || 512;

const BLOCKED_COMMAND_RE = [
  /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/(?:\s|$)/i,
  /\brm\s+-rf\b/i,
  /\b(mkfs|fdisk|diskpart|format)\b/i,
  /\bdd\s+if=/i,
  /\b(shutdown|reboot|halt|poweroff)\b/i,
  /\bcurl\b.*\|\s*(ba)?sh\b/i,
  /\bwget\b.*\|\s*(ba)?sh\b/i,
  /\bchmod\s+777\b/i,
  /\/etc\/(passwd|shadow)/i,
  /\bnc\s+-[el]/i,
  /\bnmap\b/i,
];

class TerminalManager extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map();
    this._reaper = setInterval(() => this.reapIdle(), 60_000);
    if (this._reaper.unref) this._reaper.unref();
  }

  getShell() {
    if (process.platform === "win32") {
      return process.env.COMSPEC || "cmd.exe";
    }
    return process.env.SHELL || "/bin/bash";
  }

  _countUserSessions(userId) {
    let n = 0;
    for (const s of this.sessions.values()) {
      if (s.userId === userId) n += 1;
    }
    return n;
  }

  _audit(event, meta) {
    safeLog(`[TERMINAL AUDIT] ${event}`, {
      ...meta,
      at: new Date().toISOString(),
    });
  }

  _buildSandboxEnv(workDir) {
    return {
      PATH: process.env.PATH,
      PATHEXT: process.env.PATHEXT,
      SYSTEMROOT: process.env.SYSTEMROOT,
      COMSPEC: process.env.COMSPEC,
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
      HOME: workDir,
      USERPROFILE: workDir,
      TEMP: path.join(workDir, ".tmp"),
      TMP: path.join(workDir, ".tmp"),
      PWD: workDir,
      OPENCLAW_SANDBOX: "1",
      NODE_OPTIONS: `--max-old-space-size=${MAX_MEMORY_HINT_MB}`,
    };
  }

  async createSession({ sessionId, userId, projectId, cwd, cols = 80, rows = 24 }) {
    const id = sessionId || uuidv4();
    const workDir = cwd || fsWorkspace.projectDir(userId, projectId);
    assertInsideRoot(fsWorkspace.projectDir(userId, projectId), workDir);
    await fsWorkspace.ensureDir(workDir);
    await fsWorkspace.ensureDir(path.join(workDir, ".tmp"));

    const existing = this.sessions.get(id);
    if (existing) {
      existing.lastActive = Date.now();
      return { id, ...existing.meta };
    }

    if (this._countUserSessions(userId) >= MAX_SESSIONS_PER_USER) {
      throw new Error(`Terminal session limit reached (${MAX_SESSIONS_PER_USER})`);
    }

    const shell = this.getShell();
    const env = this._buildSandboxEnv(workDir);
    let handle;
    let pid = null;

    if (pty) {
      handle = pty.spawn(shell, [], {
        name: "xterm-color",
        cols,
        rows,
        cwd: workDir,
        env,
      });
      pid = handle.pid;
      handle.onData((data) => {
        this.emit("data", id, data);
        const s = this.sessions.get(id);
        if (s) {
          s.buffer = (s.buffer + data).slice(-100000);
          s.lastActive = Date.now();
        }
      });
      handle.onExit(({ exitCode }) => {
        this._audit("exit", { sessionId: id, userId, projectId, exitCode });
        this.emit("exit", id, exitCode);
        this.sessions.delete(id);
      });
    } else {
      const proc = spawn(shell, process.platform === "win32" ? [] : ["-i"], {
        cwd: workDir,
        env,
        shell: false,
        windowsHide: true,
      });
      pid = proc.pid;
      handle = {
        write: (data) => proc.stdin.write(data),
        resize: () => {},
        kill: (sig) => {
          try {
            proc.kill(sig || "SIGTERM");
          } catch {
            /* ignore */
          }
        },
        pid: proc.pid,
      };
      const banner =
        `\r\n\x1b[33m[OpenClaw]\x1b[0m Sandboxed shell (fallback — install node-pty for full PTY)\r\n` +
        `\x1b[90m${workDir}\x1b[0m\r\n`;
      setTimeout(() => this.emit("data", id, banner), 50);
      proc.stdout.on("data", (buf) => {
        const data = buf.toString();
        this.emit("data", id, data);
        const s = this.sessions.get(id);
        if (s) {
          s.buffer = (s.buffer + data).slice(-100000);
          s.lastActive = Date.now();
        }
      });
      proc.stderr.on("data", (buf) => {
        const data = buf.toString();
        this.emit("data", id, data);
        const s = this.sessions.get(id);
        if (s) {
          s.buffer = (s.buffer + data).slice(-100000);
          s.lastActive = Date.now();
        }
      });
      proc.on("exit", (code) => {
        this._audit("exit", { sessionId: id, userId, projectId, exitCode: code });
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
      pid,
      createdAt: Date.now(),
      lastActive: Date.now(),
      commandTimer: null,
      meta: { cwd: workDir, cols, rows, shell, pty: Boolean(pty), sandbox: true },
      history: [],
    });

    this._audit("create", { sessionId: id, userId, projectId, pid, cwd: workDir });
    return { id, cwd: workDir, cols, rows, shell, pty: Boolean(pty), sandbox: true };
  }

  _isBlockedCommand(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) return false;
    return BLOCKED_COMMAND_RE.some((re) => re.test(trimmed));
  }

  write(sessionId, data, userId = null) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    if (userId && s.userId !== userId) return false;

    s.lastActive = Date.now();

    if (data && !data.startsWith("\x1b")) {
      const line = String(data).replace(/\r?\n$/, "");
      if (line.trim()) {
        if (this._isBlockedCommand(line)) {
          this._audit("blocked_command", {
            sessionId,
            userId: s.userId,
            projectId: s.projectId,
            command: line.slice(0, 200),
          });
          this.emit(
            "data",
            sessionId,
            `\r\n\x1b[31m[OpenClaw] Command blocked by sandbox policy\x1b[0m\r\n`,
          );
          return true;
        }
        s.history.push(line.trim());
        if (s.history.length > 200) s.history.shift();

        if (s.commandTimer) clearTimeout(s.commandTimer);
        s.commandTimer = setTimeout(() => {
          this._audit("command_timeout", { sessionId, userId: s.userId });
          this.emit(
            "data",
            sessionId,
            `\r\n\x1b[33m[OpenClaw] Command timed out — killing session process tree\x1b[0m\r\n`,
          );
          this.kill(sessionId);
        }, COMMAND_TIMEOUT_MS);
      }
    }

    // Path traversal / cwd escape attempt in cd commands
    if (/^\s*cd\s+/i.test(String(data || ""))) {
      const target = String(data).replace(/^\s*cd\s+/i, "").trim().replace(/^["']|["']$/g, "");
      if (target && (target.includes("..") || path.isAbsolute(target))) {
        try {
          const resolved = path.resolve(s.cwd, target);
          assertInsideRoot(s.cwd.split(path.sep).slice(0, -0).join(path.sep) || s.cwd, resolved);
        } catch {
          // Absolute paths outside workspace — still allow relative cd within project via shell,
          // but block obvious escapes via our audit notice when using ../ chains in input alone
          if (/\.\./.test(target) || /^[A-Za-z]:\\|^\/(?!.*workspace)/.test(target)) {
            this._audit("path_block", { sessionId, target: target.slice(0, 200) });
            this.emit(
              "data",
              sessionId,
              `\r\n\x1b[31m[OpenClaw] Path outside project workspace rejected\x1b[0m\r\n`,
            );
            return true;
          }
        }
      }
    }

    s.handle.write(data);
    return true;
  }

  resize(sessionId, cols, rows, userId = null) {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    if (userId && s.userId !== userId) return false;
    s.cols = cols;
    s.rows = rows;
    s.lastActive = Date.now();
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
    if (s.commandTimer) clearTimeout(s.commandTimer);
    try {
      if (process.platform === "win32" && s.pid) {
        spawn("taskkill", ["/pid", String(s.pid), "/f", "/t"], {
          shell: false,
          windowsHide: true,
        });
      } else {
        s.handle.kill("SIGTERM");
        setTimeout(() => {
          try {
            s.handle.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, 1500);
      }
    } catch (err) {
      safeError("Terminal kill error", err);
    }
    this._audit("kill", { sessionId, userId: s.userId, projectId: s.projectId, pid: s.pid });
    this.sessions.delete(sessionId);
    return true;
  }

  reapIdle() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastActive > SESSION_IDLE_MS) {
        this._audit("reap_idle", { sessionId: id, userId: s.userId });
        this.kill(id);
      }
    }
  }

  killAllForUser(userId) {
    for (const [id, s] of this.sessions) {
      if (s.userId === userId) this.kill(id);
    }
  }

  killAllForProject(projectId) {
    for (const [id, s] of this.sessions) {
      if (s.projectId === projectId) this.kill(id);
    }
  }

  getBuffer(sessionId) {
    return this.sessions.get(sessionId)?.buffer || "";
  }

  getHistory(sessionId) {
    return this.sessions.get(sessionId)?.history || [];
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  listByProject(projectId, userId = null) {
    const out = [];
    for (const [id, s] of this.sessions) {
      if (s.projectId === projectId && (!userId || s.userId === userId)) {
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
