const { WebSocketServer } = require("ws");
const url = require("url");
const jwtService = require("./jwt.service");
const terminalService = require("./terminal.service");
const projectRepository = require("../repositories/project.repository");
const fsWorkspace = require("./fs-workspace.service");
const prisma = require("../database/prisma");

function attachTerminalWs(server) {
  const wss = new WebSocketServer({ server, path: "/ws/terminal" });

  wss.on("connection", async (ws, req) => {
    let sessionId = null;
    let authenticated = false;
    let userId = null;

    try {
      const { query } = url.parse(req.url, true);
      const token = query.token;
      if (!token) {
        ws.close(4001, "Unauthorized");
        return;
      }
      const decoded = jwtService.verifyAccessToken(token);
      userId = decoded.id;
      authenticated = true;

      const projectId = query.projectId;
      sessionId = query.sessionId || null;

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
          where: { id: sessionId, projectId },
        });
      }
      if (!dbSession) {
        dbSession = await prisma.terminalSession.create({
          data: {
            projectId,
            name: query.name || `Terminal ${Date.now().toString(36)}`,
            cwd: fsWorkspace.projectDir(userId, projectId),
            cols: Number(query.cols) || 80,
            rows: Number(query.rows) || 24,
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

      ws.send(
        JSON.stringify({
          type: "ready",
          sessionId,
          meta,
          buffer: terminalService.getBuffer(sessionId),
        })
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
          const msg = JSON.parse(String(raw));
          if (msg.type === "input") {
            terminalService.write(sessionId, msg.data);
          } else if (msg.type === "resize") {
            terminalService.resize(sessionId, msg.cols, msg.rows);
            await prisma.terminalSession.update({
              where: { id: sessionId },
              data: { cols: msg.cols, rows: msg.rows },
            });
          } else if (msg.type === "ping") {
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
    } catch (err) {
      console.error("WS terminal error:", err.message);
      if (ws.readyState === 1) ws.close(4000, err.message);
    }
  });

  return wss;
}

module.exports = { attachTerminalWs };
