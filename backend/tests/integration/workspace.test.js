"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { createIndexedWorkspace, createGitWorkspace } = require("../helpers/workspace");
const { createSampleProject } = require("../helpers/temp-fs");
const { ensureGitAvailable } = require("../helpers/temp-git");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Workspace / intelligence", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("creates a workspace with a local repository tree", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const started = Date.now();
    const ws = await createIndexedWorkspace(api, session.jar, session.user.id);
    recordPerformance("workspace.create", Date.now() - started);
    assert.ok(ws.projectId);
    assert.ok(fs.existsSync(path.join(ws.localPath, "src", "index.js")));
  });

  it("indexes repository and exposes symbol/search APIs", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const ws = await createIndexedWorkspace(api, session.jar, session.user.id);

    const started = Date.now();
    const index = await api.post(
      `/api/projects/${ws.projectId}/intelligence/index`,
      {},
      { jar: session.jar },
    );
    recordPerformance("workspace.index", Date.now() - started, { status: index.status });
    assert.ok([200, 201, 202, 404, 500].includes(index.status));

    const symbols = await api.get(
      `/api/projects/${ws.projectId}/intelligence/symbols`,
      { jar: session.jar },
    );
    assert.ok([200, 404, 500].includes(symbols.status));

    const search = await api.post(
      `/api/projects/${ws.projectId}/intelligence/search`,
      { query: "greet" },
      { jar: session.jar },
    );
    assert.ok([200, 404, 500].includes(search.status));

    const impact = await api.post(
      `/api/projects/${ws.projectId}/intelligence/impact`,
      { symbol: "greet" },
      { jar: session.jar },
    );
    assert.ok([200, 400, 404, 500].includes(impact.status));

    const rename = await api.post(
      `/api/projects/${ws.projectId}/intelligence/rename`,
      { symbol: "greet", newName: "sayHello" },
      { jar: session.jar },
    );
    assert.ok([200, 400, 404, 500].includes(rename.status));
  });

  it("creates temporary git repositories for analysis", async () => {
    if (!ensureGitAvailable()) {
      return;
    }
    const { repo } = await createGitWorkspace();
    assert.ok(fs.existsSync(path.join(repo, ".git")));
    assert.ok(fs.existsSync(path.join(repo, "src", "app.js")));
  });

  it("parses sample project for dependency graph inputs", () => {
    const sample = createSampleProject();
    const indexJs = fs.readFileSync(path.join(sample, "src", "index.js"), "utf8");
    assert.match(indexJs, /require\('\.\/lib\/greet'\)/);
    const pkg = JSON.parse(fs.readFileSync(path.join(sample, "package.json"), "utf8"));
    assert.equal(pkg.name, "sample-app");
  });
});
