const DEFAULT_DIM = 1536;

function toPgVector(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const nums = arr.map((v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  });
  return `[${nums.join(",")}]`;
}

function fromPgVector(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(Number);
  const s = String(raw).trim();
  if (s.startsWith("[") && s.endsWith("]")) {
    return s
      .slice(1, -1)
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return [];
}

function distanceToSimilarity(distance, metric = "cosine") {
  const d = Number(distance) || 0;
  switch (metric) {
    case "cosine":
      return Math.max(0, 1 - d);
    case "l2":
      return 1 / (1 + d);
    case "dot":
      return Math.max(0, -d);
    default:
      return Math.max(0, 1 - d);
  }
}

function distanceOperator(metric = "cosine") {
  switch (metric) {
    case "l2":
      return "<->";
    case "dot":
      return "<#>";
    case "cosine":
    default:
      return "<=>";
  }
}

function indexForCount(count, metric = "cosine") {
  if (count < 1000) return "sequential";
  if (count < 50000) return metric === "dot" ? "ivfflat" : "hnsw";
  return "hnsw";
}

module.exports = {
  DEFAULT_DIM,
  toPgVector,
  fromPgVector,
  distanceToSimilarity,
  distanceOperator,
  indexForCount,
};
