/**
 * Learning store — reuse successful strategies, past fixes, conventions.
 */

const prisma = require("../../database/prisma");

async function recordLearning(input = {}) {
  return prisma.autonomyLearning.create({
    data: {
      userId: input.userId,
      projectId: input.projectId || null,
      kind: String(input.kind || "strategy"),
      pattern: String(input.pattern || "").slice(0, 2000),
      strategy: String(input.strategy || "").slice(0, 4000),
      success: input.success !== false,
      confidence: Number.isFinite(input.confidence) ? input.confidence : 0.5,
      context: input.context && typeof input.context === "object" ? input.context : {},
      evidence: Array.isArray(input.evidence) ? input.evidence : [],
    },
  });
}

async function findRelevant(userId, { projectId, kind, pattern, limit = 10 } = {}) {
  const where = {
    userId,
    success: true,
  };
  if (projectId) where.projectId = projectId;
  if (kind) where.kind = kind;
  if (pattern) {
    where.OR = [
      { pattern: { contains: String(pattern).slice(0, 200), mode: "insensitive" } },
      { strategy: { contains: String(pattern).slice(0, 200), mode: "insensitive" } },
    ];
  }

  const rows = await prisma.autonomyLearning.findMany({
    where,
    orderBy: [{ confidence: "desc" }, { reuseCount: "desc" }, { updatedAt: "desc" }],
    take: Math.min(limit, 50),
  });
  return rows;
}

async function markReused(id) {
  return prisma.autonomyLearning.update({
    where: { id },
    data: {
      reuseCount: { increment: 1 },
      confidence: { increment: 0.02 },
    },
  }).catch(() => null);
}

async function learnFromCycle(session, cycle, userId) {
  if (!cycle || !userId) return null;
  const success = cycle.buildOk && cycle.testsOk;
  return recordLearning({
    userId,
    projectId: session.projectId,
    kind: "improvement_cycle",
    pattern: `phase:${cycle.phase}|cycle:${cycle.cycleNumber}`,
    strategy: cycle.analysis || (success ? "build+test passed after fixes" : "cycle incomplete"),
    success,
    confidence: success ? 0.75 : 0.35,
    context: {
      sessionId: session.id,
      cycleId: cycle.id,
      qualityScore: cycle.qualityScore,
      fixes: cycle.fixes,
    },
    evidence: [
      { buildOk: cycle.buildOk },
      { testsOk: cycle.testsOk },
      { reviewOk: cycle.reviewOk },
    ],
  });
}

async function learnFromReview(userId, projectId, review) {
  if (!review) return null;
  return recordLearning({
    userId,
    projectId,
    kind: "review_feedback",
    pattern: `score:${review.score}|critical:${review.criticalIssues}`,
    strategy: review.summary || "review completed",
    success: review.score >= 0.7 && review.criticalIssues === 0,
    confidence: Math.min(0.9, Math.max(0.3, review.score || 0.5)),
    context: {
      comments: (review.comments || []).slice(0, 20),
      fixes: (review.fixes || []).slice(0, 20),
    },
    evidence: [{ score: review.score, security: review.security }],
  });
}

function formatLearningsForPrompt(learnings = []) {
  if (!learnings.length) return "(no prior learnings)";
  return learnings
    .map(
      (l, i) =>
        `${i + 1}. [${l.kind}] ${l.pattern}\n   Strategy: ${l.strategy}\n   Confidence: ${l.confidence}`,
    )
    .join("\n");
}

module.exports = {
  recordLearning,
  findRelevant,
  markReused,
  learnFromCycle,
  learnFromReview,
  formatLearningsForPrompt,
};
