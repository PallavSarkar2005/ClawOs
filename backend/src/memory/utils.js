const crypto = require("crypto");

const MEMORY_SCOPES = Object.freeze({
  CONVERSATION: "CONVERSATION",
  USER: "USER",
  PROJECT: "PROJECT",
  WORKSPACE: "WORKSPACE",
  AGENT: "AGENT",
  WORKFLOW: "WORKFLOW",
  DOCUMENT: "DOCUMENT",
});

const AGENT_TYPES = Object.freeze({
  PLANNER: "planner",
  RESEARCH: "research",
  CODER: "coder",
  REVIEWER: "reviewer",
  TESTER: "tester",
  COORDINATOR: "coordinator",
});

const EDGE_TYPES = Object.freeze({
  PARENT: "parent",
  DERIVED_FROM: "derived_from",
  IMPLEMENTS: "implements",
  REFERENCES: "references",
  GENERATED: "generated",
  RELATED: "related",
  REQUIRES: "requires",
  FIXES: "fixes",
});

const INDEX_JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  RETRYING: "retrying",
});

const DOC_STATUS = Object.freeze({
  PENDING: "pending",
  PARSING: "parsing",
  CHUNKING: "chunking",
  EMBEDDING: "embedding",
  INDEXED: "indexed",
  FAILED: "failed",
});

function estimateTokens(text) {
  const s = String(text || "");
  if (!s) return 0;
  return Math.max(1, Math.ceil(s.length / 4));
}

function contentHash(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) return 0;
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < len; i += 1) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function normalizeVector(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return [];
  let norm = 0;
  for (const v of vec) norm += (Number(v) || 0) ** 2;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => (Number(v) || 0) / norm);
}

function keywordScore(text, query) {
  const t = String(text || "").toLowerCase();
  const words = String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((w) => w.length > 2);
  if (!words.length || !t) return 0;
  let hits = 0;
  for (const w of words) {
    if (t.includes(w)) hits += 1;
  }
  return hits / words.length;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

module.exports = {
  MEMORY_SCOPES,
  AGENT_TYPES,
  EDGE_TYPES,
  INDEX_JOB_STATUS,
  DOC_STATUS,
  estimateTokens,
  contentHash,
  cosineSimilarity,
  normalizeVector,
  keywordScore,
  clamp,
};
