#!/usr/bin/env node
/**
 * Preflight checks for the integration/E2E environment.
 * Exits non-zero if required dependencies are unavailable.
 */
"use strict";

const net = require("net");
const { execSync } = require("child_process");

function checkPort(host, port, label) {
  return new Promise((resolve) => {
    const s = net.connect(port, host);
    const t = setTimeout(() => {
      s.destroy();
      resolve({ label, ok: false, detail: `timeout ${host}:${port}` });
    }, 2000);
    s.on("connect", () => {
      clearTimeout(t);
      s.end();
      resolve({ label, ok: true, detail: `${host}:${port}` });
    });
    s.on("error", (err) => {
      clearTimeout(t);
      resolve({ label, ok: false, detail: err.message });
    });
  });
}

function checkDocker() {
  try {
    execSync("docker info", { stdio: "pipe" });
    return { label: "docker", ok: true, detail: "daemon reachable" };
  } catch (err) {
    return {
      label: "docker",
      ok: false,
      detail: err.message || "docker info failed",
    };
  }
}

function checkEnv() {
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "ENCRYPTION_KEY",
  ];
  const missing = required.filter((k) => !process.env[k] || !String(process.env[k]).trim());
  return {
    label: "env",
    ok: missing.length === 0,
    detail: missing.length ? `missing ${missing.join(", ")}` : "required vars present",
  };
}

async function main() {
  // Apply test defaults if caller didn't set them
  require("../tests/setup/env");

  const results = [];
  results.push(checkDocker());
  results.push(checkEnv());
  results.push(await checkPort("127.0.0.1", 5434, "postgres-test"));
  results.push(await checkPort("127.0.0.1", 6379, "redis"));

  let prismaOk = false;
  let prismaDetail = "";
  try {
    execSync("npx prisma -v", { stdio: "pipe", cwd: require("path").join(__dirname, "..") });
    prismaOk = true;
    prismaDetail = "prisma CLI available";
  } catch (err) {
    prismaDetail = err.message || "prisma unavailable";
  }
  results.push({ label: "prisma", ok: prismaOk, detail: prismaDetail });

  for (const r of results) {
    console.log(`${r.ok ? "OK " : "FAIL"} ${r.label}: ${r.detail}`);
  }

  const requiredFail = results.filter(
    (r) => !r.ok && ["docker", "env", "postgres-test", "prisma"].includes(r.label),
  );
  if (requiredFail.length) {
    console.error("\nEnvironment unhealthy. Fix:");
    console.error('  Start-Process "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"');
    console.error("  docker compose -f backend/docker-compose.test.yml up -d");
    console.error("  Ensure DATABASE_URL points at 127.0.0.1:5434/clawos_test");
    process.exit(1);
  }

  const redis = results.find((r) => r.label === "redis");
  if (redis && !redis.ok) {
    console.warn("WARN redis: optional for most suites, but recommended");
  }

  console.log("\nEnvironment healthy.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
