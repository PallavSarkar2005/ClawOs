const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const chunking = require("../services/chunking.service");
const scoring = require("../services/scoring.service");
const citation = require("../services/citation.engine");
const { cosineSimilarity, contentHash, estimateTokens, keywordScore } = require("../utils");
const { localHashEmbedding } = require("../services/embedding.service");
const { mmrSelect, dedupeByContent } = require("../services/retrieval.engine");

describe("utils", () => {
  it("estimates tokens", () => {
    assert.equal(estimateTokens("abcd"), 1);
    assert.ok(estimateTokens("a".repeat(40)) >= 10);
  });

  it("hashes content stably", () => {
    assert.equal(contentHash("hello"), contentHash("hello"));
    assert.notEqual(contentHash("hello"), contentHash("world"));
  });

  it("computes cosine similarity", () => {
    assert.ok(cosineSimilarity([1, 0], [1, 0]) > 0.99);
    assert.ok(cosineSimilarity([1, 0], [0, 1]) < 0.01);
  });

  it("scores keywords", () => {
    assert.ok(keywordScore("I love React hooks", "react hooks") > 0.5);
  });
});

describe("chunking", () => {
  it("creates heading-aware markdown chunks", () => {
    const md = `# Title\n\nPara one about things.\n\n## Section\n\n${"word ".repeat(200)}\n\n## Other\n\nMore text here.`;
    const chunks = chunking.chunk(md, { fileType: "md" });
    assert.ok(chunks.length >= 2);
    assert.ok(chunks.every((c) => c.chunkIndex >= 0 && c.tokenCount > 0 && c.contentHash));
  });

  it("creates code-aware chunks", () => {
    const code = `function a() {\n  return 1;\n}\n\nfunction b() {\n  ${"x++;\n".repeat(80)}\n}\n`;
    const chunks = chunking.chunk(code, { fileType: "js" });
    assert.ok(chunks.length >= 1);
    assert.equal(chunks[0].chunkType, "code");
  });

  it("chunks csv with header carried", () => {
    const csv = `name,age\n${Array.from({ length: 50 }, (_, i) => `u${i},${i}`).join("\n")}`;
    const chunks = chunking.chunk(csv, { fileType: "csv", targetTokens: 80 });
    assert.ok(chunks.length >= 1);
    assert.ok(chunks[0].content.startsWith("name,age"));
  });
});

describe("scoring", () => {
  it("pinned memories have zero decay", () => {
    const s = scoring.score({
      pinned: true,
      importance: 0.9,
      confidence: 1,
      frequency: 2,
      updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
      lastAccessed: new Date(),
    });
    assert.equal(s.decay, 0);
  });

  it("ranks by composite score", () => {
    const ranked = scoring.rank(
      [
        { id: 1, importance: 0.2, confidence: 1, frequency: 0, updatedAt: new Date(), lastAccessed: new Date() },
        { id: 2, importance: 0.9, confidence: 1, frequency: 5, pinned: true, updatedAt: new Date(), lastAccessed: new Date() },
      ],
      () => 0.5,
    );
    assert.equal(ranked[0].id, 2);
  });
});

describe("embeddings local", () => {
  it("produces normalized vectors", () => {
    const v = localHashEmbedding("ClawOS memory engine");
    assert.equal(v.length, 1536);
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0));
    assert.ok(Math.abs(norm - 1) < 0.02);
  });
});

describe("retrieval helpers", () => {
  it("dedupes by content", () => {
    const out = dedupeByContent([
      { content: "same" },
      { content: "same" },
      { content: "other" },
    ]);
    assert.equal(out.length, 2);
  });

  it("mmr selects diverse items", () => {
    const q = [1, 0, 0];
    const candidates = [
      { id: 1, embedding: [1, 0, 0], semanticScore: 1 },
      { id: 2, embedding: [0.99, 0.01, 0], semanticScore: 0.99 },
      { id: 3, embedding: [0, 1, 0], semanticScore: 0.5 },
    ];
    const selected = mmrSelect(candidates, q, { topK: 2, lambda: 0.5 });
    assert.equal(selected.length, 2);
    assert.ok(selected.some((s) => s.id === 3));
  });
});

describe("citations", () => {
  it("builds citation objects", () => {
    const cites = citation.fromRetrievalResults([
      {
        type: "chunk",
        id: "c1",
        documentId: "d1",
        documentName: "spec.pdf",
        content: "API requirements",
        pageStart: 2,
        lineStart: 10,
        hybridScore: 0.82,
        metadata: { chunkIndex: 3 },
      },
    ]);
    assert.equal(cites[0].document, "spec.pdf");
    assert.equal(cites[0].page, 2);
    assert.equal(cites[0].chunk, 3);
    assert.ok(cites[0].jump.chunkId);
  });

  it("annotates answers without markers", () => {
    const { answer, citations } = citation.annotateAnswer("Hello", [
      { index: 1, document: "a.md", snippet: "x", confidence: 0.9 },
    ]);
    assert.ok(answer.includes("Sources:"));
    assert.equal(citations.length, 1);
  });
});
