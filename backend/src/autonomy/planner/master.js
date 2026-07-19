/**
 * Master Planner — break goals into milestones and tasks,
 * estimate deps/complexity/duration, prioritize, build execution graph,
 * re-plan after failures, maintain long-running objectives.
 */

const { chat } = require("../../runtime/llm.client");
const { extractJson } = require("../../runtime/planner");
const {
  AUTONOMY_AGENTS,
  PHASES,
  COMPLEXITY_MS,
  PLAN_STATUS,
  ARTIFACT_KINDS,
} = require("../constants");
const { decide } = require("../decision/engine");
const { createArtifact } = require("../artifacts/manager");
const { findRelevant, formatLearningsForPrompt } = require("../learning/store");
const { decomposeGoal } = require("./decompose");

const MASTER_PLANNER_SYSTEM = `You are the Master Planner for OpenClaw Autonomous Software Engineer.

Break large software engineering goals into milestones and executable tasks.

Available specialist agents:
- researcher: gather requirements, APIs, docs, prior art
- architect: system design, modules, interfaces
- backend_engineer: server APIs, services, business logic
- frontend_engineer: UI, components, client state
- database_engineer: schema, migrations, queries
- devops_engineer: CI/CD, containers, infra, deploy scripts
- security_engineer: threat model, authz, vuln review
- qa_engineer: tests, coverage, regression
- reviewer: code review, quality gates
- documentation_writer: docs, READMEs, ADRs
- release_manager: versioning, changelog, release notes
- project_manager: coordination, prioritization, conflict resolution
- planner: re-planning and dependency analysis

Rules:
1. Return ONLY valid JSON (no markdown fences).
2. Prefer the natural software delivery pipeline when building systems:
   research → architecture → database → backend → frontend → testing → security_review → documentation → deployment → verification
3. Estimate complexity (low|medium|high|very_high), durationMs, priority (1-100 higher first).
4. Express hard dependencies via dependsOn task ids.
5. Keep tasks concrete and agent-aligned — no vague "do stuff" tasks.
6. Include successCriteria on the plan.

JSON schema:
{
  "intent": "string",
  "strategy": "string",
  "estimatedDurationMs": number,
  "successCriteria": ["string"],
  "milestones": [
    {
      "id": "m1",
      "title": "string",
      "phase": "research|architecture|database|backend|frontend|testing|security_review|documentation|deployment|verification",
      "priority": 80,
      "estimatedMs": 600000
    }
  ],
  "tasks": [
    {
      "id": "t1",
      "milestoneId": "m1",
      "title": "string",
      "description": "string",
      "agent": "researcher|architect|...",
      "dependsOn": [],
      "priority": 80,
      "complexity": "medium",
      "estimatedMs": 300000,
      "expectedOutputs": ["design"]
    }
  ]
}`;

const VALID_AGENTS = new Set(Object.values(AUTONOMY_AGENTS));
const VALID_PHASES = new Set(Object.values(PHASES));

function estimateComplexity(text) {
  const t = String(text || "").toLowerCase();
  let score = 1;
  if (/\b(auth|oauth|payment|realtime|distributed|kubernetes|migration|multi-tenant)\b/.test(t)) score += 2;
  if (/\b(full.?stack|end.?to.?end|platform|microservice|infrastructure)\b/.test(t)) score += 2;
  if (/\b(simple|small|fix|typo|rename|docs)\b/.test(t)) score -= 1;
  if (score <= 1) return "low";
  if (score === 2) return "medium";
  if (score === 3) return "high";
  return "very_high";
}

function buildExecutionGraph(tasks) {
  const nodes = tasks.map((t) => ({
    id: t.id,
    agent: t.agent,
    priority: t.priority,
    complexity: t.complexity,
    estimatedMs: t.estimatedMs,
  }));
  const edges = [];
  for (const t of tasks) {
    for (const dep of t.dependsOn || []) {
      edges.push({ from: dep, to: t.id });
    }
  }
  const waves = topologicalWaves(tasks);
  return {
    nodes,
    edges,
    waves: waves.map((w) => w.map((t) => t.id)),
    criticalPathMs: estimateCriticalPath(tasks),
  };
}

function topologicalWaves(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const remaining = new Set(tasks.map((t) => t.id));
  const done = new Set();
  const waves = [];

  while (remaining.size) {
    const wave = [];
    for (const id of remaining) {
      const task = byId.get(id);
      const deps = task.dependsOn || [];
      if (deps.every((d) => done.has(d) || !byId.has(d))) wave.push(task);
    }
    if (!wave.length) {
      const next = byId.get([...remaining][0]);
      waves.push([next]);
      remaining.delete(next.id);
      done.add(next.id);
      continue;
    }
    wave.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    for (const t of wave) {
      remaining.delete(t.id);
      done.add(t.id);
    }
    waves.push(wave);
  }
  return waves;
}

