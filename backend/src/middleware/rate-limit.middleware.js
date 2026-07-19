const rateLimit = require("express-rate-limit");
const { getEnv } = require("../config/env");

function clientKey(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const userPart = req.user?.id || "anon";
  return `${userPart}:${ip}`;
}

function rateLimitDisabled() {
  return (
    process.env.RATE_LIMIT_DISABLED === "true" ||
    process.env.NODE_ENV === "test"
  );
}

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max: rateLimitDisabled() ? 1_000_000 : max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
    keyGenerator: clientKey,
    validate: { xForwardedForHeader: false, default: false },
    skip: () => rateLimitDisabled(),
  });
}

const authLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Too many auth attempts from this IP, please try again after 15 minutes.",
});

const passwordResetLimiter = makeLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Too many password reset attempts from this IP, please try again after an hour.",
});

function apiLimiter() {
  const env = getEnv();
  return makeLimiter({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX,
    message: "Too many requests. Please slow down.",
  });
}

const chatLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_CHAT_MAX) || 30,
  message: "Chat rate limit exceeded. Please wait a moment.",
});

const aiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_AI_MAX) || 20,
  message: "AI generation rate limit exceeded.",
});

const memoryLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MEMORY_MAX) || 60,
  message: "Memory API rate limit exceeded.",
});

const uploadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_UPLOAD_MAX) || 20,
  message: "Upload rate limit exceeded.",
});

const terminalLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_TERMINAL_MAX) || 30,
  message: "Terminal rate limit exceeded.",
});

const gitLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_GIT_MAX) || 40,
  message: "Git API rate limit exceeded.",
});

const workspaceLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_WORKSPACE_MAX) || 120,
  message: "Workspace API rate limit exceeded.",
});

const documentLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_DOCUMENT_MAX) || 40,
  message: "Document API rate limit exceeded.",
});

module.exports = {
  authLimiter,
  passwordResetLimiter,
  apiLimiter,
  chatLimiter,
  aiLimiter,
  memoryLimiter,
  uploadLimiter,
  terminalLimiter,
  gitLimiter,
  workspaceLimiter,
  documentLimiter,
};
