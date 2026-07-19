/**
 * Architecture evolution — improve structure, deps, layering, naming, debt.
 */

const { getAgent } = require("../agents/registry");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS } = require("../constants");
const { decide } = require("../decision/engine");
const { chat } = require("../../runtime/llm.client");
const { extractJson } = require("../../runtime/planner");

async function analyzeArchitecture(ctx, codebaseSummary = "") {
  let analysis = null;
  try {
    const response = await chat({
      messages: [
        {
          role: "system",
          content: `Analyze software architecture for evolution opportunities.
Return ONLY JSON:
{
  "folderStructure": [{"issue":"...","suggestion":"...","severity":"low|medium|high"}],
  "dependencies": [...],
  "layerSeparation": [...],
  "naming": [...],
  "technicalDebt": [...],
  "refactoring": [...],
  "violations": [{"severity":"critical|error|warning","message":"..."}],
  "score": 0.0,
  "summary": "..."
}`,
        },
        {
          role: "user",
          content: `GOAL: ${ctx.goalDescription || ""}\n\nCODEBASE / DESIGN:\n${String(codebaseSummary).slice(0, 14000)}`,
        },
      ],
      settings: ctx.settings || {},
      temperature: 0.2,
      maxTokens: 3072,
      signal: ctx.signal,
    });
    analysis = extractJson(response.content);
  } catch {
    /* agent fallback */
  }

  if (!analysis) {
    const architect = getAgent("architect");
    const out = await architect.run(
      {
        id: `arch_evolve_${Date.now()}`,
        description: `Analyze architecture evolution opportunities.\n\n${String(codebaseSummary).slice(0, 10000)}`,
        expectedOutputs: ["architecture-analysis"],
      },
      ctx,
    );
    analysis = extractJson(out.content) || {
      folderStructure: [],
      dependencies: [],
      layerSeparation: [],
      naming: [],
      technicalDebt: [],
      refactoring: [],
      violations: [],
      score: 0.65,
      summary: out.content?.slice(0, 2000) || "Architecture analyzed",
    };
  }

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: ARTIFACT_KINDS.DESIGN,
      name: `architecture-evolution-${Date.now()}.json`,
      contentJson: analysis,
    },
    ctx.emit,
  );

  await decide(
    {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: "architecture_evolution",
      summary: analysis.summary || "Architecture analyzed",
      reasoning: JSON.stringify({
        debt: analysis.technicalDebt?.length,
        refactors: analysis.refactoring?.length,
        violations: analysis.violations?.length,
      }),
      alternatives: (analysis.refactoring || []).slice(0, 5).map((r, i) => ({
        id: `refactor_${i}`,
        score: 0.6,
        reason: r.suggestion || r.issue || JSON.stringify(r),
      })),
      confidence: Number(analysis.score) || 0.6,
      risks: (analysis.violations || []).map((v) => ({
        level: v.severity || "medium",
        message: v.message,
      })),
      tradeoffs: [],
      evidence: analysis.technicalDebt || [],
      choice: "track_and_improve",
    },
    ctx.emit,
  );

  return analysis;
}

async function applySafeRefactors(analysis, ctx) {
  const items = [
    ...(analysis.naming || []),
    ...(analysis.folderStructure || []),
    ...(analysis.refactoring || []),
  ].filter((i) => (i.severity || "low") !== "critical");

  if (!items.length) return null;

  const engineer = getAgent("backend_engineer");
  return engineer.run(
    {
      id: `arch_refactor_${Date.now()}`,
      description: [
        "Apply safe, incremental architecture improvements. Avoid large risky rewrites.",
        "If a change is a large refactor (>25 files), stop and mark it for approval.",
        `IMPROVEMENTS:\n${JSON.stringify(items.slice(0, 15), null, 2)}`,
      ].join("\n\n"),
      expectedOutputs: ["refactors"],
    },
    ctx,
  );
}

module.exports = {
  analyzeArchitecture,
  applySafeRefactors,
};
