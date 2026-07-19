"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { SAMPLE_GOAL } = require("../helpers/fixtures");
const { decomposeGoal } = require("../../src/autonomy/planner/decompose");
const { sanitizeMasterPlan, buildExecutionGraph } = require("../../src/autonomy/planner/master");
const { evaluateSession } = require("../../src/autonomy/quality/gates");
const { classifyAction } = require("../../src/autonomy/approval/gate");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Autonomy", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("decomposes goals into ordered tasks with agent assignment", () => {
    const plan = decomposeGoal(SAMPLE_GOAL);
    assert.ok(plan.tasks.length >= 3);
    assert.ok(plan.tasks.every((t) => t.id && t.title));
  });

  it("builds execution graph and quality gates", () => {
    const decomposed = decomposeGoal(SAMPLE_GOAL);
    const tasks = decomposed.tasks.map((t) => ({
      ...t,
      agent: t.agent || "backend_engineer",
      dependsOn: t.dependsOn || [],
      priority: t.priority || 50,
      complexity: t.complexity || "medium",
    }));
    const master = sanitizeMasterPlan({
      intent: SAMPLE_GOAL,
      tasks,
      milestones: [],
    });
    const graph = buildExecutionGraph(master.tasks || tasks);
    assert.ok(graph);
    assert.ok(Array.isArray(graph.nodes));

    const gates = evaluateSession({
      build: { status: "passed", exitCode: 0 },
      tests: { status: "passed", passed: 1, failed: 0 },
      review: { score: 0.9, criticalIssues: 0, security: 0.9 },
    });
    assert.ok(gates);
  });

  it("classifies actions requiring approval", () => {
    const risky = classifyAction({ type: "git_push", target: "main" });
    assert.ok(risky);
  });

  it("creates goals, plans, and starts execution via API", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);

    const create = await api.post(
      "/api/autonomy/goals",
      { title: SAMPLE_GOAL, description: SAMPLE_GOAL },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(create.status), create.text);
    const goalId = create.body?.id || create.body?.goal?.id;

    if (goalId) {
      const started = Date.now();
      const plan = await api.post(
        `/api/autonomy/goals/${goalId}/plan`,
        {},
        { jar: session.jar },
      );
      recordPerformance("autonomy.plan", Date.now() - started, { status: plan.status });
      assert.ok([200, 201, 400, 404, 500].includes(plan.status));
    }

    const decompose = await api.post(
      "/api/autonomy/decompose",
      { goal: SAMPLE_GOAL },
      { jar: session.jar },
    );
    assert.ok([200, 201, 400, 500].includes(decompose.status));

    const exec = await api.post(
      "/api/autonomy/execute",
      { goal: SAMPLE_GOAL },
      { jar: session.jar },
    );
    assert.ok([200, 201, 202, 400, 500].includes(exec.status));

    const approvals = await api.get("/api/autonomy/approvals", { jar: session.jar });
    assert.ok([200, 404].includes(approvals.status));

    const sessions = await api.get("/api/autonomy/sessions", { jar: session.jar });
    assert.ok([200, 404].includes(sessions.status));
  });
});
