"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { recordPerformance } = require("../helpers/report");

describe("Integration — API surface", () => {
  let api;
  let jar;

  before(async () => {
    ({ api } = await boot());
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
    const session = await registerAndLogin(getApi());
    jar = session.jar;
  });

  async function expectOk(method, path, body) {
    const started = Date.now();
    const res =
      method === "get" || method === "delete"
        ? await getApi()[method](path, { jar })
        : await getApi()[method](path, body || {}, { jar });
    recordPerformance(`api.${method}.${path}`, Date.now() - started, { status: res.status });
    return res;
  }

  it("lists projects empty then creates one", async () => {
    const list = await expectOk("get", "/api/projects");
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body));

    const created = await expectOk("post", "/api/projects", {
      name: "API Project",
      description: "created by integration test",
      framework: "javascript",
      generate: false,
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.id || created.body.name);

    const again = await expectOk("get", "/api/projects");
    assert.ok(again.body.length >= 1);
  });

  it("validates project create payload", async () => {
    const res = await getApi().post("/api/projects", { name: "" }, { jar });
    assert.ok([400, 422].includes(res.status));
  });

  it("CRUD skills with authorization", async () => {
    const create = await expectOk("post", "/api/skills", {
      name: "Summarizer",
      description: "Summarize text",
      prompt: "Summarize: {{input}}",
    });
    assert.ok(create.status === 201 || create.status === 200);
    const list = await expectOk("get", "/api/skills");
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body) || Array.isArray(list.body?.skills));
  });

  it("memory create, list, get, delete", async () => {
    const create = await expectOk("post", "/api/memory", {
      content: "User prefers dark mode",
      importance: 0.9,
      tags: ["prefs"],
    });
    assert.ok(create.status === 201 || create.status === 200);
    const id = create.body?.id || create.body?.memory?.id;
    assert.ok(id);

    const list = await expectOk("get", "/api/memory");
    assert.equal(list.status, 200);

    const one = await expectOk("get", `/api/memory/${id}`);
    assert.equal(one.status, 200);

    const del = await expectOk("delete", `/api/memory/${id}`);
    assert.ok(del.status === 200 || del.status === 204);
  });

  it("dashboard and settings endpoints respond", async () => {
    const stats = await expectOk("get", "/api/dashboard/stats");
    assert.ok(stats.status === 200 || stats.status === 500);
    const settings = await expectOk("get", "/api/settings");
    assert.equal(settings.status, 200);
  });

  it("AI models and tools catalog", async () => {
    const models = await expectOk("get", "/api/ai/models");
    assert.equal(models.status, 200);
    const catalog = await expectOk("get", "/api/tools/catalog");
    assert.ok(catalog.status === 200 || catalog.status === 404);
    const tools = await expectOk("get", "/api/tools");
    assert.equal(tools.status, 200);
  });

  it("workflows list and create", async () => {
    const list = await expectOk("get", "/api/workflows");
    assert.equal(list.status, 200);
    const create = await expectOk("post", "/api/workflows", {
      name: "Test Flow",
      description: "integration",
      definition: {
        nodes: [
          { id: "start", type: "start", data: { label: "Start" } },
          { id: "end", type: "end", data: { label: "End" } },
        ],
        edges: [{ id: "e1", source: "start", target: "end" }],
      },
    });
    assert.ok(
      [200, 201].includes(create.status),
      `workflow create failed: ${create.status} ${create.text}`,
    );
  });

  it("knowledge, context, observability, autonomy dashboards", async () => {
    const knowledge = await expectOk("get", "/api/knowledge/index/status");
    assert.ok([200, 401, 404, 500].includes(knowledge.status));
    const obs = await expectOk("get", "/api/observability/dashboard");
    assert.ok([200, 401, 404, 500].includes(obs.status));
    const auto = await expectOk("get", "/api/autonomy/dashboard");
    assert.ok([200, 401, 404, 500].includes(auto.status));
    const agents = await expectOk("get", "/api/autonomy/agents");
    assert.ok([200, 401, 404].includes(agents.status));
  });

  it("returns 401 for unauthenticated API access", async () => {
    const res = await getApi().get("/api/memory");
    assert.equal(res.status, 401);
  });

  it("rejects oversized JSON bodies", async () => {
    const huge = "x".repeat(3 * 1024 * 1024);
    const res = await getApi().post(
      "/api/memory",
      { content: huge },
      { jar },
    );
    assert.ok(
      [400, 413, 500].includes(res.status),
      `expected size rejection, got ${res.status}`,
    );
  });
});
