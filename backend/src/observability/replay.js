const prisma = require("../database/prisma");
const persist = require("./persist");
const { redactValue } = require("./redact");

async function buildSnapshotFromTrace(traceId, userId) {
  const trace = await prisma.obsTrace.findFirst({
    where: { traceId, ...(userId ? { userId } : {}) },
    include: {
      spans: { orderBy: { startTime: "asc" } },
      promptTraces: { orderBy: { createdAt: "asc" } },
      toolTraces: { orderBy: { createdAt: "asc" } },
      agentTraces: { orderBy: { orderIndex: "asc" } },
      workflowTraces: true,
      knowledgeTraces: { orderBy: { createdAt: "asc" } },
      contextTraces: { orderBy: { createdAt: "asc" } },
      repositoryTraces: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trace) return null;

  const snapshot = redactValue({
    prompt: trace.promptTraces,
    context: trace.contextTraces,
    knowledge: trace.knowledgeTraces,
    toolCalls: trace.toolTraces,
    workflow: trace.workflowTraces,
    agents: trace.agentTraces,
    repository: trace.repositoryTraces,
    llm: trace.promptTraces.map((p) => ({
      model: p.model,
      provider: p.provider,
      tokens: p.totalTokens,
      latencyMs: p.latencyMs,
      cost: p.estimatedCost,
    })),
    timeline: trace.timeline,
    spans: trace.spans,
    attributes: trace.attributes,
  });

  return { trace, snapshot };
}

async function createReplayPackage(traceId, userId) {
  const built = await buildSnapshotFromTrace(traceId, userId);
  if (!built) return null;

  const steps = [];
  const timeline = Array.isArray(built.trace.timeline) ? built.trace.timeline : [];
  for (const ev of timeline) {
    steps.push({
      type: ev.type,
      at: ev.at,
      label: ev.label || ev.type,
      data: ev,
    });
  }
  for (const a of built.trace.agentTraces) {
    steps.push({
      type: "agent",
      at: a.createdAt,
      label: a.agentType,
      data: {
        agentType: a.agentType,
        status: a.status,
        reasoning: a.reasoning,
        outputSummary: a.outputSummary,
      },
    });
  }
  for (const t of built.trace.toolTraces) {
    steps.push({
      type: "tool",
      at: t.createdAt,
      label: t.toolName,
      data: {
        toolName: t.toolName,
        arguments: t.arguments,
        output: t.output,
        status: t.status,
      },
    });
  }

  steps.sort((a, b) => new Date(a.at) - new Date(b.at));

  const snap = await persist.createSnapshot({
    traceId,
    userId,
    kind: "replay",
    ...built.snapshot,
    timeline: built.trace.timeline,
  });

  const replay = await persist.createReplay({
    traceId,
    userId,
    status: "ready",
    snapshot: { snapshotId: snap.id, ...built.snapshot },
    steps,
  });

  persist.fire(() =>
    persist.createAuditLog({
      userId,
      action: "replay.create",
      resource: "ObsReplay",
      resourceId: replay.id,
      metadata: { traceId },
    }),
  );

  return replay;
}

async function getReplay(id, userId) {
  return prisma.obsReplay.findFirst({
    where: { id, userId },
    include: { trace: true },
  });
}

async function listReplays(userId, { limit = 50, offset = 0 } = {}) {
  return prisma.obsReplay.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    skip: offset,
  });
}

/**
 * Deterministic offline replay — reconstructs execution narrative from snapshot.
 * Does not re-execute side effects; returns ordered step playback.
 */
async function playReplay(id, userId, { fromStep = 0, toStep } = {}) {
  const replay = await getReplay(id, userId);
  if (!replay) return null;

  const steps = Array.isArray(replay.steps) ? replay.steps : [];
  const end = toStep != null ? toStep : steps.length;
  const slice = steps.slice(fromStep, end);

  const result = {
    replayId: replay.id,
    traceId: replay.traceId,
    totalSteps: steps.length,
    fromStep,
    toStep: end,
    played: slice,
    snapshot: replay.snapshot,
  };

  await prisma.obsReplay.update({
    where: { id },
    data: { status: "played", result },
  });

  persist.fire(() =>
    persist.createAuditLog({
      userId,
      action: "replay.play",
      resource: "ObsReplay",
      resourceId: id,
      metadata: { fromStep, toStep: end },
    }),
  );

  return result;
}

module.exports = {
  buildSnapshotFromTrace,
  createReplayPackage,
  getReplay,
  listReplays,
  playReplay,
};
