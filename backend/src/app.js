const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const chatRoutes = require("./routes/chat.routes");
const aiRoutes = require("./routes/ai.routes");
const skillRoutes = require("./routes/skill.routes");
const memoryRoutes = require("./routes/memory.routes");
const workflowRoutes = require("./routes/workflow.routes");
const documentRoutes = require("./routes/document.routes");

const app = express();

// =====================
// MIDDLEWARE
// =====================

app.use(cors());

app.use(express.json());

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

module.exports = app;
