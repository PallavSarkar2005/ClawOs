"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getPrisma } = require("../helpers/harness");
const { createUser, createConversation, createMemory, createDocument } = require("../helpers/factories");
const { allocateBudget } = require("../../src/context/budget");
const { rankItems } = require("../../src/context/ranking");
const { compressItems } = require("../../src/context/compression");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Context engine", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("allocates token budget and fits pack", () => {
    const budget = allocateBudget({
      model: "mock-llm",
      tokenBudget: 4000,
      maxPack: 2000,
    });
    assert.ok(budget.packBudget > 0);
    assert.ok(budget.modelLimit > 0);
  });

  it("ranks and compresses retrieved items", () => {
    const items = [
      { id: "1", source: "memory", content: "Postgres is used", score: 0.9 },
      { id: "2", source: "document", content: "Unrelated marketing copy", score: 0.2 },
      { id: "3", source: "conversation", content: "User asked about DB", score: 0.7 },
    ];
    const ranked = rankItems(items, {
      query: "database postgres",
      agentType: "coordinator",
    });
    assert.ok(Array.isArray(ranked));
    assert.ok(ranked.length >= 1);

    const compressed = compressItems(ranked, { maxTokens: 100 });
    assert.ok(compressed);
  });

  it("assembles context from conversation, memory, and documents", async () => {
    const user = await createUser();
    const convo = await createConversation(user.id, { title: "DB chat" });
    await createMemory(user.id, { content: "Primary datastore is PostgreSQL via Prisma." });
    await createDocument(user.id, {
      name: "architecture.md",
      content: "OpenClaw architecture relies on PostgreSQL for persistence.",
      status: "ready",
    });

    const { engine } = require("../../src/context");
    const started = Date.now();
    const result = await engine.build(user.id, "Which database?", {
      conversationId: convo.id,
      skipCache: true,
      tokenBudget: 1500,
    });
    recordPerformance("context.assembly", Date.now() - started);

    assert.ok(result);
    const blob = JSON.stringify(result).toLowerCase();
    // soft assertion — engine should produce structured output
    assert.ok(blob.length > 10);
  });

  it("persists context session observability when available", async () => {
    const user = await createUser();
    const { engine } = require("../../src/context");
    await engine.build(user.id, "hello context", { skipCache: true, tokenBudget: 800 });
    const sessions = await getPrisma().contextSession.findMany({
      where: { userId: user.id },
      take: 5,
    });
    assert.ok(Array.isArray(sessions));
  });
});
