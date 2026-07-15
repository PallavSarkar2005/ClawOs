const prisma = require("../database/prisma");
const { estimateCost } = require("./cost");
const { assertTransition } = require("./state-machine");
const { EXECUTION_STATES } = require("./constants");

async function createExecution(data) {
  return prisma.agentExecution.create({
    data: {
      userId: data.userId,
      conversationId: data.conversationId || null,
      projectId: data.projectId || null,
      messageId: data.messageId || null,
      status: EXECUTION_STATES.QUEUED,
      intent: data.intent || null,
      maxRetries: data.maxRetries ?? 2,
      timeoutMs: data.timeoutMs ?? 300000,
      startedAt: new Date(),
    },
  });
}

async function transitionState(executionId, fromState, toState, reason) {
  let from = fromState;
  if (!from) {
    const current = await prisma.agentExecution.findUnique({ where: { id: executionId } });
    from = current?.status || null;
  }
  if (from && from !== toState) {
    assertTransition(from, toState);
  }
  const [execution] = await prisma.$transaction([
    prisma.agentExecution.update({
      where: { id: executionId },
      data: { status: toState },
    }),
    prisma.agentStateTransition.create({
      data: {
        executionId,
        fromState: from || null,
        toState,
        reason: reason || null,
      },
    }),
  ]);
  return execution;
}

async function createStep(executionId, task) {
  return prisma.agentStep.create({
    data: {
      executionId,
      taskId: task.id || task.taskId || null,
      agentType: task.agent,
      status: "pending",
      priority: task.priority ?? 0,
      complexity: task.complexity || null,
      dependencies: task.dependencies || [],
      requiredTools: task.requiredTools || [],
      expectedOutputs: task.expectedOutputs || [],
      input: task.input || task.description || null,
      maxRetries: task.maxRetries ?? 2,
    },
  });
}

async function updateStep(stepId, data) {
  const patch = { ...data };
  if (data.status === "completed" || data.status === "failed" || data.status === "cancelled") {
    if (!patch.finishedAt) patch.finishedAt = new Date();
    if (data.startedAt || patch.startedAt) {
      const started = new Date(data.startedAt || patch.startedAt);
      patch.durationMs = Date.now() - started.getTime();
    }
  }
  return prisma.agentStep.update({ where: { id: stepId }, data: patch });
}

async function startStep(stepId) {
  return prisma.agentStep.update({
    where: { id: stepId },
    data: { status: "running", startedAt: new Date() },
  });
}

async function createToolCall(data) {
  return prisma.agentToolCall.create({
    data: {
      executionId: data.executionId,
      stepId: data.stepId || null,
      agentType: data.agentType || null,
      toolName: data.toolName,
      arguments: data.arguments || {},
      status: "running",
      startedAt: new Date(),
    },
  });
}

async function finishToolCall(id, { result, status, error }) {
  return prisma.agentToolCall.update({
    where: { id },
    data: {
      result: result ?? undefined,
      status: status || (error ? "failed" : "completed"),
      error: error || null,
      finishedAt: new Date(),
      durationMs: undefined,
    },
  }).then(async (row) => {
    const durationMs = row.startedAt ? Date.now() - new Date(row.startedAt).getTime() : null;
    return prisma.agentToolCall.update({
      where: { id },
      data: { durationMs },
    });
  });
}

async function addLog(executionId, entry) {
  return prisma.agentLog.create({
    data: {
      executionId,
      stepId: entry.stepId || null,
      level: entry.level || "info",
      agentType: entry.agentType || null,
      event: entry.event || null,
      message: entry.message || "",
      data: entry.data || undefined,
    },
  });
}

async function addMetric(executionId, key, value, unit, metadata) {
  return prisma.agentMetric.create({
    data: {
      executionId,
      key,
      value: Number(value) || 0,
      unit: unit || null,
      metadata: metadata || {},
    },
  });
}

async function accumulateUsage(executionId, usage = {}) {
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  const total = usage.total_tokens || prompt + completion;
  const cost = estimateCost(prompt, completion);
  return prisma.agentExecution.update({
    where: { id: executionId },
    data: {
      promptTokens: { increment: prompt },
      completionTokens: { increment: completion },
      totalTokens: { increment: total },
      estimatedCost: { increment: cost },
    },
  });
}

async function completeExecution(executionId, data = {}) {
  return prisma.agentExecution.update({
    where: { id: executionId },
    data: {
      status: data.status || EXECUTION_STATES.COMPLETED,
      finalOutput: data.finalOutput || null,
      error: data.error || null,
      plan: data.plan || undefined,
      agentTree: data.agentTree || undefined,
      contextSize: data.contextSize ?? undefined,
      finishedAt: new Date(),
    },
  });
}

async function requestCancel(executionId, userId) {
  const execution = await prisma.agentExecution.findFirst({
    where: { id: executionId, userId },
  });
  if (!execution) return null;
  return prisma.agentExecution.update({
    where: { id: executionId },
    data: { cancelRequested: true },
  });
}

async function getExecution(executionId, userId) {
  return prisma.agentExecution.findFirst({
    where: {
      id: executionId,
      ...(userId ? { userId } : {}),
    },
    include: {
      steps: { orderBy: { createdAt: "asc" } },
      logs: { orderBy: { createdAt: "asc" }, take: 500 },
      toolCalls: { orderBy: { createdAt: "asc" } },
      metrics: { orderBy: { createdAt: "asc" } },
      transitions: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function listExecutions(userId, { conversationId, limit = 20 } = {}) {
  return prisma.agentExecution.findMany({
    where: {
      userId,
      ...(conversationId ? { conversationId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      steps: { orderBy: { createdAt: "asc" } },
    },
  });
}

async function setPlan(executionId, plan, agentTree) {
  return prisma.agentExecution.update({
    where: { id: executionId },
    data: {
      plan,
      agentTree: agentTree || plan?.tasks?.map((t) => t.agent) || [],
    },
  });
}

module.exports = {
  createExecution,
  transitionState,
  createStep,
  updateStep,
  startStep,
  createToolCall,
  finishToolCall,
  addLog,
  addMetric,
  accumulateUsage,
  completeExecution,
  requestCancel,
  getExecution,
  listExecutions,
  setPlan,
};
