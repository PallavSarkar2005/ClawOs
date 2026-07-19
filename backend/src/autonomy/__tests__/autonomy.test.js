const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { decomposeGoal, detectSkipPhases, PIPELINE } = require("../planner/decompose");
const {
  sanitizeMasterPlan,
  buildExecutionGraph,
  topologicalWaves,
  estimateComplexity,
  estimateCriticalPath,
  replanAfterFailure,
} = require("../planner/master");
const { evaluateSession, evaluateBuild, evaluateTests, evaluateReview } = require("../quality/gates");
const { classifyAction } = require("../approval/gate");
const { decideSync } = require("../decision/engine");
const debug = require("../debug/autodebug");
const { parseTestCounts } = require("../testing/generator");
const { createSharedMemory, writeShared, detectConflicts } = require("../agents/collaboration");
const { listAgentTypes, getAgent } = require("../agents/registry");
const { AUTONOMY_AGENTS, PHASES } = require("../constants");

describe("Phase 9 — Task Decomposition", () => {
  it("decomposes auth system into full pipeline", () => {
    const plan = decomposeGoal("Build an authentication system");
    assert.ok(plan.tasks.length >= 8);
    const titles = plan.tasks.map((t) => t.title);
    assert.ok(titles.includes("Research"));
    assert.ok(titles.includes("Architecture"));
    assert.ok(titles.includes("Database"));
    assert.ok(titles.includes("Backend"));
    assert.ok(titles.includes("Frontend"));
    assert.ok(titles.includes("Testing"));
    assert.ok(titles.includes("Security Review"));
    assert.ok(titles.includes("Verification"));

    const research = plan.tasks.find((t) => t.title === "Research");
    const arch = plan.tasks.find((t) => t.title === "Architecture");
    assert.deepEqual(research.dependsOn, []);
    assert.ok(arch.dependsOn.includes(research.id));
  });

  it("skips frontend for backend-only goals", () => {
    const skip = detectSkipPhases("Implement REST API endpoints for invoices");
    assert.ok(skip.has(PHASES.FRONTEND) || skip.has(PHASES.DEPLOYMENT));
  });

  it("pipeline covers all required phases", () => {
    const phases = PIPELINE.map((p) => p.phase);
    assert.ok(phases.includes(PHASES.RESEARCH));
    assert.ok(phases.includes(PHASES.DEPLOYMENT));
    assert.ok(phases.includes(PHASES.VERIFICATION));
  });
});

describe("Phase 9 — Master Planner", () => {
  it("sanitizes and builds execution graph", () => {
    const plan = sanitizeMasterPlan(
      {
        intent: "auth",
        milestones: [{ id: "m1", title: "Research", phase: "research" }],
        tasks: [
          {
            id: "t1",
            agent: "researcher",
            title: "Research",
            description: "research",
            dependsOn: [],
            priority: 90,
            complexity: "medium",
          },
          {
            id: "t2",
            agent: "architect",
            title: "Design",
            description: "design",
            dependsOn: ["t1"],
            priority: 80,
            complexity: "high",
          },
        ],
      },
      "Build auth",
    );
    assert.equal(plan.tasks.length, 2);
    assert.ok(plan.executionGraph.waves.length >= 2);
    assert.equal(plan.executionGraph.waves[0][0], "t1");
    assert.ok(plan.estimatedDurationMs > 0);
  });

  it("falls back to decompose when empty", () => {
    const plan = sanitizeMasterPlan({}, "Build an authentication system");
    assert.ok(plan.tasks.length > 5);
  });

  it("topological waves parallelize independents", () => {
    const tasks = [
      { id: "a", dependsOn: [], priority: 1 },
      { id: "b", dependsOn: [], priority: 2 },
      { id: "c", dependsOn: ["a", "b"], priority: 3 },
    ];
    const waves = topologicalWaves(tasks);
    assert.equal(waves[0].length, 2);
    assert.equal(waves[1].length, 1);
    assert.equal(waves[1][0].id, "c");
  });

  it("estimates complexity and critical path", () => {
    assert.equal(estimateComplexity("simple typo fix"), "low");
    assert.ok(["high", "very_high"].includes(estimateComplexity("build distributed kubernetes auth platform")));
    const tasks = [
      { id: "a", dependsOn: [], estimatedMs: 1000 },
      { id: "b", dependsOn: ["a"], estimatedMs: 2000 },
    ];
    assert.equal(estimateCriticalPath(tasks), 3000);
    const g = buildExecutionGraph(tasks);
    assert.equal(g.criticalPathMs, 3000);
  });

  it("replans after failure with remediation tasks", async () => {
    const previous = sanitizeMasterPlan({}, "Build an authentication system");
    previous.tasks[2].status = "failed";
    const next = await replanAfterFailure(
      { userId: "u1", goalDescription: "Build an authentication system", emit: () => {} },
      previous,
      { message: "build failed", failedTaskIds: [previous.tasks[2].id] },
    );
    assert.ok(next.tasks.length >= 1);
    assert.ok(next.executionGraph);
    assert.equal(next.status, "replanned");
    assert.ok(next.tasks.some((t) => String(t.id).startsWith("fix_")));
  });
});

