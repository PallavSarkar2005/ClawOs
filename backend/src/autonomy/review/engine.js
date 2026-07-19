/**
 * Automatic code review — architecture, performance, security,
 * readability, best practices, maintainability, complexity.
 */

const { chat } = require("../../runtime/llm.client");
const { extractJson } = require("../../runtime/planner");
const { getAgent } = require("../agents/registry");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS, STREAM_EVENTS } = require("../constants");
const prisma = require("../../database/prisma");
const { learnFromReview } = require("../learning/store");

async function reviewCode(input, ctx) {
  const subject = String(input.content || input.diff || input.description || "").slice(0, 20000);

  let scores = null;
  try {
    const response = await chat({
      messages: [
        {
          role: "system",
          content: `You are a strict senior code reviewer. Score each dimension 0-1.
Return ONLY JSON:
{
  "score": 0.0,
  "architecture": 0.0,
  "performance": 0.0,
  "security": 0.0,
  "readability": 0.0,
  "maintainability": 0.0,
  "complexity": 0.0,
  "bestPractices": 0.0,
  "criticalIssues": 0,
  "comments": [{"severity":"high|medium|low","file":"...","message":"..."}],
  "fixes": [{"file":"...","action":"..."}],
  "summary": "..."
}`,
        },
        {
          role: "user",
          content: `GOAL:\n${ctx.goalDescription || ""}\n\nCODE / DIFF / ARTIFACT:\n${subject}`,
        },
      ],
      settings: ctx.settings || {},
      temperature: 0.15,
      maxTokens: 3072,
      signal: ctx.signal,
    });
    scores = extractJson(response.content);
  } catch {
    /* agent fallback */
  }

  if (!scores) {
    const reviewer = getAgent("reviewer");
    const out = await reviewer.run(
      {
        id: `review_${Date.now()}`,
        description: `Review this work and produce scores.\n\n${subject.slice(0, 12000)}`,
        expectedOutputs: ["review"],
      },
      ctx,
    );
    scores = extractJson(out.content) || {
      score: 0.6,
      architecture: 0.6,
      performance: 0.6,
      security: 0.6,
      readability: 0.6,
      maintainability: 0.6,
      complexity: 0.5,
      criticalIssues: 0,
      comments: [{ severity: "medium", message: out.content?.slice(0, 500) }],
      fixes: [],
      summary: out.content?.slice(0, 1000) || "Review completed",
    };
  }

  const normalized = {
    status: (scores.criticalIssues || 0) > 0 || (scores.score || 0) < 0.7 ? "needs_work" : "passed",
    score: Number(scores.score) || 0,
    architecture: Number(scores.architecture) || null,
    performance: Number(scores.performance) || null,
    security: Number(scores.security) || null,
    readability: Number(scores.readability) || null,
    maintainability: Number(scores.maintainability) || null,
    complexity: Number(scores.complexity) || null,
    comments: Array.isArray(scores.comments) ? scores.comments : [],
    fixes: Array.isArray(scores.fixes) ? scores.fixes : [],
    criticalIssues: Number(scores.criticalIssues) || 0,
    summary: String(scores.summary || "").slice(0, 4000),
  };

  const row = await prisma.reviewResult.create({
    data: {
      taskId: input.taskId || null,
      sessionId: ctx.sessionId || null,
      ...normalized,
      metadata: { bestPractices: scores.bestPractices },
    },
  });

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      taskId: input.taskId,
      kind: ARTIFACT_KINDS.REVIEW,
      name: `review-${row.id}.json`,
      contentJson: normalized,
    },
    ctx.emit,
  );

  ctx.emit?.(STREAM_EVENTS.REVIEW_RESULT, {
    reviewId: row.id,
    score: row.score,
    status: row.status,
    criticalIssues: row.criticalIssues,
  });

  if (ctx.userId) {
    await learnFromReview(ctx.userId, ctx.projectId, normalized);
  }

  return { ...normalized, id: row.id };
}

async function applyReviewFixes(review, ctx) {
  if (!review?.fixes?.length) return null;
  const engineer = getAgent("backend_engineer");
  const task = {
    id: `review_fix_${Date.now()}`,
    description: `Apply these review fixes carefully.\n\nFIXES:\n${JSON.stringify(review.fixes, null, 2)}\n\nCOMMENTS:\n${JSON.stringify(review.comments, null, 2)}`,
    expectedOutputs: ["fixes"],
  };
  return engineer.run(task, ctx);
}

module.exports = {
  reviewCode,
  applyReviewFixes,
};
