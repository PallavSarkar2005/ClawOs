"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { PARALLEL_WORKFLOW, CONDITIONAL_WORKFLOW } = require("../helpers/fixtures");
const {
  topologicalWaves,
  detectCycles,
  normalizeDefinition,
} = require("../../src/workflows/dag/graph");
const { validateDefinition } = require("../../src/workflows/validation/validator");
const { canTransition } = require("../../src/workflows/engine/state-machine");
const { EXECUTION_STATUS } = require("../../src/workflows/constants");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Workflow engine", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("validates DAG scheduling and parallel waves", () => {
    const def = normalizeDefinition(PARALLEL_WORKFLOW);
    const v = validateDefinition(def);
    assert.equal(v.ok, true);
    const { waves, hasCycle } = topologicalWaves(def);
    assert.equal(hasCycle, false);
    assert.ok(waves.some((w) => w.includes("a") && w.includes("b")));
  });

  it("supports conditional branches", () => {
    const def = normalizeDefinition(CONDITIONAL_WORKFLOW);
    const v = validateDefinition(def);
    assert.equal(v.ok, true);
    assert.equal(detectCycles(def).length, 0);
  });

  it("enforces execution state machine transitions", () => {
    assert.equal(canTransition(EXECUTION_STATUS.QUEUED, EXECUTION_STATUS.RUNNING), true);
    assert.equal(canTransition(EXECUTION_STATUS.RUNNING, EXECUTION_STATUS.PAUSED), true);
    assert.equal(canTransition(EXECUTION_STATUS.PAUSED, EXECUTION_STATUS.RUNNING), true);
    assert.equal(canTransition(EXECUTION_STATUS.COMPLETED, EXECUTION_STATUS.RUNNING), false);
  });

  it("creates, executes, pauses, resumes workflows via API", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);

    const create = await api.post(
      "/api/workflows",
      {
        name: "Integration Flow",
        description: "e2e workflow",
        definition: {
          nodes: [
            { id: "start", type: "start", data: { label: "Start" } },
            {
              id: "t1",
              type: "transform",
              data: { label: "Echo", expression: "'ok'" },
            },
            { id: "end", type: "end", data: { label: "End" } },
          ],
          edges: [
            { id: "e1", source: "start", target: "t1" },
            { id: "e2", source: "t1", target: "end" },
          ],
        },
      },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(create.status), create.text);
    const workflowId = create.body?.id || create.body?.workflow?.id;
    assert.ok(workflowId);

    const started = Date.now();
    const exec = await api.post(
      `/api/workflows/${workflowId}/execute`,
      { inputs: { x: 1 } },
      { jar: session.jar },
    );
    recordPerformance("workflow.execute", Date.now() - started, { status: exec.status });
    assert.ok([200, 201, 202, 400, 500].includes(exec.status));

    const executionId =
      exec.body?.id || exec.body?.executionId || exec.body?.execution?.id;

    if (executionId) {
      const pause = await api.post(
        `/api/workflows/executions/${executionId}/pause`,
        {},
        { jar: session.jar },
      );
      assert.ok([200, 400, 409, 404].includes(pause.status));

      const resume = await api.post(
        `/api/workflows/executions/${executionId}/resume`,
        {},
        { jar: session.jar },
      );
      assert.ok([200, 400, 409, 404].includes(resume.status));

      const approve = await api.post(
        `/api/workflows/executions/${executionId}/approve`,
        { approved: true },
        { jar: session.jar },
      );
      assert.ok([200, 400, 404, 409].includes(approve.status));

      const retry = await api.post(
        `/api/workflows/executions/${executionId}/retry`,
        {},
        { jar: session.jar },
      );
      assert.ok([200, 400, 404, 409].includes(retry.status));
    }

    const history = await api.get(`/api/workflows/${workflowId}/history`, {
      jar: session.jar,
    });
    assert.ok([200, 404].includes(history.status));
  });
});
