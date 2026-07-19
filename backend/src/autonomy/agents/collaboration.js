/**
 * Multi-agent collaboration — shared memory, delegation,
 * artifact exchange, peer review, conflict resolution.
 */

const { getAgent, listAgentTypes } = require("./registry");
const { decide } = require("../decision/engine");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS, STREAM_EVENTS } = require("../constants");
const { chat } = require("../../runtime/llm.client");
const { extractJson } = require("../../runtime/planner");

function createSharedMemory(seed = {}) {
  return {
    facts: [],
    decisions: [],
    artifacts: [],
    conflicts: [],
    preferences: {},
    ...seed,
  };
}

function writeShared(memory, entry) {
  const next = memory || createSharedMemory();
  if (entry.fact) next.facts.push({ ...entry.fact, at: new Date().toISOString() });
  if (entry.decision) next.decisions.push({ ...entry.decision, at: new Date().toISOString() });
  if (entry.artifact) next.artifacts.push({ ...entry.artifact, at: new Date().toISOString() });
  if (entry.conflict) next.conflicts.push({ ...entry.conflict, at: new Date().toISOString() });
  if (entry.preferences) Object.assign(next.preferences, entry.preferences);
  // Cap growth
  next.facts = next.facts.slice(-100);
  next.decisions = next.decisions.slice(-50);
  next.artifacts = next.artifacts.slice(-80);
  next.conflicts = next.conflicts.slice(-40);
  return next;
}

async function delegateTask(fromAgent, toAgentType, task, ctx) {
  const agent = getAgent(toAgentType);
  if (!agent) {
    throw Object.assign(new Error(`Unknown agent: ${toAgentType}`), { code: "UNKNOWN_AGENT" });
  }

  ctx.emit?.(STREAM_EVENTS.AGENT_DELEGATED, {
    from: fromAgent,
    to: toAgentType,
    taskId: task.id,
    description: task.description?.slice(0, 200),
  });

  const output = await agent.run(task, {
    ...ctx,
    sharedMemory: ctx.sharedMemory,
    artifactSummaries: summarizeArtifacts(ctx.artifacts),
  });

  ctx.sharedMemory = writeShared(ctx.sharedMemory, {
    fact: {
      agent: toAgentType,
      summary: String(output.content || "").slice(0, 500),
      taskId: task.id,
    },
    artifact: {
      agent: toAgentType,
      kind: "agent_output",
      name: `${toAgentType}-${task.id}`,
    },
  });

  if (ctx.sessionId) {
    await createArtifact(
      {
        sessionId: ctx.sessionId,
        goalId: ctx.goalId,
        taskId: ctx.dbTaskId || null,
        kind: ARTIFACT_KINDS.CODE,
        name: `${toAgentType}-${task.id}-output.md`,
        content: output.content,
        metadata: { agent: toAgentType, from: fromAgent },
      },
      ctx.emit,
    );
  }

  return output;
}

function summarizeArtifacts(artifacts = []) {
  if (!artifacts?.length) return "(none)";
  return artifacts
    .slice(-20)
    .map((a) => `- [${a.kind}] ${a.name}${a.path ? ` @ ${a.path}` : ""}`)
    .join("\n");
}

async function peerReview(reviewerType, subjectOutput, ctx) {
  const reviewer = getAgent(reviewerType) || getAgent("reviewer");
  const task = {
    id: `peer_${Date.now()}`,
    description: `Peer-review the following agent output for correctness, security, and consistency with the goal.\n\nGOAL:\n${ctx.goalDescription || ""}\n\nOUTPUT TO REVIEW:\n${String(subjectOutput || "").slice(0, 12000)}`,
    expectedOutputs: ["peer-review"],
  };
  const result = await reviewer.run(task, {
    ...ctx,
    sharedMemory: ctx.sharedMemory,
  });
  return result;
}

async function resolveConflicts(conflicts, ctx) {
  if (!conflicts?.length) return { resolved: [], memory: ctx.sharedMemory };

  const pm = getAgent("project_manager");
  const task = {
    id: `conflict_${Date.now()}`,
    description: `Resolve these agent conflicts. Choose a coherent direction and update shared decisions.\n\nCONFLICTS:\n${JSON.stringify(conflicts, null, 2)}\n\nGOAL:\n${ctx.goalDescription || ""}`,
    expectedOutputs: ["resolutions"],
  };

  let content = "";
  if (pm) {
    const out = await pm.run(task, ctx);
    content = out.content || "";
  } else {
    const response = await chat({
      messages: [
        {
          role: "system",
          content: "Resolve agent conflicts. Return markdown with ## Resolutions and clear choices.",
        },
        { role: "user", content: task.description },
      ],
      settings: ctx.settings || {},
      temperature: 0.2,
      maxTokens: 2048,
      signal: ctx.signal,
    });
    content = response.content || "";
  }

  const decision = await decide(
    {
      userId: ctx.userId,
      goalId: ctx.goalId,
      sessionId: ctx.sessionId,
      kind: "conflict_resolution",
      summary: `Resolved ${conflicts.length} conflict(s)`,
      reasoning: content.slice(0, 4000),
      alternatives: conflicts.map((c, i) => ({
        id: c.id || `c${i}`,
        score: 0.5,
        reason: c.description || c.summary,
      })),
      confidence: 0.7,
      risks: [{ level: "medium", message: "Resolution may need revisit after implementation" }],
      tradeoffs: [],
      evidence: conflicts,
      choice: "pm_resolution",
    },
    ctx.emit,
  );

  const memory = writeShared(ctx.sharedMemory, {
    decision: {
      id: decision.id,
      summary: decision.summary,
      choice: decision.choice,
    },
    conflict: { status: "resolved", count: conflicts.length },
  });

  return { resolved: [{ decision, content }], memory };
}

function detectConflicts(outputs = []) {
  const conflicts = [];
  // Heuristic: conflicting file claims or opposite recommendations
  const fileClaims = new Map();
  for (const out of outputs) {
    const files = String(out.content || "").match(/(?:^|\n)(?:[-*]\s*)?([\w./\\-]+\.(?:js|ts|tsx|jsx|py|go|rs|java|prisma|json|yml|yaml|md))\b/g) || [];
    for (const f of files) {
      const name = f.replace(/^[\s\n\-*]+/, "").trim();
      if (!fileClaims.has(name)) fileClaims.set(name, []);
      fileClaims.get(name).push(out.agent);
    }
  }
  // Look for explicit contradiction markers
  for (let i = 0; i < outputs.length; i += 1) {
    for (let j = i + 1; j < outputs.length; j += 1) {
      const a = String(outputs[i].content || "").toLowerCase();
      const b = String(outputs[j].content || "").toLowerCase();
      if (
        (a.includes("do not") && b.includes("should")) ||
        (a.includes("use postgres") && b.includes("use mongodb")) ||
        (a.includes("rest api") && b.includes("graphql only"))
      ) {
        conflicts.push({
          id: `conflict_${i}_${j}`,
          agents: [outputs[i].agent, outputs[j].agent],
          description: "Detected contradictory technical recommendations",
          severity: "medium",
        });
      }
    }
  }
  return conflicts;
}

module.exports = {
  createSharedMemory,
  writeShared,
  delegateTask,
  peerReview,
  resolveConflicts,
  detectConflicts,
  summarizeArtifacts,
  listAgentTypes,
  getAgent,
};
