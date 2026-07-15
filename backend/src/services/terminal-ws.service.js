const { WebSocketServer } = require("ws");
const url = require("url");
const jwtService = require("./jwt.service");
const terminalService = require("./terminal.service");
const projectRepository = require("../repositories/project.repository");
const fsWorkspace = require("./fs-workspace.service");
const prisma = require("../database/prisma");
const { ACCESS_COOKIE } = require("../utils/cookies");
const { safeError } = require("../utils/secure-logger");

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

function extractToken(req) {
  // Prefer cookie — never require token in query string
  const parsed = parseCookies(req.headers.cookie || "");
  if (parsed[ACCESS_COOKIE]) return parsed[ACCESS_COOKIE];

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);

  const proto = req.headers["sec-websocket-protocol"];
  if (proto) {
    const parts = String(proto).split(",").map((p) => p.trim());
    for (const p of parts) {
      if (p.startsWith("access_token.")) return p.slice("access_token.".length);
    }
  }

  return null;
}

function attachTerminalWs(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws/terminal",
    verifyClient: (info, done) => {
      try {
        const token = extractToken(info.req);
        if (!token) {
          done(false, 401, "Unauthorized");
          return;
        }
        const decoded = jwtService.verifyAccessToken(token);
        info.req._wsUser = decoded;
        done(true);
      } catch {
        done(false, 401, "Unauthorized");
      }
    },
  });

  wss.on("connection", async (ws, req) => {
    let sessionId = null;
    let userId = null;
    let projectId = null;
    let ready = false;
    let challengePending = true;

    // Handshake window: client must send { type: "auth", projectId, sessionId? } within 10s
    // Cookie already verified in verifyClient; this message binds the project without tokens in URL.
    const handshakeTimer = setTimeout(() => {
      if (!ready) {
        try {
          ws.close(4001, "Auth handshake timeout");
        } catch {
          /* ignore */
        }
      }
    }, 10_000);

    try {
      userId = req._wsUser?.id;
      if (!userId) {
        ws.close(4001, "Unauthorized");
        return;
      }

      // Support optional projectId query (no token) for convenience after cookie auth
      const { query } = url.parse(req.url, true);

      const finishSetup = async (msg) => {
        projectId = msg.projectId || query.projectId;
        sessionId = msg.sessionId || query.sessionId || null;

        if (!projectId) {
          ws.close(4002, "projectId required");
          return;
        }

        const project = await projectRepository.findById(projectId, userId);
        if (!project) {
          ws.close(4003, "Project not found");
          return;
        }

        await fsWorkspace.syncProjectToDisk(userId, project);

        let dbSession = null;
        if (sessionId) {
          dbSession = await prisma.terminalSession.findFirst({
            where: { id: sessionId, projectId, project: { userId } },
          });
        }
        if (!dbSession) {
          dbSession = await prisma.terminalSession.create({
            data: {
              projectId,
              name: msg.name || query.name || `Terminal ${Date.now().toString(36)}`,
              cwd: fsWorkspace.projectDir(userId, projectId),
              cols: Number(msg.cols || query.cols) || 80,
              rows: Number(msg.rows || query.rows) || 24,
              history: [],
              active: true,
            },
          });
        }

        sessionId = dbSession.id;
        const meta = await terminalService.createSession({
          sessionId,
          userId,
          projectId,
          cols: dbSession.cols,
          rows: dbSession.rows,
        });

        ready = true;
        challengePending = false;
        clearTimeout(handshakeTimer);

        ws.send(
          JSON.stringify({
            type: "ready",
            sessionId,
            meta,
            buffer: terminalService.getBuffer(sessionId),
          }),
        );

        const onData = (id, data) => {
          if (id === sessionId && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "data", data }));
          }
        };
        const onExit = (id, code) => {
          if (id === sessionId && ws.readyState === 1) {
            ws.send(JSON.stringify({ type: "exit", code }));
            prisma.terminalSession
              .update({ where: { id: sessionId }, data: { active: false } })
              .catch(() => {});
          }
        };

        terminalService.on("data", onData);
        terminalService.on("exit", onExit);

        ws.on("message", async (raw) => {
          try {
            const m = JSON.parse(String(raw));
            if (m.type === "input") {
              terminalService.write(sessionId, m.data, userId);
            } else if (m.type === "resize") {
              terminalService.resize(sessionId, m.cols, m.rows, userId);
              await prisma.terminalSession.update({
                where: { id: sessionId },
                data: { cols: m.cols, rows: m.rows },
              });
            } else if (m.type === "ping") {
              ws.send(JSON.stringify({ type: "pong" }));
            }
          } catch {
            /* ignore bad messages */
          }
        });

        ws.on("close", async () => {
          terminalService.off("data", onData);
          terminalService.off("exit", onExit);
          try {
            const hist = terminalService.getHistory(sessionId);
            await prisma.terminalSession.update({
              where: { id: sessionId },
              data: { history: hist, active: false },
            });
          } catch {
            /* ignore */
          }
        });
      };

      // If projectId already in query (no token), allow immediate setup after cookie verify
      if (query.projectId) {
        await finishSetup({ projectId: query.projectId, sessionId: query.sessionId });
        return;
      }

      ws.send(JSON.stringify({ type: "auth_required" }));

      ws.once("message", async (raw) => {
        if (!challengePending) return;
        try {
          const msg = JSON.parse(String(raw));
          if (msg.type !== "auth" && msg.type !== "init") {
            ws.close(4001, "Expected auth handshake");
            return;
          }
          await finishSetup(msg);
        } catch (err) {
          safeError("WS terminal handshake error", err);
          ws.close(4000, "Handshake failed");
        }
      });
    } catch (err) {
      clearTimeout(handshakeTimer);
      safeError("WS terminal error", err);
      if (ws.readyState === 1) ws.close(4000, "Connection error");
    }
  });

  return wss;
}

module.exports = { attachTerminalWs };
