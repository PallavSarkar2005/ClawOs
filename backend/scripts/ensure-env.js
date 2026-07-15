#!/usr/bin/env node
/**
 * Ensures required secrets exist in backend/.env.
 * Generates cryptographically strong values when missing or too short.
 * Never overwrites existing strong secrets.
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const envPath = path.join(__dirname, "../.env");

function strong() {
  return crypto.randomBytes(48).toString("hex");
}

function parse(content) {
  const map = new Map();
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    map.set(line.slice(0, i).trim(), line.slice(i + 1).trim());
  }
  return map;
}

function isStrong(value) {
  if (!value || value.length < 32) return false;
  const weak = new Set([
    "clawos_super_secret_key",
    "clawos_super_refresh_secret_key",
    "secret",
    "changeme",
    "password",
    "jwt_secret",
    "test",
  ]);
  return !weak.has(value.toLowerCase());
}

let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const map = parse(raw);
const added = [];

function ensure(key, generator = strong) {
  if (!isStrong(map.get(key))) {
    map.set(key, generator());
    added.push(key);
  }
}

ensure("JWT_SECRET");
ensure("JWT_REFRESH_SECRET");
ensure("ENCRYPTION_KEY");

if (!map.get("CORS_ORIGINS")) {
  map.set("CORS_ORIGINS", "http://localhost:5173");
  added.push("CORS_ORIGINS");
}
if (!map.get("APP_URL")) {
  map.set("APP_URL", "http://localhost:5173");
  added.push("APP_URL");
}
if (!map.get("NODE_ENV")) {
  map.set("NODE_ENV", "development");
  added.push("NODE_ENV");
}

if (map.get("JWT_SECRET") === map.get("JWT_REFRESH_SECRET")) {
  map.set("JWT_REFRESH_SECRET", strong());
  added.push("JWT_REFRESH_SECRET(rotated)");
}

const lines = [];
const seen = new Set();
for (const line of raw.split(/\r?\n/)) {
  if (!line || line.trim().startsWith("#")) {
    lines.push(line);
    continue;
  }
  const i = line.indexOf("=");
  if (i === -1) {
    lines.push(line);
    continue;
  }
  const key = line.slice(0, i).trim();
  if (map.has(key)) {
    lines.push(`${key}=${map.get(key)}`);
    seen.add(key);
  } else {
    lines.push(line);
  }
}
for (const [key, value] of map) {
  if (!seen.has(key)) lines.push(`${key}=${value}`);
}

fs.writeFileSync(envPath, `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`);
if (added.length) {
  console.log(`[ensure-env] Generated/updated: ${added.join(", ")}`);
} else {
  console.log("[ensure-env] All required secrets present");
}
