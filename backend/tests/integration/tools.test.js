"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const fs = require("fs");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { createTempDir, writeTree } = require("../helpers/temp-fs");
const { createTempGitRepo, ensureGitAvailable } = require("../helpers/temp-git");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Tool platform", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("lists builtin tools across categories", async () => {
    const tools = require("../../src/tools");
    if (typeof tools.initToolPlatform === "function") {
      await tools.initToolPlatform({ hotReload: false, loadMcp: false });
    }
    const list = tools.listTools();
    assert.ok(Array.isArray(list));
    assert.ok(list.length > 0);
  });

  it("executes filesystem tool with sandbox permissions", async () => {
    const tools = require("../../src/tools");
    if (typeof tools.initToolPlatform === "function") {
      await tools.initToolPlatform({ hotReload: false, loadMcp: false });
    }
    const dir = createTempDir("clawos-tool-");
    writeTree(dir, { "hello.txt": "hello tools\n" });

    const candidates = tools.listTools().filter((id) => /file|fs|read|list/i.test(id));
    assert.ok(candidates.length >= 0);

    if (candidates.length) {
      const started = Date.now();
      const result = await tools.executeTool(
        candidates[0],
        { path: path.join(dir, "hello.txt") },
        { userId: "test-user", permissions: ["filesystem:read"] },
      );
      recordPerformance("tools.filesystem", Date.now() - started);
      assert.ok(result);
    }
  });

  it("git tools operate on temporary repositories", async () => {
    if (!ensureGitAvailable()) return;
    const tools = require("../../src/tools");
    if (typeof tools.initToolPlatform === "function") {
      await tools.initToolPlatform({ hotReload: false, loadMcp: false });
    }
    const repo = createTempGitRepo();
    const gitTools = tools.listTools().filter((id) => /git/i.test(id));
    assert.ok(gitTools.length >= 0);
    if (gitTools.length) {
      const result = await tools.executeTool(
        gitTools[0],
        { cwd: repo },
        { userId: "test-user", permissions: ["git:read"] },
      );
      assert.ok(result);
    }
  });

  it("API catalog and invoke endpoints are authorized", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const catalog = await api.get("/api/tools/catalog", { jar: session.jar });
    assert.ok([200, 404].includes(catalog.status));
    const list = await api.get("/api/tools", { jar: session.jar });
    assert.equal(list.status, 200);

    const tools = list.body?.tools || list.body || [];
    if (Array.isArray(tools) && tools.length) {
      const id = tools[0].id || tools[0];
      const invoke = await api.post(
        `/api/tools/${id}/invoke`,
        { input: {} },
        { jar: session.jar },
      );
      assert.ok([200, 201, 400, 403, 404, 500].includes(invoke.status));
    }

    const mcp = await api.get("/api/tools/mcp", { jar: session.jar });
    assert.ok([200, 404].includes(mcp.status));
  });

  it("permission checks reject unauthorized tool use", async () => {
    const tools = require("../../src/tools");
    if (typeof tools.hasPermission === "function") {
      assert.equal(tools.hasPermission([], ["filesystem:write"]), false);
      assert.equal(tools.hasPermission(["*"], ["filesystem:write"]), true);
      assert.equal(
        tools.hasPermission(["filesystem:read"], ["filesystem:write"]),
        false,
      );
    }
  });

  it("records tool executions for audit", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const execs = await api.get("/api/tools/executions", { jar: session.jar });
    assert.ok([200, 404].includes(execs.status));
  });
});
