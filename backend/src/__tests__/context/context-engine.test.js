/**
 * Context Engine unit tests — ranking, compression, budget, retrieval shaping.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { allocateBudget, fitToAllocation, resolveModelLimit } = require("../../context/budget");
const { scoreItem, rankItems } = require("../../context/ranking");
const {
  removeDuplicates,
  semanticDedup,
  mergeChunks,
  summarizeText,
  summarizeCode,
  compressItems,
  compressConversation,
} = require("../../context/compression");
const { ContextCache } = require("../../context/cache");
const { AGENT_PROFILES, MODEL_LIMITS } = require("../../context/constants");

describe("context budget", () => {
  it("never exceeds model limit", () => {
    const b = allocateBudget({ model: "gpt-4o", tokenBudget: 500000 });
    assert.ok(b.packBudget <= b.modelLimit);
    assert.ok(b.packBudget <= b.usable);
    const sum = Object.values(b.allocation).reduce((a, v) => a + v, 0);
    assert.ok(sum <= b.packBudget + 1);
  });

  it("resolves known model limits", () => {
    assert.equal(resolveModelLimit("gpt-4o"), MODEL_LIMITS["gpt-4o"]);
    assert.equal(resolveModelLimit("unknown-model"), MODEL_LIMITS.default);
  });

  it("fits sections and drops overflow", () => {
    const allocation = { retrieved: 100, conversation: 50, system: 20, tools: 20, response: 20, planner: 10 };
    const sections = [
      { label: "a", text: "x".repeat(800), slot: "retrieved", priority: 10 },
      { label: "b", text: "y".repeat(800), slot: "retrieved", priority: 1 },
    ];
    const packed = fitToAllocation(sections, allocation, 100);
    assert.ok(packed.usedTokens <= 100);
    assert.ok(packed.sections.length >= 1);
  });
});

describe("context ranking", () => {
  it("scores pinned + similar items higher", () => {
    const low = scoreItem({
      source: "documents",
      similarity: 0.2,
      importance: 0.2,
      pinned: false,
    }, { agentType: "coder" });
    const high = scoreItem({
      source: "project_files",
      similarity: 0.9,
      importance: 0.9,
      pinned: true,
      agentMatch: true,
    }, { agentType: "coder" });
    assert.ok(high.score > low.score);
    assert.ok(high.reason);
  });

  it("applies agent-specific source weights", () => {
    const docForResearch = scoreItem(
      { source: "documents", similarity: 0.7, importance: 0.5 },
      { agentType: "research" },
    );
    const docForCoder = scoreItem(
      { source: "documents", similarity: 0.7, importance: 0.5 },
      { agentType: "coder" },
    );
    assert.ok(docForResearch.factors.agentRelevance >= docForCoder.factors.agentRelevance);
  });

  it("rankItems sorts descending", () => {
    const ranked = rankItems([
      { source: "conversation", similarity: 0.2 },
      { source: "project_files", similarity: 0.9, pinned: true },
      { source: "documents", similarity: 0.5 },
    ], { agentType: "coder" });
    assert.equal(ranked.length, 3);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.ok(ranked[1].score >= ranked[2].score);
  });

  it("has profiles for all core agents", () => {
    for (const a of ["planner", "research", "architect", "coder", "tester", "reviewer"]) {
      assert.ok(AGENT_PROFILES[a]);
      assert.ok(AGENT_PROFILES[a].focus);
    }
  });
});

describe("context compression", () => {
  it("removes exact duplicates", () => {
    const { items, removed } = removeDuplicates([
      { content: "hello world" },
      { content: "hello world" },
      { content: "unique" },
    ]);
    assert.equal(items.length, 2);
    assert.equal(removed, 1);
  });

  it("semantic dedup removes near-identical embeddings", () => {
    const emb = Array.from({ length: 8 }, (_, i) => i + 1);
    const { items, removed } = semanticDedup([
      { content: "a", embedding: emb },
      { content: "b", embedding: emb.map((x) => x * 1.001) },
      { content: "c", embedding: emb.map((x) => -x) },
    ], { threshold: 0.99 });
    assert.ok(removed >= 1);
    assert.ok(items.length >= 2);
  });

  it("merges adjacent chunks", () => {
    const { items, mergeCount } = mergeChunks([
      { type: "chunk", documentId: "d1", content: "part1", metadata: { chunkIndex: 0 }, score: 0.5 },
      { type: "chunk", documentId: "d1", content: "part2", metadata: { chunkIndex: 1 }, score: 0.6 },
      { type: "memory", content: "other" },
    ]);
    assert.ok(mergeCount >= 1);
    assert.ok(items.some((i) => String(i.content).includes("part1") && String(i.content).includes("part2")));
  });

  it("summarizes long text under budget", () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} about context management.`).join(" ");
    const result = summarizeText(long, 80);
    assert.ok(result.summaryTokens <= 80);
    assert.ok(result.originalTokens > result.summaryTokens);
  });

  it("summarizes code keeping signatures", () => {
    const code = `
import fs from "fs";
export function buildContext(userId, query) {
  const x = 1;
  return x;
}
export class Engine {
  run() {}
}
${"const noise = 1;\n".repeat(80)}
`;
    const result = summarizeCode(code, 100);
    assert.ok(result.summary.includes("buildContext") || result.summary.includes("Engine"));
    assert.ok(result.summaryTokens <= result.originalTokens);
  });

  it("progressive compressItems reduces tokens", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      content: `duplicate content block ${i % 3} `.repeat(50),
      type: i % 2 === 0 ? "chunk" : "memory",
      documentId: "doc",
      metadata: { chunkIndex: i },
      tokenCount: 200,
    }));
    const result = compressItems(items, { level: 4, itemMaxTokens: 80 });
    assert.ok(result.ratio <= 1);
    assert.ok(result.outputTokens <= result.inputTokens);
    assert.ok(result.history.length >= 1);
  });

  it("compresses conversation messages", () => {
    const msgs = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 ? "assistant" : "user",
      content: `Turn ${i}: discussing the architecture of the context manager in detail.`,
    }));
    const result = compressConversation(msgs, 60);
    assert.ok(result.summaryTokens <= 60);
  });
});

describe("context cache", () => {
  it("stores and retrieves with TTL", () => {
    const c = new ContextCache({ ttlMs: 10_000 });
    c.set(["u1", "q"], { ok: true });
    assert.deepEqual(c.get(["u1", "q"]), { ok: true });
    c.invalidate({ userId: "u1" });
    assert.equal(c.get(["u1", "q"]), null);
  });
});
