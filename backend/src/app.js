const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const chatRoutes = require("./routes/chat.routes");
const aiRoutes = require("./routes/ai.routes");
const skillRoutes = require("./routes/skill.routes");
const memoryRoutes = require("./routes/memory.routes");
const workflowRoutes = require("./routes/workflow.routes");
const documentRoutes = require("./routes/document.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const projectRoutes = require("./routes/project.routes");
const settingsRoutes = require("./routes/settings.routes");
const integrationsRoutes = require("./routes/integrations.routes");
const dataRoutes = require("./routes/data.routes");

const app = express();

// =====================
// MIDDLEWARE
// =====================

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// =====================
// ROUTES
// =====================

app.use("/api/auth", authRoutes);

app.use("/api/chat", chatRoutes);

app.use("/api/ai", aiRoutes);

app.use("/api/skills", skillRoutes);

app.use("/api/memory", memoryRoutes);

app.use("/api/workflows", workflowRoutes);

app.use("/api/documents", documentRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/projects", projectRoutes);

app.use("/api/settings", settingsRoutes);

app.use("/api/integrations", integrationsRoutes);

app.use("/api/data", dataRoutes);

module.exports = app;
