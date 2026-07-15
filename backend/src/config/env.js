/**
 * Fail-fast environment validation.
 * Application must not start with missing or insecure defaults.
 */
require("dotenv").config();

const REQUIRED = ["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET", "ENCRYPTION_KEY"];

const WEAK_DEFAULTS = new Set([
  "clawos_super_secret_key",
  "clawos_super_refresh_secret_key",
  "secret",
  "changeme",
  "password",
  "jwt_secret",
  "test",
]);

function assertStrongSecret(name, value) {
  if (!value || typeof value !== "string") {
    throw new Error(`[FATAL] Missing required environment variable: ${name}`);
  }
  if (value.length < 32) {
    throw new Error(
      `[FATAL] ${name} must be at least 32 characters (got ${value.length})`,
    );
  }
  if (WEAK_DEFAULTS.has(value.toLowerCase())) {
    throw new Error(`[FATAL] ${name} uses a known insecure default value`);
  }
}

function loadEnv() {
  for (const key of REQUIRED) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      throw new Error(`[FATAL] Missing required environment variable: ${key}`);
    }
  }

  assertStrongSecret("JWT_SECRET", process.env.JWT_SECRET);
  assertStrongSecret("JWT_REFRESH_SECRET", process.env.JWT_REFRESH_SECRET);
  assertStrongSecret("ENCRYPTION_KEY", process.env.ENCRYPTION_KEY);

  if (process.env.JWT_SECRET === process.env.JWT_REFRESH_SECRET) {
    throw new Error("[FATAL] JWT_SECRET and JWT_REFRESH_SECRET must be different");
  }

  const isProd = process.env.NODE_ENV === "production";

  const corsOrigins = (process.env.CORS_ORIGINS || process.env.APP_URL || "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (isProd && corsOrigins.some((o) => o.includes("localhost") || o === "*")) {
    throw new Error(
      "[FATAL] Production CORS_ORIGINS must not include localhost or wildcard",
    );
  }

  return Object.freeze({
    NODE_ENV: process.env.NODE_ENV || "development",
    isProd,
    PORT: Number(process.env.PORT) || 5000,
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CORS_ORIGINS: corsOrigins,
    APP_URL: process.env.APP_URL || corsOrigins[0] || "http://localhost:5173",
    COOKIE_SECURE: isProd || process.env.COOKIE_SECURE === "true",
    COOKIE_SAME_SITE: isProd ? "strict" : "lax",
    ACCESS_TOKEN_TTL: process.env.ACCESS_TOKEN_TTL || "15m",
    REFRESH_TOKEN_TTL_DAYS: Number(process.env.REFRESH_TOKEN_TTL_DAYS) || 7,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || null,
    RATE_LIMIT_WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    RATE_LIMIT_MAX: Number(process.env.RATE_LIMIT_MAX) || 300,
  });
}

let cached = null;

function getEnv() {
  if (!cached) cached = loadEnv();
  return cached;
}

module.exports = { getEnv, loadEnv };
