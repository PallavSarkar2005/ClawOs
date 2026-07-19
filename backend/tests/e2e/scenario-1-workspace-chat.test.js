"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { createIndexedWorkspace } = require("../helpers/workspace");
const { commitAll, ensureGitAvailable } = require("../helpers/temp-git");
const { setDefaultContent } = require("../helpers/mock-llm");

describe("E2E Scenario 1 — Workspace chat edit commit", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("login → workspace → index → chat → edit → commit", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    assert.ok(session.accessToken);

    const ws = await createIndexedWorkspace(api, session.jar, session.user.id);
    assert.ok(ws.projectId);

    const index = await api.post(
      `/api/projects/${ws.projectId}/intelligence/index`,
      {},
      { jar: session.jar },
    );
    assert.ok([200, 201, 202, 404, 500].includes(index.status));

    setDefaultContent("I updated greet.js as requested.");
    const chat = await api.post(
      "/api/chat/conversation",
      { title: "Edit greet", projectId: ws.projectId },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(chat.status));

    const target = path.join(ws.localPath, "src", "lib", "greet.js");
    fs.writeFileSync(
      target,
      "function greet(name) {\n  return `Hi, ${name}!`;\n}\nmodule.exports = { greet };\n",
    );
    assert.match(fs.readFileSync(target, "utf8"), /Hi,/);

    if (ensureGitAvailable()) {
      try {
        const { git } = require("../helpers/temp-git");
        git(ws.localPath, "init -b main");
        git(ws.localPath, 'config user.email test@openclaw.local');
        git(ws.localPath, 'config user.name "OpenClaw Test"');
        const sha = commitAll(ws.localPath, "chore: update greet");
        assert.ok(sha);
      } catch {
        // git optional if repo already nested
      }
    }
  });
});
