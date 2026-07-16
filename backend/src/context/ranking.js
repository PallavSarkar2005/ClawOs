const { RANKING_WEIGHTS, AGENT_PROFILES } = require("./constants");

function clamp(n, min = 0, max = 1) {
  return Math.min(max, Math.max(min, Number(n) || 0));
}

function recencyScore(timestamp, now = Date.now()) {
  if (!timestamp) return 0.3;
  const ageHours = Math.max(0, (now - new Date(timestamp).getTime()) / 3600000);
  return clamp(Math.exp(-ageHours / 168));
}

function frequencyScore(freq) {
  return clamp(Math.log1p(Number(freq) || 0) / Math.log1p(100));
}

/**
 * Multi-factor ranking for every context item.
 */
function scoreItem(item, ctx = {}) {
  const now = ctx.now || Date.now();
  const agentType = ctx.agentType || "coordinator";
  const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.coordinator;
  const sourceWeight = profile.sources?.[item.source] ?? 0.7;

  const similarity = clamp(item.similarity ?? item.hybridScore ?? item.semanticScore ?? 0);
  const recency = clamp(item.recency ?? recencyScore(item.timestamp || item.updatedAt || item.createdAt, now));
  const importance = clamp(item.importance ?? 0.5);
  const frequency = clamp(item.frequencyScore ?? frequencyScore(item.frequency));
  const confidence = clamp(item.confidence ?? 0.7);
  const agentRelevance = clamp((item.agentRelevance ?? sourceWeight) * (item.agentMatch ? 1.15 : 1));
  const projectRelevance = clamp(
    item.projectRelevance ?? (item.projectId && item.projectId === ctx.projectId ? 1 : 0.4),
  );
  const pinned = item.pinned ? 1 : 0;
  const collectionWeight = clamp(item.collectionWeight ?? (item.collectionId ? 0.8 : 0));
  const executionSuccess = clamp(item.executionSuccess ?? 0.5);

  const w = { ...RANKING_WEIGHTS, ...(ctx.weights || {}) };
  const finalScore = clamp(
    similarity * w.similarity +
      recency * w.recency +
      importance * w.importance +
      frequency * w.frequency +
      confidence * w.confidence +
      agentRelevance * w.agentRelevance +
      projectRelevance * w.projectRelevance +
      pinned * w.pinned +
      collectionWeight * w.collectionWeight +
      executionSuccess * w.executionSuccess,
  );

  const factors = {
    similarity,
    recency,
    importance,
    frequency,
    confidence,
    agentRelevance,
    projectRelevance,
    pinned,
    collectionWeight,
    executionSuccess,
    sourceWeight,
  };

  const topFactor = Object.entries(factors).sort((a, b) => b[1] - a[1])[0];
  const reason = item.reason
    || `Selected for ${agentType}: ${topFactor?.[0]}=${(topFactor?.[1] || 0).toFixed(2)}, source=${item.source}`;

  return {
    ...item,
    score: finalScore,
    rankScore: finalScore,
    factors,
    reason,
  };
}

function rankItems(items, ctx = {}) {
  return items
    .map((item) => scoreItem(item, ctx))
    .sort((a, b) => b.score - a.score);
}

module.exports = {
  scoreItem,
  rankItems,
  recencyScore,
  frequencyScore,
  clamp,
};
