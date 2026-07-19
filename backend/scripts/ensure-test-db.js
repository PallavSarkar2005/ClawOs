#!/usr/bin/env node
/**
 * Ensure test Postgres is reachable; start docker compose if needed.
 */
"use strict";

const { execSync, spawnSync } = require("child_process");
const net = require("net");
const path = require("path");

const HOST = process.env.TEST_DB_HOST || "127.0.0.1";
const PORT = Number(process.env.TEST_DB_PORT || 5434);
const COMPOSE = path.join(__dirname, "..", "docker-compose.test.yml");

function portOpen() {
  return new Promise((resolve) => {
    const s = net.connect(PORT, HOST);
    s.on("connect", () => {
      s.end();
      resolve(true);
    });
    s.on("error", () => resolve(false));
  });
}

async function waitForPort(ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await portOpen()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

async function main() {
  if (await portOpen()) {
    console.log(`[test-db] already available on ${HOST}:${PORT}`);
    return;
  }

  console.log(`[test-db] starting docker compose from ${COMPOSE}`);
  const up = spawnSync(
    "docker",
    ["compose", "-f", COMPOSE, "up", "-d"],
    { stdio: "inherit", shell: false },
  );
  if (up.status !== 0) {
    console.error("[test-db] failed to start docker compose");
    process.exit(1);
  }

  const ok = await waitForPort(90000);
  if (!ok) {
    console.error("[test-db] postgres did not become ready in time");
    process.exit(1);
  }
  console.log(`[test-db] ready on ${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
