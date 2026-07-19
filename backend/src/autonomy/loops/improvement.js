/**
 * Self-improvement loop:
 * Plan → Implement → Build → Test → Analyze → Fix → Repeat
 * Stop when build+tests pass and quality threshold reached.
 */

const prisma = require("../../database/prisma");
const { runCommand } = require("../debug/autodebug");
const { debugAndFix } = require("../debug/autodebug");
const { runTests, generateTests } = require("../testing/generator");
const { reviewCode, applyReviewFixes } = require("../review/engine");
const { evaluateSession } = require("../quality/gates");
const { recordBuild } = require("../execution/runner");
const { learnFromCycle } = require("../learning/store");
const { analyzeArchitecture } = require("../architecture/evolve");
const {
  MAX_IMPROVEMENT_CYCLES,
  STREAM_EVENTS,
  ARTIFACT_KINDS,
} = require("../constants");
const { createArtifact } = require("../artifacts/manager");
const { gateOrExecute } = require("../approval/gate");

function detectBuildCommand(meta = {}) {
  if (meta.buildCommand) return meta.buildCommand;
  return "npm run build";
}

async function runBuild(ctx) {
  const cmd = detectBuildCommand(ctx.projectMeta);
  const gated = await gateOrExecute(
    ctx,
    cmd,
    `Run build: ${cmd}`,
    { command: cmd },
    () => runCommand(cmd, { cwd: ctx.cwd, timeoutMs: 300_000 }),
  );
  if (gated?.pendingApproval) return { pendingApproval: true, approval: gated.approval };
  return recordBuild(ctx, gated);
}

