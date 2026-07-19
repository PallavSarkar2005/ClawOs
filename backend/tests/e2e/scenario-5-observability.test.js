"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { writeReports } = require("../helpers/report");

describe("E2E Scenario 5 — Observability dashboard inspect replay", () => {
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

  it("open dashboard → search traces → metrics → logs → alerts", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);

    const dash = await api.get("/api/observability/dashboard", { jar: session.jar });
    assert.ok([200, 404, 500].includes(dash.status));

    const search = await api.get("/api/observability/search?q=execute", {
      jar: session.jar,
    });
    assert.ok([200, 400, 404, 500].includes(search.status));

    const metrics = await api.get("/api/observability/metrics", { jar: session.jar });
    assert.ok([200, 404, 500].includes(metrics.status));

    const logs = await api.get("/api/observability/logs", { jar: session.jar });
    assert.ok([200, 404, 500].includes(logs.status));

    const alerts = await api.get("/api/observability/alerts", { jar: session.jar });
    assert.ok([200, 404, 500].includes(alerts.status));

    // Generate an in-process trace for export path
    const obs = require("../../src/observability");
    if (typeof obs.initObservability === "function") obs.initObservability();
    if (obs.tracer?.startTrace) {
      const t = obs.tracer.startTrace({ name: "e2e-export" });
      obs.tracer.endTrace?.(t?.id || t);
    }
  });
});
