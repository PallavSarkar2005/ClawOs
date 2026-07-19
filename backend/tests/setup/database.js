/**
 * Isolated PostgreSQL test database helpers.
 * Syncs schema via db push, truncates tables between tests.
 */
"use strict";

require("./env");

const { execSync } = require("child_process");
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "../..");

let prisma = null;
let synced = false;

function getPrisma() {
  if (!prisma) {
    delete require.cache[require.resolve("../../src/database/prisma")];
    prisma = require("../../src/database/prisma");
  }
  return prisma;
}

async function waitForDatabase({ retries = 40, delayMs = 1000 } = {}) {
  const client = getPrisma();
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      await client.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(
    `Test database unavailable at ${process.env.DATABASE_URL}: ${lastErr?.message || lastErr}`,
  );
}

function syncSchema() {
  if (synced) return;
  // Prefer migrate deploy; fall back to db push so schema.prisma stays authoritative in tests
  try {
    execSync("npx prisma migrate deploy", {
      cwd: BACKEND_ROOT,
      env: { ...process.env },
      stdio: "pipe",
    });
  } catch {
    // continue to db push
  }
  execSync("npx prisma db push --accept-data-loss --skip-generate", {
    cwd: BACKEND_ROOT,
    env: { ...process.env },
    stdio: "pipe",
  });
  synced = true;
}

async function setupDatabase() {
  await waitForDatabase();
  syncSchema();
  return getPrisma();
}

async function resetDatabase() {
  const client = getPrisma();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await client.$executeRawUnsafe(`
        DO $$ DECLARE r RECORD;
        BEGIN
          FOR r IN (
            SELECT tablename FROM pg_tables
            WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
          ) LOOP
            EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
          END LOOP;
        END $$;
      `);
      return;
    } catch (err) {
      if (attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 100 * (attempt + 1)));
    }
  }
}

async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

module.exports = {
  getPrisma,
  setupDatabase,
  resetDatabase,
  disconnectDatabase,
  waitForDatabase,
  syncSchema,
  runMigrations: syncSchema,
};
