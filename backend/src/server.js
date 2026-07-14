require("dotenv").config();

const http = require("http");
const app = require("./app");
const { attachTerminalWs } = require("./services/terminal-ws.service");
const { startIndexingWorker, startMemoryScheduler } = require("./memory");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
attachTerminalWs(server);
startIndexingWorker();
startMemoryScheduler();

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[FATAL] Port ${PORT} is already in use. Stop the other Node process (or change PORT in .env), then restart.`,
    );
    process.exit(1);
  }
  console.error("[FATAL] Server error:", err);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Terminal WS at ws://localhost:${PORT}/ws/terminal`);
});
