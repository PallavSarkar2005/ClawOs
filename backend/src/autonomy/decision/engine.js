/**
 * Decision Engine — every autonomous choice carries reasoning,
 * alternatives, confidence, risks, tradeoffs, and evidence.
 */

const prisma = require("../../database/prisma");
const { STREAM_EVENTS } = require("../constants");

function clampConfidence(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0.5;
  return Math.max(0, Math.min(1, v));
}

async function recordDecision(input = {}, emit) {
  const data = {
    goalId: input.goalId || null,
    taskId: input.taskId || null,
    sessionId: input.sessionId || null,
    userId: input.userId || null,
    kind: String(input.kind || "general"),
    summary: String(input.summary || "").slice(0, 2000),
    reasoning: String(input.reasoning || "").slice(0, 8000),
    alternatives: Array.isArray(input.alternatives) ? input.alternatives : [],
    confidence: clampConfidence(input.confidence),
    risks: Array.isArray(input.risks) ? input.risks : [],
    tradeoffs: Array.isArray(input.tradeoffs) ? input.tradeoffs : [],
    evidence: Array.isArray(input.evidence) ? input.evidence : [],
    choice: input.choice != null ? String(input.choice).slice(0, 2000) : null,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  const row = await prisma.decision.create({ data });

  emit?.(STREAM_EVENTS.DECISION_RECORDED, {
    decisionId: row.id,
    kind: row.kind,
    summary: row.summary,
    confidence: row.confidence,
    choice: row.choice,
  });

  return row;
}

function decideSync(options = {}) {
  const {
    kind = "general",
    summary = "",
    alternatives = [],
    scoring = null,
    defaultChoice = null,
    minConfidence = 0.4,
  } = options;

  let choice = defaultChoice;
  let confidence = 0.5;
  let reasoning = summary;
  const risks = [];
  const tradeoffs = [];
  const evidence = [];

  if (Array.isArray(alternatives) && alternatives.length) {
    const scored = alternatives.map((alt, idx) => {
      const base = typeof scoring === "function" ? scoring(alt, idx) : alt.score ?? 0.5;
      return {
        ...alt,
        score: Number.isFinite(base) ? base : 0.5,
      };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    const second = scored[1];
    choice = best.id || best.name || best.value || best.label || String(best);
    confidence = clampConfidence(best.score);
    if (second) {
      confidence = clampConfidence(best.score - (second.score * 0.15));
      tradeoffs.push({
        chosen: choice,
        rejected: second.id || second.name || second.value,
        margin: best.score - second.score,
      });
    }
    reasoning = [
      summary,
      `Selected "${choice}" with score ${best.score.toFixed(2)}.`,
      best.reason || "",
      second ? `Next best was "${second.id || second.name}" (${second.score.toFixed(2)}).` : "",
    ]
      .filter(Boolean)
      .join(" ");
    evidence.push(...scored.map((s) => ({ alternative: s.id || s.name, score: s.score })));
    for (const alt of scored) {
      if (Array.isArray(alt.risks)) risks.push(...alt.risks);
    }
  }

  if (confidence < minConfidence) {
    risks.push({
      level: "medium",
      message: `Confidence ${confidence.toFixed(2)} below threshold ${minConfidence}`,
    });
  }

  return {
    kind,
    summary,
    reasoning,
    alternatives,
    confidence,
    risks,
    tradeoffs,
    evidence,
    choice,
  };
}

async function decide(input = {}, emit) {
  const draft = decideSync(input);
  return recordDecision({ ...input, ...draft }, emit);
}

async function listDecisions(filters = {}) {
  const where = {};
  if (filters.userId) where.userId = filters.userId;
  if (filters.goalId) where.goalId = filters.goalId;
  if (filters.sessionId) where.sessionId = filters.sessionId;
  if (filters.taskId) where.taskId = filters.taskId;
  if (filters.kind) where.kind = filters.kind;
  return prisma.decision.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 500),
  });
}

module.exports = {
  recordDecision,
  decideSync,
  decide,
  listDecisions,
  clampConfidence,
};
