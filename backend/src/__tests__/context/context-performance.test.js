/**
 * Performance / large-repository style tests for context ranking & compression.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { rankItems } = require("../../context/ranking");
const { compressItems } = require("../../context/compression");
const { allocateBudget, fitToAllocation } = require("../../context/budget");
const { analyzeProject } = require("../../context/project-intelligence");

describe("context performance", () => {
  it("ranks 2000 items under 1500ms", () => {
    const items = Array.from({ length: 2000 }, (_, i) => ({
      source: i % 3 === 0 ? "project_files" : i % 3 === 1 ? "documents" : "semantic_memory",
      similarity: Math.random(),
      importance: Math.random(),
      frequency: Math.floor(Math.random() * 20),
      content: `item ${i} content `.repeat(5),
      tokenCount: 40,
    }));
    const t0 = Date.now();
    const ranked = rankItems(items, { agentType: "coder", projectId: "p1" });
    const ms = Date.now() - t0;
    assert.equal(ranked.length, 2000);
    assert.ok(ms < 1500, `ranking took ${ms}ms`);
  });

  it("compresses large corpus under 1500ms", () => {
    const items = Array.from({ length: 500 }, (_, i) => ({
      type: "chunk",
      documentId: `doc-${i % 20}`,
      content: `Chunk body ${i} `.repeat(30),
      metadata: { chunkIndex: i % 40 },
      tokenCount: 120,
      embedding: Array.from({ length: 32 }, (_, j) => Math.sin(i + j)),
    }));
    const t0 = Date.now();
    const result = compressItems(items, { level: 4, itemMaxTokens: 60 });
    const ms = Date.now() - t0;
    assert.ok(result.outputTokens <= result.inputTokens);
    assert.ok(ms < 1500, `compression took ${ms}ms`);
  });

  it("packs large section set within budget", () => {
    const budget = allocateBudget({ tokenBudget: 4000, modelLimit: 128000 });
    const sections = Array.from({ length: 100 }, (_, i) => ({
      label: `sec-${i}`,
      text: "word ".repeat(200),
      slot: i % 2 ? "retrieved" : "conversation",
      priority: Math.random() * 10,
      source: "documents",
    }));
    const packed = fitToAllocation(sections, budget.allocation, budget.packBudget);
    assert.ok(packed.usedTokens <= budget.packBudget);
    assert.ok(packed.sections.length > 0);
    assert.ok(packed.dropped.length > 0);
  });
});

describe("project intelligence (no db)", () => {
  it("returns empty without projectId", async () => {
    const result = await analyzeProject(null, "test");
    assert.deepEqual(result.items, []);
  });
});