describe("Phase 9 — Agents", () => {
  it("registers all specialist agents", () => {
    const types = listAgentTypes();
    assert.ok(types.includes(AUTONOMY_AGENTS.BACKEND));
    assert.ok(types.includes(AUTONOMY_AGENTS.FRONTEND));
    assert.ok(types.includes(AUTONOMY_AGENTS.SECURITY));
    assert.ok(types.includes(AUTONOMY_AGENTS.QA));
    assert.ok(types.includes(AUTONOMY_AGENTS.RELEASE));
    assert.ok(getAgent("backend_engineer"));
    assert.ok(getAgent("coder"));
    assert.ok(getAgent("researcher"));
  });

  it("shared memory and conflict detection work", () => {
    let mem = createSharedMemory();
    mem = writeShared(mem, { fact: { agent: "architect", summary: "use postgres" } });
    assert.equal(mem.facts.length, 1);
    const conflicts = detectConflicts([
      { agent: "a", content: "We should use postgres for storage" },
      { agent: "b", content: "We should use mongodb instead" },
    ]);
    assert.ok(conflicts.length >= 1);
  });
});

describe("Phase 9 — Quality Gates", () => {
  it("requires build, tests, review, architecture", () => {
    const fail = evaluateSession({
      build: { status: "failed", exitCode: 1 },
      tests: { status: "passed", passed: 3, failed: 0 },
      review: { score: 0.9, criticalIssues: 0, security: 0.9 },
    });
    assert.equal(fail.ok, false);

    const pass = evaluateSession({
      build: { status: "passed", exitCode: 0 },
      tests: { status: "passed", passed: 5, failed: 0 },
      review: { score: 0.85, criticalIssues: 0, security: 0.9 },
      architectureViolations: [],
    });
    assert.equal(pass.ok, true);
    assert.ok(pass.score >= 0.9);
  });

  it("evaluates individual gates", () => {
    assert.equal(evaluateBuild({ status: "passed", exitCode: 0 }).ok, true);
    assert.equal(evaluateTests({ status: "passed", passed: 2, failed: 1 }).ok, false);
    assert.equal(evaluateReview({ score: 0.5, criticalIssues: 0 }).ok, false);
  });
});

describe("Phase 9 — Approvals & Decisions", () => {
  it("classifies dangerous actions as requiring approval", () => {
    assert.equal(classifyAction("git push --force origin main", { forcePush: true }).required, true);
    assert.equal(classifyAction("prisma migrate deploy", { migration: true }).required, true);
    assert.equal(classifyAction("delete file", { delete: true, files: ["a.js"] }).required, true);
    assert.equal(classifyAction("npm test", {}).required, false);
  });

  it("decision engine picks highest score with confidence", () => {
    const d = decideSync({
      summary: "pick stack",
      alternatives: [
        { id: "express", score: 0.9, reason: "existing" },
        { id: "fastapi", score: 0.4, reason: "new" },
      ],
    });
    assert.equal(d.choice, "express");
    assert.ok(d.confidence > 0.5);
    assert.ok(d.reasoning.includes("express"));
  });
});

describe("Phase 9 — Debugging & Tests parsing", () => {
  it("classifies error kinds", () => {
    const kinds = debug.classifyErrors("error TS2304: Cannot find name 'foo'\nFAIL src/a.test.js");
    assert.ok(kinds.includes("type") || kinds.includes("compiler"));
    assert.ok(kinds.includes("test"));
  });

  it("parses failure details and test counts", () => {
    const details = debug.parseFailureDetails("Error: boom\npassed", "AssertionError");
    assert.ok(details.snippets.length >= 1);
    const counts = parseTestCounts("3 passing\n1 failing\n2 pending", "");
    assert.equal(counts.passed, 3);
    assert.equal(counts.failed, 1);
    assert.equal(counts.skipped, 2);
  });
});