function estimateCriticalPath(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map();

  function dfs(id, stack = new Set()) {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    stack.add(id);
    const t = byId.get(id);
    if (!t) return 0;
    const deps = t.dependsOn || [];
    const upstream = deps.length
      ? Math.max(...deps.map((d) => dfs(d, stack)))
      : 0;
    const total = upstream + (t.estimatedMs || COMPLEXITY_MS[t.complexity] || COMPLEXITY_MS.medium);
    memo.set(id, total);
    stack.delete(id);
    return total;
  }

  let max = 0;
  for (const t of tasks) max = Math.max(max, dfs(t.id));
  return max;
}

function sanitizeMasterPlan(raw, goalText) {
  const complexity = estimateComplexity(goalText);
  let milestones = Array.isArray(raw?.milestones) ? raw.milestones : [];
  let tasks = Array.isArray(raw?.tasks) ? raw.tasks : [];

  milestones = milestones.map((m, i) => ({
    id: String(m.id || `m${i + 1}`),
    title: String(m.title || `Milestone ${i + 1}`).slice(0, 300),
    phase: VALID_PHASES.has(m.phase) ? m.phase : Object.values(PHASES)[Math.min(i, 9)],
    priority: Number.isFinite(m.priority) ? m.priority : 90 - i * 5,
    estimatedMs: Number.isFinite(m.estimatedMs) ? m.estimatedMs : COMPLEXITY_MS.medium,
  }));

  tasks = tasks
    .filter((t) => t && VALID_AGENTS.has(String(t.agent || "").toLowerCase().replace(/-/g, "_")))
    .map((t, i) => {
      let agent = String(t.agent).toLowerCase().replace(/-/g, "_");
      if (agent === "research") agent = AUTONOMY_AGENTS.RESEARCHER;
      if (agent === "coder") agent = AUTONOMY_AGENTS.BACKEND;
      if (agent === "tester") agent = AUTONOMY_AGENTS.QA;
      return {
        id: String(t.id || `t${i + 1}`),
        milestoneId: t.milestoneId ? String(t.milestoneId) : milestones[0]?.id || null,
        title: String(t.title || t.description || `Task ${i + 1}`).slice(0, 300),
        description: String(t.description || goalText).slice(0, 4000),
        agent,
        dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.map(String) : [],
        priority: Number.isFinite(t.priority) ? t.priority : 80 - i,
        complexity: ["low", "medium", "high", "very_high"].includes(t.complexity)
          ? t.complexity
          : complexity,
        estimatedMs:
          Number.isFinite(t.estimatedMs)
            ? t.estimatedMs
            : COMPLEXITY_MS[t.complexity] || COMPLEXITY_MS[complexity] || COMPLEXITY_MS.medium,
        expectedOutputs: Array.isArray(t.expectedOutputs) ? t.expectedOutputs.map(String) : [],
      };
    });

  if (!tasks.length) {
    const decomposed = decomposeGoal(goalText);
    milestones = decomposed.milestones;
    tasks = decomposed.tasks;
  }

  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    t.dependsOn = t.dependsOn.filter((d) => ids.has(d) && d !== t.id);
  }

  // Prioritize: higher priority first; boost critical-path precursors
  const graph = buildExecutionGraph(tasks);
  const priorityScore = tasks.reduce((s, t) => s + (t.priority || 0), 0) / Math.max(tasks.length, 1);

  return {
    intent: raw?.intent || String(goalText).slice(0, 200),
    strategy: raw?.strategy || "Execute milestone pipeline with specialist agents",
    successCriteria: Array.isArray(raw?.successCriteria)
      ? raw.successCriteria.map(String)
      : ["Build succeeds", "Tests pass", "Review score >= 0.7", "No critical security issues"],
    milestones,
    tasks,
    executionGraph: graph,
    estimatedDurationMs: Number.isFinite(raw?.estimatedDurationMs)
      ? raw.estimatedDurationMs
      : graph.criticalPathMs,
    priorityScore,
    complexity,
    status: PLAN_STATUS.READY,
  };
}

