const prisma = require("../../database/prisma");

function precisionAtK(relevant, retrieved, k) {
  const top = retrieved.slice(0, k);
  if (!top.length) return 0;
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / top.length;
}

function recallAtK(relevant, retrieved, k) {
  if (!relevant.size) return 0;
  const top = retrieved.slice(0, k);
  const hits = top.filter((id) => relevant.has(id)).length;
  return hits / relevant.size;
}

function mrr(relevant, retrieved) {
  for (let i = 0; i < retrieved.length; i += 1) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

function ndcgAtK(relevant, retrieved, k, gains = new Map()) {
  const top = retrieved.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < top.length; i += 1) {
    const rel = relevant.has(top[i]) ? (gains.get(top[i]) || 1) : 0;
    dcg += rel / Math.log2(i + 2);
  }

  const ideal = [...relevant].sort((a, b) => (gains.get(b) || 1) - (gains.get(a) || 1)).slice(0, k);
  let idcg = 0;
  for (let i = 0; i < ideal.length; i += 1) {
    idcg += (gains.get(ideal[i]) || 1) / Math.log2(i + 2);
  }

  return idcg > 0 ? dcg / idcg : 0;
}

async function evaluateRetrieval(ownerId, { query, relevantIds = [], retrievedIds = [], k = 10, latencyMs = 0 } = {}) {
  const relevant = new Set(relevantIds);
  const retrieved = retrievedIds;

  const metrics = {
    precision: precisionAtK(relevant, retrieved, k),
    recall: recallAtK(relevant, retrieved, k),
    mrr: mrr(relevant, retrieved),
    ndcg: ndcgAtK(relevant, retrieved, k),
    latencyMs,
    k,
    query,
  };

  return metrics;
}

module.exports = {
  precisionAtK,
  recallAtK,
  mrr,
  ndcgAtK,
  evaluateRetrieval,
};
