const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { toPgVector, fromPgVector, distanceToSimilarity, distanceOperator, indexForCount } = require("../vector/format");
const { mmrSelect, dedupeByContent, crossEncoderRerank } = require("../retrieval/engine");
const { precisionAtK, recallAtK, mrr, ndcgAtK } = require("../evaluation/metrics");
const semanticChunker = require("../chunking/engine");
const { EDGE_TYPES, NODE_TYPES } = require("../graph/engine");

describe("pgvector format", () => {
  it("converts arrays to pgvector literal", () => {
    const v = toPgVector([1, 0, 0]);
    assert.equal(v, "[1,0,0]");
    assert.deepEqual(fromPgVector(v), [1, 0, 0]);
  });

  it("maps cosine distance to similarity", () => {
    assert.ok(distanceToSimilarity(0, "cosine") > 0.99);
    assert.ok(distanceToSimilarity(1, "cosine") < 0.01);
  });

  it("selects distance operators", () => {
    assert.equal(distanceOperator("cosine"), "<=>");
    assert.equal(distanceOperator("l2"), "<->");
    assert.equal(distanceOperator("dot"), "<#>");
  });

  it("recommends index by count", () => {
    assert.equal(indexForCount(100), "sequential");
    assert.equal(indexForCount(5000), "hnsw");
  });
});

describe("knowledge retrieval helpers", () => {
  it("dedupes by content hash", () => {
    const out = dedupeByContent([{ content: "a" }, { content: "a" }, { content: "b" }]);
    assert.equal(out.length, 2);
  });

  it("reranks with lexical overlap", () => {
    const ranked = crossEncoderRerank(
      [
        { content: "unrelated topic", semanticScore: 0.55 },
        { content: "react login form", semanticScore: 0.5 },
      ],
      "react login",
    );
    assert.ok(ranked[0].content.includes("react"));
  });

  it("mmr promotes diversity", () => {
    const q = [1, 0];
    const candidates = [
      { id: "a", semanticScore: 0.9, embedding: [1, 0] },
      { id: "b", semanticScore: 0.85, embedding: [0.99, 0.1] },
      { id: "c", semanticScore: 0.5, embedding: [0, 1] },
    ];
    const selected = mmrSelect(candidates, q, { topK: 2, vectors: new Map(candidates.map((c) => [c.id, c.embedding])) });
    assert.equal(selected.length, 2);
  });
});

describe("evaluation metrics", () => {
  it("computes precision and recall", () => {
    const relevant = new Set(["a", "b"]);
    const retrieved = ["a", "c", "b"];
    assert.equal(precisionAtK(relevant, retrieved, 3), 2 / 3);
    assert.equal(recallAtK(relevant, retrieved, 3), 1);
    assert.equal(mrr(relevant, retrieved), 1);
  });

  it("computes ndcg", () => {
    const relevant = new Set(["a", "b"]);
    const retrieved = ["a", "x", "b"];
    assert.ok(ndcgAtK(relevant, retrieved, 3) > 0.5);
  });
});

describe("semantic chunking", () => {
  it("chunks with adaptive sizing", () => {
    const chunks = semanticChunker.chunk("# Title\n\n" + "word ".repeat(300), { fileType: "md" });
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].metadata?.adaptiveTokens);
  });
});

describe("knowledge graph constants", () => {
  it("exports node and edge types", () => {
    assert.ok(NODE_TYPES.MEMORY);
    assert.ok(EDGE_TYPES.REFERENCES);
  });
});
