"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { createUser, createMemory } = require("../helpers/factories");
const { recordPerformance, writeReports } = require("../helpers/report");

describe("Integration — Performance baselines", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    writeReports();
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  async function measure(name, fn, budgetMs) {
    const started = Date.now();
    await fn();
    const durationMs = Date.now() - started;
    recordPerformance(name, durationMs, { budgetMs });
    assert.ok(
      durationMs < budgetMs,
      `${name} took ${durationMs}ms (budget ${budgetMs}ms)`,
    );
  }

  it("API latency for auth me is within budget", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    await measure(
      "perf.api.me",
      async () => {
        const res = await api.get("/api/auth/me", { jar: session.jar });
        assert.equal(res.status, 200);
      },
      2000,
    );
  });

  it("memory retrieval latency is within budget", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    await api.post(
      "/api/memory",
      { content: "perf memory marker about OpenClaw latency" },
      { jar: session.jar },
    );
    await measure(
      "perf.memory.search",
      async () => {
        const res = await api.post(
          "/api/memory/search",
          { query: "marker", limit: 10 },
          { jar: session.jar },
        );
        assert.ok([200, 201].includes(res.status), res.text);
      },
      8000,
    );
  });

  it("context construction latency is within budget", async () => {
    const user = await createUser();
    await createMemory(user.id, { content: "Context perf memory" });
    const { engine } = require("../../src/context");
    await measure(
      "perf.context.build",
      async () => {
        await engine.build(user.id, "context performance", {
          skipCache: true,
          tokenBudget: 1000,
        });
      },
      10000,
    );
  });

  it("workflow validation latency is within budget", async () => {
    const { validateDefinition } = require("../../src/workflows/validation/validator");
    const { PARALLEL_WORKFLOW } = require("../helpers/fixtures");
    await measure(
      "perf.workflow.validate",
      async () => {
        const v = validateDefinition(PARALLEL_WORKFLOW);
        assert.equal(v.ok, true);
      },
      500,
    );
  });
});
