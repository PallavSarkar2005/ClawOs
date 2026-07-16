const embeddingService = require("./embedding.service");
const knowledgeRetrieval = require("../../knowledge/retrieval/engine");
const { cosineSimilarity, contentHash } = require("../utils");

function dedupeByContent(items, keyFn = (i) => i.content) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = contentHash(String(keyFn(item) || "").slice(0, 500));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Maximal Marginal Relevance */
function mmrSelect(candidates, queryVec, { lambda = 0.7, topK = 8 } = {}) {
  const selected = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const c = remaining[i];
      const rel = c.semanticScore ?? cosineSimilarity(queryVec, c.embedding || []);
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosineSimilarity(c.embedding || [], s.embedding || []);
        if (sim > maxSim) maxSim = sim;
      }
      const score = lambda * rel - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}

class RetrievalEngine {
  async semanticSearch(userId, query, opts = {}) {
    return knowledgeRetrieval.semanticSearch(userId, query, opts);
  }

  async keywordSearch(userId, query, opts = {}) {
    return knowledgeRetrieval.keywordSearch(userId, query, opts);
  }

  async hybridSearch(userId, query, opts = {}) {
    return knowledgeRetrieval.hybridSearch(userId, query, opts);
  }
}

module.exports = new RetrievalEngine();
module.exports.mmrSelect = mmrSelect;
module.exports.dedupeByContent = dedupeByContent;
