/**
 * Must be required before any application module.
 * Configures deterministic test environment variables.
 */
"use strict";

const path = require("path");

process.env.NODE_ENV = "test";
process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-key-minimum-32-chars-abcdef";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret-min-32-chars-ghijkl";
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || "test-encryption-key-minimum-32-chars-mnopqr";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  "postgresql://postgres:postgres@127.0.0.1:5434/clawos_test?schema=public";
process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:5173";
process.env.APP_URL = process.env.APP_URL || "http://localhost:5173";
process.env.COOKIE_SECURE = "false";
process.env.ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || "15m";
process.env.REFRESH_TOKEN_TTL_DAYS = process.env.REFRESH_TOKEN_TTL_DAYS || "7";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.RATE_LIMIT_MAX = "100000";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.RATE_LIMIT_CHAT_MAX = "100000";
process.env.RATE_LIMIT_AI_MAX = "100000";
process.env.RATE_LIMIT_MEMORY_MAX = "100000";
process.env.RATE_LIMIT_UPLOAD_MAX = "100000";
process.env.RATE_LIMIT_TERMINAL_MAX = "100000";
process.env.RATE_LIMIT_GIT_MAX = "100000";
process.env.RATE_LIMIT_WORKSPACE_MAX = "100000";
process.env.RATE_LIMIT_DOCUMENT_MAX = "100000";
process.env.WORKSPACE_ROOT =
  process.env.WORKSPACE_ROOT ||
  path.join(require("os").tmpdir(), "clawos-test-workspaces");
process.env.OPENCLAW_MOCK_LLM = "true";
process.env.PORT = process.env.PORT || "0";
process.env.EMBEDDING_PROVIDER = "local";

module.exports = {
  isTest: true,
  databaseUrl: process.env.DATABASE_URL,
};
