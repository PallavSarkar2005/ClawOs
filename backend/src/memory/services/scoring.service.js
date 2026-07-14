const { clamp } = require("../utils");

const MS_DAY = 86400000;

/**
 * Score = importance * (1 - decay) * recency * frequencyBoost * confidence
 * Pinned memories never decay.
 */
function computeDecay(memory, now = Date.now()) {
  if (memory.pinned) return 0;
  const updated = new Date(memory.updatedAt || memory.createdAt).getTime();
  const ageDays = Math.max(0, (now - updated) / MS_DAY);
  // half-life ~30 days, modulated by importance (important memories decay slower)
  const halfLife = 14 + (Number(memory.importance) || 0.5) * 46;
  const decay = 1 - Math.exp((-Math.LN2 * ageDays) / halfLife);
  return clamp(decay, 0, 0.95);
}

function computeRecency(memory, now = Date.now()) {
  const accessed = new Date(memory.lastAccessed || memory.updatedAt || memory.createdAt).getTime();
  const ageHours = Math.max(0, (now - accessed) / 3600000);
  return clamp(Math.exp(-ageHours / 168), 0.05, 1); // week half-life for recency
}

function computeFrequencyBoost(memory) {
  const freq = Number(memory.frequency) || 0;
  return clamp(1 + Math.log1p(freq) * 0.15, 1, 2);
}

function scoreMemory(memory, relevance = 0, now = Date.now()) {
  const importance = clamp(Number(memory.importance) || 0.5, 0, 1);
  const confidence = clamp(Number(memory.confidence) || 1, 0, 1);
  const decay = memory.pinned ? 0 : computeDecay(memory, now);
  const recency = computeRecency(memory, now);
  const frequency = computeFrequencyBoost(memory);
  const base = importance * (1 - decay) * recency * frequency * confidence;
  const finalScore = clamp(base * 0.45 + relevance * 0.55, 0, 1);

  return {
    score: finalScore,
    importance,
    recency,
    frequency: Number(memory.frequency) || 0,
    confidence,
    decay,
    source: memory.source || memory.scope || "unknown",
    pinned: !!memory.pinned,
    relevance,
  };
}

class ScoringService {
  score(memory, relevance = 0) {
    return scoreMemory(memory, relevance);
  }

  rank(items, getRelevance) {
    return items
      .map((item) => {
        const relevance = typeof getRelevance === "function" ? getRelevance(item) : item.relevance || 0;
        const scoring = scoreMemory(item, relevance);
        return { ...item, scoring, rankScore: scoring.score };
      })
      .sort((a, b) => b.rankScore - a.rankScore);
  }
}

module.exports = new ScoringService();
module.exports.scoreMemory = scoreMemory;
module.exports.computeDecay = computeDecay;
