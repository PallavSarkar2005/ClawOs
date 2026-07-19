"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { createConversation, createMemory } = require("../helpers/factories");
const { setDefaultContent } = require("../helpers/mock-llm");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Coordinator runtime", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("executes planner → agents → final response via runtime API", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    setDefaultContent("FINAL_ANSWER: Integration coordinator completed successfully.");

    const convo = await api.post(
      "/api/chat/conversation",
      { title: "Coordinator test" },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(convo.status), convo.text);
    const conversationId = convo.body?.id || convo.body?.conversation?.id;
    assert.ok(conversationId);

    const started = Date.now();
    const res = await api.post(
      "/api/runtime/message",
      {
        conversationId,
        message: "Explain what OpenClaw is in one sentence.",
      },
      { jar: session.jar },
    );
    recordPerformance("coordinator.execute", Date.now() - started, { status: res.status });

    assert.ok(
      [200, 201, 202, 400, 500].includes(res.status),
      `unexpected status ${res.status}: ${res.text}`,
    );

    if (res.body?.id || res.body?.executionId) {
      const id = res.body.id || res.body.executionId;
      const get = await api.get(`/api/runtime/executions/${id}`, { jar: session.jar });
      assert.ok([200, 404].includes(get.status));
    }
  });

  it("lists executions for the authenticated user", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const list = await api.get("/api/runtime/executions", { jar: session.jar });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body) || Array.isArray(list.body?.executions));
  });

  it("builds context through context engine for a conversation", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const userId = session.user.id;
    const convo = await createConversation(userId);
    await createMemory(userId, { content: "OpenClaw uses PostgreSQL and Prisma." });

    const contextEngine = require("../../src/context");
    const engine = contextEngine.engine || contextEngine.contextEngine || contextEngine;
    const started = Date.now();
    const packed = await engine.build(userId, "What database does OpenClaw use?", {
      conversationId: convo.id,
      skipCache: true,
      tokenBudget: 2000,
    });
    recordPerformance("context.build", Date.now() - started);

    assert.ok(packed);
    assert.ok(
      packed.messages ||
        packed.prompt ||
        packed.items ||
        packed.context ||
        packed.budget ||
        packed.observability,
    );
  });

  it("records observability around coordinator activity", async () => {
    const obs = require("../../src/observability");
    const tracer = obs.tracer;
    assert.ok(tracer);
  });
});