async function createMasterPlan(ctx) {
  const goalText = ctx.goalDescription || ctx.userMessage || "";
  const learnings = await findRelevant(ctx.userId, {
    projectId: ctx.projectId,
    pattern: goalText.slice(0, 120),
    limit: 8,
  }).catch(() => []);

  let raw = null;
  try {
    const response = await chat({
      messages: [
        { role: "system", content: MASTER_PLANNER_SYSTEM },
        {
          role: "user",
          content: [
            `GOAL:\n${goalText}`,
            ctx.projectId ? `PROJECT ID: ${ctx.projectId}` : null,
            `PRIOR LEARNINGS:\n${formatLearningsForPrompt(learnings)}`,
            "Create the master execution plan JSON now.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      settings: ctx.settings || {},
      temperature: 0.2,
      maxTokens: 4096,
      signal: ctx.signal,
      obsContext: {
        executionId: ctx.agentExecutionId,
        autonomySessionId: ctx.sessionId,
      },
    });
    raw = extractJson(response.content);
  } catch (error) {
    ctx.emit?.("autonomy_log", {
      level: "warn",
      message: `Master planner LLM failed, using decomposition: ${error.message}`,
    });
  }

  const plan = sanitizeMasterPlan(raw, goalText);

  try {
    await decide(
      {
        userId: ctx.userId,
        goalId: ctx.goalId,
        sessionId: ctx.sessionId,
        kind: "master_plan",
        summary: `Planned ${plan.tasks.length} tasks across ${plan.milestones.length} milestones`,
        reasoning: plan.strategy,
        alternatives: [
          { id: "llm_plan", score: raw ? 0.8 : 0.2, reason: "LLM-generated plan" },
          { id: "heuristic_decompose", score: raw ? 0.4 : 0.85, reason: "Pipeline decomposition" },
        ],
        confidence: raw ? 0.78 : 0.65,
        risks: [{ level: "medium", message: "Estimates may drift as implementation proceeds" }],
        tradeoffs: [{ chosen: "milestone_pipeline", note: "Predictable delivery vs faster ad-hoc coding" }],
        evidence: [
          { tasks: plan.tasks.length },
          { criticalPathMs: plan.executionGraph.criticalPathMs },
          { learnings: learnings.length },
        ],
        choice: "execute_master_plan",
      },
      ctx.emit,
    );
  } catch {
    /* persistence optional in unit/offline contexts */
  }

  if (ctx.sessionId || ctx.goalId) {
    try {
      await createArtifact(
        {
          goalId: ctx.goalId,
          sessionId: ctx.sessionId,
          kind: ARTIFACT_KINDS.PLAN,
          name: `plan-v${ctx.planVersion || 1}.json`,
          contentJson: plan,
          mimeType: "application/json",
        },
        ctx.emit,
      );
    } catch {
      /* ignore */
    }
  }

  return plan;
}

async function replanAfterFailure(ctx, previousPlan, failure) {
  const failedTasks = (previousPlan.tasks || []).filter(
    (t) => failure.failedTaskIds?.includes(t.id) || t.status === "failed",
  );

  let raw = null;
  try {
    const response = await chat({
      messages: [
        { role: "system", content: MASTER_PLANNER_SYSTEM },
        {
          role: "user",
          content: [
            `ORIGINAL GOAL:\n${ctx.goalDescription || ctx.userMessage}`,
            `FAILURE:\n${failure.message || JSON.stringify(failure)}`,
            `FAILED TASKS:\n${JSON.stringify(failedTasks, null, 2)}`,
            `PREVIOUS PLAN TASKS:\n${JSON.stringify(previousPlan.tasks, null, 2)}`,
            "Re-plan: keep successful completed work as assumptions, fix/retry failed path, add remediation tasks if needed.",
          ].join("\n\n"),
        },
      ],
      settings: ctx.settings || {},
      temperature: 0.25,
      maxTokens: 4096,
      signal: ctx.signal,
    });
    raw = extractJson(response.content);
  } catch {
    /* heuristic replan below */
  }

  const base = sanitizeMasterPlan(raw || previousPlan, ctx.goalDescription || ctx.userMessage);
  base.replanReason = failure.message || "failure recovery";
  base.status = PLAN_STATUS.REPLANNED;

  // Prefer retrying failed tasks with debug/fix agents first
  if (!raw && failedTasks.length) {
    const remediation = failedTasks.map((t, i) => ({
      id: `fix_${t.id}_${i}`,
      milestoneId: t.milestoneId,
      title: `Fix failure: ${t.title}`,
      description: `Diagnose and fix: ${failure.message || t.error || t.title}. Original task: ${t.description}`,
      agent: AUTONOMY_AGENTS.QA,
      dependsOn: [],
      priority: 95,
      complexity: t.complexity || "medium",
      estimatedMs: COMPLEXITY_MS.medium,
      expectedOutputs: ["fix", "verification"],
    }));
    base.tasks = [...remediation, ...base.tasks.filter((t) => !failedTasks.find((f) => f.id === t.id))];
    base.executionGraph = buildExecutionGraph(base.tasks);
  }

  try {
    await decide(
      {
        userId: ctx.userId,
        goalId: ctx.goalId,
        sessionId: ctx.sessionId,
        kind: "replan",
        summary: `Re-planned after failure: ${failure.message || "unknown"}`,
        reasoning: base.strategy,
        alternatives: [
          { id: "retry_same", score: 0.3 },
          { id: "replan_graph", score: 0.8 },
          { id: "abort", score: 0.2 },
        ],
        confidence: 0.7,
        risks: [{ level: "high", message: "Repeated failures may indicate wrong architecture" }],
        tradeoffs: [],
        evidence: [{ failed: failedTasks.map((t) => t.id) }],
        choice: "replan_graph",
      },
      ctx.emit,
    );
  } catch {
    /* ignore */
  }

  return base;
}

module.exports = {
  createMasterPlan,
  replanAfterFailure,
  sanitizeMasterPlan,
  buildExecutionGraph,
  topologicalWaves,
  estimateComplexity,
  estimateCriticalPath,
};
