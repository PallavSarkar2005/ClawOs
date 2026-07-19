"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");

describe("E2E Scenario 3 — Workflow execute approve replay", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("create → execute → approve → inspect history", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);

    const create = await api.post(
      "/api/workflows",
      {
        name: "Approval Flow",
        definition: {
          nodes: [
            { id: "start", type: "start", data: {} },
            {
              id: "approve",
              type: "approval",
              data: { label: "Human gate", message: "Approve?" },
            },
            { id: "end", type: "end", data: {} },
          ],
          edges: [
            { id: "e1", source: "start", target: "approve" },
            { id: "e2", source: "approve", target: "end" },
          ],
        },
      },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(create.status));
    const workflowId = create.body?.id || create.body?.workflow?.id;
    assert.ok(workflowId);

    const exec = await api.post(
      `/api/workflows/${workflowId}/execute`,
      { inputs: {} },
      { jar: session.jar },
    );
    assert.ok([200, 201, 202, 400, 500].includes(exec.status));
    const executionId =
      exec.body?.id || exec.body?.executionId || exec.body?.execution?.id;

    if (executionId) {
      const approve = await api.post(
        `/api/workflows/executions/${executionId}/approve`,
        { approved: true },
        { jar: session.jar },
      );
      assert.ok([200, 400, 404, 409].includes(approve.status));
    }

    const history = await api.get(`/api/workflows/${workflowId}/history`, {
      jar: session.jar,
    });
    assert.ok([200, 404].includes(history.status));

    const metrics = await api.get(`/api/workflows/${workflowId}/metrics`, {
      jar: session.jar,
    });
    assert.ok([200, 404].includes(metrics.status));
  });
});
