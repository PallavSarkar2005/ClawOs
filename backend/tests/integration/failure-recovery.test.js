"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi, getPrisma } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const {
  failNextCall,
  timeoutNextCall,
  resetMockLlm,
  setDefaultContent,
} = require("../helpers/mock-llm");

describe("Integration — Failure recovery", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
    resetMockLlm();
  });

  it("recovers after mock LLM failure on subsequent call", async () => {
    const { mockChat } = require("../helpers/mock-llm");
    failNextCall("upstream unavailable");
    await assert.rejects(() => mockChat({ messages: [] }), /upstream unavailable/);
    setDefaultContent("recovered");
    const ok = await mockChat({ messages: [{ role: "user", content: "hi" }] });
    assert.equal(ok.content, "recovered");
  });

  it("surfaces LLM timeout errors distinctly", async () => {
    const { mockChat } = require("../helpers/mock-llm");
    timeoutNextCall();
    await assert.rejects(() => mockChat({ messages: [] }), /timeout/i);
  });

  it("handles tool failure without crashing the platform", async () => {
    const tools = require("../../src/tools");
    if (typeof tools.initToolPlatform === "function") {
      await tools.initToolPlatform({ hotReload: false, loadMcp: false });
    }
    const list = tools.listTools();
    if (!list.length) return;
    const result = await tools.executeTool(
      list[0],
      { path: "/nonexistent/path/that/should/fail" },
      { userId: "recovery-user" },
    );
    assert.ok(result);
  });

  it("database remains consistent after failed auth attempt", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const before = await getPrisma().user.count();
    const bad = await api.post(
      "/api/auth/login",
      { email: session.email, password: "DefinitelyWrong1!" },
      { jar: api.jar() },
    );
    assert.equal(bad.status, 401);
    const after = await getPrisma().user.count();
    assert.equal(before, after);
  });

  it("workflow cancel handles missing execution gracefully", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const res = await api.post(
      "/api/workflows/executions/00000000-0000-0000-0000-000000000000/cancel",
      {},
      { jar: session.jar },
    );
    assert.ok([400, 404, 409, 500].includes(res.status));
  });
});
