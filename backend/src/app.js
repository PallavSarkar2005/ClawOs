const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const path = require("path");
const { getEnv } = require("./config/env");
const { apiLimiter } = require("./middleware/rate-limit.middleware");
const protect = require("./middleware/auth.middleware");

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
const runtimeRoutes = require("./routes/runtime.routes");

const env = getEnv();
const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'", ...env.CORS_ORIGINS, "ws:", "wss:"],
        fontSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    hsts: env.isProd
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
  }),
);

app.use((req, res, next) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (env.CORS_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Refresh-Token"],
  }),
);

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));
app.use(cookieParser());
app.use(apiLimiter());

// Authenticated static uploads — prevent public file enumeration
app.use("/uploads", protect, express.static(path.join(__dirname, "../uploads"), {
  fallthrough: false,
  setHeaders(res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
  },
}));

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
app.use("/api/runtime", runtimeRoutes);

app.use((err, req, res, next) => {
  if (err && err.message === "CORS origin not allowed") {
    return res.status(403).json({ message: "CORS origin not allowed" });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ message: "Request body too large" });
  }
  console.error("[ERROR]", err?.message || err);
  return res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
