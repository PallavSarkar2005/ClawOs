require("./config/env").getEnv();

const http = require("http");
const app = require("./app");
const { attachTerminalWs } = require("./services/terminal-ws.service");
const { startIndexingWorker, startMemoryScheduler } = require("./memory");
const { initKnowledgeEngine } = require("./knowledge");
const { initIntelligence } = require("./intelligence");
const { getEnv } = require("./config/env");
const terminalService = require("./services/terminal.service");
const { initToolPlatform } = require("./tools");
const { initWorkflowEngine } = require("./workflows");

const { PORT } = getEnv();

const server = http.createServer(app);
attachTerminalWs(server);
startIndexingWorker();
startMemoryScheduler();
initKnowledgeEngine().catch((e) => console.warn("[knowledge] init:", e.message));
initIntelligence();

initToolPlatform({ hotReload: true, loadMcp: true }).catch((e) => {
  console.warn("[tools] init warning:", e.message);
});

initWorkflowEngine().catch((e) => console.warn("[workflows] init:", e.message));

function shutdown(signal) {
  console.log(`[shutdown] ${signal} — cleaning up`);
  try {
    for (const [id] of terminalService.sessions) {
      terminalService.kill(id);
    }
  } catch {
    /* ignore */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref?.();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[FATAL] Port ${PORT} is already in use. Stop the other Node process (or change PORT in .env), then restart.`,
    );
    process.exit(1);
  }
  console.error("[FATAL] Server error:", err.message);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Terminal WS at ws://localhost:${PORT}/ws/terminal`);
});
