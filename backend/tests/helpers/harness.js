/**
 * Shared test harness — boots env, DB, mock LLM, Express app, API client.
 */
"use strict";

require("../setup/env");
const { installMockLlm, resetMockLlm } = require("./mock-llm");
const {
  setupDatabase,
  resetDatabase,
  disconnectDatabase,
  getPrisma,
} = require("../setup/database");
const { createApiClient } = require("./api");
const { cleanupTempDirs } = require("./temp-fs");

let app = null;
let api = null;
let ready = false;

async function boot() {
  if (ready) return { app, api, prisma: getPrisma() };

  installMockLlm();
  await setupDatabase();

  // Load app only after env + mock LLM are in place
  app = require("../../src/app");
  api = createApiClient(app);
  await api.start();
  ready = true;
  return { app, api, prisma: getPrisma() };
}

async function beforeEachClean() {
  resetMockLlm();
  await resetDatabase();
}

async function shutdown() {
  cleanupTempDirs();
  try {
    const terminal = require("../../src/services/terminal.service");
    if (typeof terminal.killAllForUser === "function") {
      // no-op safety
    }
    if (terminal._reaper) {
      clearInterval(terminal._reaper);
    }
    for (const id of [...(terminal.sessions?.keys?.() || [])]) {
      try {
        terminal.kill(id);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  if (api) await api.stop();
  await disconnectDatabase();
  ready = false;
  app = null;
  api = null;
}

function getApi() {
  if (!api) throw new Error("Test harness not booted — call boot() first");
  return api;
}

function getApp() {
  if (!app) throw new Error("Test harness not booted — call boot() first");
  return app;
}

module.exports = {
  boot,
  beforeEachClean,
  shutdown,
  getApi,
  getApp,
  getPrisma,
};
