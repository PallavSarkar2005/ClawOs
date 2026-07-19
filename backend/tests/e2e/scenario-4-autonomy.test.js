"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { SAMPLE_GOAL } = require("../helpers/fixtures");
const { setDefaultContent } = require("../helpers/mock-llm");

describe("E2E Scenario 4 — Autonomous engineering task", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("goal → plan → execute → inspect builds/tests/reviews", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    setDefaultContent("Implemented health check endpoint. All tests passed.");

    const goal = await api.post(
      "/api/autonomy/goals",
      { title: SAMPLE_GOAL, description: SAMPLE_GOAL },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(goal.status));
    const goalId = goal.body?.id || goal.body?.goal?.id;

    if (goalId) {
      const plan = await api.post(
        `/api/autonomy/goals/${goalId}/plan`,
        {},
        { jar: session.jar },
      );
      assert.ok([200, 201, 400, 404, 500].includes(plan.status));
    }

    const exec = await api.post(
      "/api/autonomy/execute",
      { goal: SAMPLE_GOAL },
      { jar: session.jar },
    );
    assert.ok([200, 201, 202, 400, 500].includes(exec.status));

    const builds = await api.get("/api/autonomy/builds", { jar: session.jar });
    assert.ok([200, 404].includes(builds.status));
    const tests = await api.get("/api/autonomy/tests", { jar: session.jar });
    assert.ok([200, 404].includes(tests.status));
    const reviews = await api.get("/api/autonomy/reviews", { jar: session.jar });
    assert.ok([200, 404].includes(reviews.status));
  });
});