async function runImprovementLoop(ctx, { initialOutputs = [] } = {}) {
  const cycles = [];
  let lastBuild = null;
  let lastTest = null;
  let lastReview = null;
  let architectureViolations = [];

  for (let n = 1; n <= (ctx.maxCycles || MAX_IMPROVEMENT_CYCLES); n += 1) {
    if (ctx.cancelRequested?.() || ctx.signal?.aborted) {
      throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
    }

    const cycle = await prisma.improvementCycle.create({
      data: {
        sessionId: ctx.sessionId,
        planId: ctx.planId || null,
        cycleNumber: n,
        phase: "implement",
        status: "running",
      },
    });

    ctx.emit?.(STREAM_EVENTS.CYCLE_STARTED, { cycleNumber: n, cycleId: cycle.id });

    // Generate tests on first cycle or after code changes
    if (n === 1 || ctx.regenerateTests) {
      try {
        await generateTests(
          {
            target: ctx.goalDescription,
            codeContext: initialOutputs.map((o) => o.content).join("\n\n").slice(0, 10000),
          },
          ctx,
        );
      } catch (err) {
        ctx.emit?.(STREAM_EVENTS.LOG, {
          level: "warn",
          message: `Test generation warning: ${err.message}`,
        });
      }
    }

    // Build
    await prisma.improvementCycle.update({
      where: { id: cycle.id },
      data: { phase: "build" },
    });
    lastBuild = await runBuild(ctx);
    if (lastBuild.pendingApproval) {
      await prisma.improvementCycle.update({
        where: { id: cycle.id },
        data: { status: "waiting_approval", analysis: "Build requires approval" },
      });
      return {
        stopped: "approval",
        approval: lastBuild.approval,
        cycles,
        build: lastBuild,
        tests: lastTest,
        review: lastReview,
      };
    }

    // Test
    await prisma.improvementCycle.update({
      where: { id: cycle.id },
      data: { phase: "test", buildOk: lastBuild.status === "passed" },
    });
    lastTest = await runTests(ctx);
    if (lastTest.pendingApproval) {
      return {
        stopped: "approval",
        approval: lastTest.approval,
        cycles,
        build: lastBuild,
        tests: lastTest,
        review: lastReview,
      };
    }

    // Review
    await prisma.improvementCycle.update({
      where: { id: cycle.id },
      data: { phase: "review", testsOk: lastTest.status === "passed" },
    });
    const reviewSubject =
      initialOutputs.map((o) => o.content).join("\n\n").slice(0, 15000) ||
      ctx.goalDescription;
    lastReview = await reviewCode({ content: reviewSubject }, ctx);

    // Architecture spot-check periodically
    if (n === 1 || n === MAX_IMPROVEMENT_CYCLES) {
      try {
        const arch = await analyzeArchitecture(ctx, reviewSubject);
        architectureViolations = arch.violations || [];
      } catch {
        architectureViolations = [];
      }
    }

    const gate = evaluateSession({
      build: lastBuild,
      tests: lastTest,
      review: lastReview,
      architectureViolations,
    });

    const fixes = [];
    if (!gate.ok) {
      await prisma.improvementCycle.update({
        where: { id: cycle.id },
        data: { phase: "fix" },
      });

      // Analyze + fix build/test failures
      if (!gate.gates.build.ok || !gate.gates.tests.ok) {
        const failureText = [
          lastBuild?.stderr,
          lastBuild?.stdout,
          lastTest?.report,
          lastTest?.stderr,
        ]
          .filter(Boolean)
          .join("\n");
        const debugResult = await debugAndFix(failureText, ctx, {
          verifyCommand: !gate.gates.build.ok
            ? detectBuildCommand(ctx.projectMeta)
            : undefined,
          cwd: ctx.cwd,
          maxAttempts: 2,
        });
        fixes.push({ type: "debug", result: { fixed: debugResult.fixed, attempt: debugResult.attempt } });
        if (debugResult.pendingApproval) {
          return {
            stopped: "approval",
            approval: debugResult.approval,
            cycles,
            build: lastBuild,
            tests: lastTest,
            review: lastReview,
            quality: gate,
          };
        }
      }

      if (!gate.gates.review.ok && lastReview.fixes?.length) {
        const applied = await applyReviewFixes(lastReview, ctx);
        fixes.push({ type: "review_fixes", applied: Boolean(applied) });
      }
    }

    const finished = await prisma.improvementCycle.update({
      where: { id: cycle.id },
      data: {
        status: gate.ok ? "passed" : "failed",
        buildOk: gate.gates.build.ok,
        testsOk: gate.gates.tests.ok,
        reviewOk: gate.gates.review.ok,
        qualityScore: gate.score,
        analysis: gate.summary,
        fixes,
        finishedAt: new Date(),
        durationMs: Date.now() - new Date(cycle.startedAt).getTime(),
        phase: "done",
      },
    });

    cycles.push(finished);
    await learnFromCycle({ id: ctx.sessionId, projectId: ctx.projectId }, finished, ctx.userId);

    await createArtifact(
      {
        sessionId: ctx.sessionId,
        goalId: ctx.goalId,
        kind: ARTIFACT_KINDS.TEST_REPORT,
        name: `cycle-${n}-summary.json`,
        contentJson: {
          gate,
          buildId: lastBuild?.id,
          testId: lastTest?.id,
          reviewId: lastReview?.id,
        },
      },
      ctx.emit,
    );

    ctx.emit?.(STREAM_EVENTS.CYCLE_COMPLETED, {
      cycleNumber: n,
      ok: gate.ok,
      score: gate.score,
      summary: gate.summary,
    });

    if (gate.ok) {
      return {
        stopped: "quality_met",
        cycles,
        build: lastBuild,
        tests: lastTest,
        review: lastReview,
        quality: gate,
        architectureViolations,
      };
    }
  }

  const finalGate = evaluateSession({
    build: lastBuild,
    tests: lastTest,
    review: lastReview,
    architectureViolations,
  });

  return {
    stopped: "max_cycles",
    cycles,
    build: lastBuild,
    tests: lastTest,
    review: lastReview,
    quality: finalGate,
    architectureViolations,
  };
}

module.exports = {
  runImprovementLoop,
  runBuild,
  detectBuildCommand,
};
