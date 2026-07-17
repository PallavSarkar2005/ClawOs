const prisma = require("../database/prisma");
const { redactValue, truncate } = require("./redact");

function fire(fn) {
  Promise.resolve()
    .then(fn)
    .catch((err) => {
      if (process.env.OBS_DEBUG) {
        console.warn("[obs] persist:", err.message);
      }
    });
}

async function createTrace(data) {
  return prisma.obsTrace.create({
    data: {
      traceId: data.traceId,
      name: data.name || "execution",
      kind: data.kind || "execution",
      status: data.status || "running",
      userId: data.userId || null,
      projectId: data.projectId || null,
      conversationId: data.conversationId || null,
      workflowId: data.workflowId || null,
      workflowExecutionId: data.workflowExecutionId || null,
      agentExecutionId: data.agentExecutionId || null,
      rootSpanId: data.rootSpanId || null,
      startTime: data.startTime || new Date(),
      attributes: redactValue(data.attributes || {}),
      timeline: [],
      redacted: true,
    },
  });
}

async function updateTrace(traceId, patch) {
  const data = { ...patch };
  if (data.attributes) data.attributes = redactValue(data.attributes);
  if (data.timeline) data.timeline = redactValue(data.timeline);
  if (data.error) data.error = truncate(String(data.error), 4000);
  return prisma.obsTrace.update({ where: { traceId }, data });
}

async function createSpan(data) {
  return prisma.obsSpan.create({
    data: {
      spanId: data.spanId,
      traceId: data.traceId,
      parentSpanId: data.parentSpanId || null,
      name: data.name,
      kind: data.kind || "internal",
      status: data.status || "running",
      startTime: data.startTime || new Date(),
      attributes: redactValue(data.attributes || {}),
      events: [],
      retries: data.retries || 0,
    },
  });
}

async function updateSpan(traceId, spanId, patch) {
  const data = { ...patch };
  if (data.attributes) data.attributes = redactValue(data.attributes);
  if (data.events) data.events = redactValue(data.events);
  if (data.error) data.error = truncate(String(data.error), 4000);
  return prisma.obsSpan.update({
    where: { traceId_spanId: { traceId, spanId } },
    data,
  });
}

async function appendTimeline(traceId, event) {
  const row = await prisma.obsTrace.findUnique({
    where: { traceId },
    select: { timeline: true },
  });
  if (!row) return null;
  const timeline = Array.isArray(row.timeline) ? row.timeline : [];
  timeline.push(redactValue(event));
  if (timeline.length > 2000) timeline.splice(0, timeline.length - 2000);
  return prisma.obsTrace.update({
    where: { traceId },
    data: { timeline },
  });
}

async function createPromptTrace(data) {
  return prisma.obsPromptTrace.create({
    data: {
      traceId: data.traceId,
      spanId: data.spanId || null,
      originalPrompt: truncate(data.originalPrompt, 20000),
      systemPrompt: truncate(data.systemPrompt, 20000),
      contextInjected: truncate(data.contextInjected, 20000),
      repositoryContext: truncate(data.repositoryContext, 10000),
      retrievedMemories: redactValue(data.retrievedMemories || []),
      retrievedDocuments: redactValue(data.retrievedDocuments || []),
      retrievedCode: redactValue(data.retrievedCode || []),
      response: truncate(data.response, 20000),
      model: data.model || null,
      provider: data.provider || null,
      temperature: data.temperature ?? null,
      promptTokens: data.promptTokens || 0,
      completionTokens: data.completionTokens || 0,
      totalTokens: data.totalTokens || 0,
      estimatedCost: data.estimatedCost || 0,
      latencyMs: data.latencyMs ?? null,
      streamingLatencyMs: data.streamingLatencyMs ?? null,
      status: data.status || "ok",
      error: data.error ? truncate(String(data.error), 2000) : null,
      metadata: redactValue(data.metadata || {}),
    },
  });
}

async function createToolTrace(data) {
  return prisma.obsToolTrace.create({
    data: {
      traceId: data.traceId,
      spanId: data.spanId || null,
      toolExecutionId: data.toolExecutionId || null,
      toolName: data.toolName,
      category: data.category || null,
      arguments: redactValue(data.arguments || {}),
      output: data.output != null ? redactValue(data.output) : undefined,
      status: data.status || "running",
      error: data.error ? truncate(String(data.error), 2000) : null,
      durationMs: data.durationMs ?? null,
      retries: data.retries || 0,
      cached: Boolean(data.cached),
      agentType: data.agentType || null,
    },
  });
}

async function createAgentTrace(data) {
  return prisma.obsAgentTrace.create({
    data: {
      traceId: data.traceId,
      spanId: data.spanId || null,
      agentExecutionId: data.agentExecutionId || null,
      agentStepId: data.agentStepId || null,
      agentType: data.agentType,
      orderIndex: data.orderIndex || 0,
      reasoning: truncate(data.reasoning, 10000),
      delegation: data.delegation ? redactValue(data.delegation) : undefined,
      status: data.status || "running",
      error: data.error ? truncate(String(data.error), 2000) : null,
      retries: data.retries || 0,
      durationMs: data.durationMs ?? null,
      promptTokens: data.promptTokens || 0,
      completionTokens: data.completionTokens || 0,
      inputSummary: truncate(data.inputSummary, 2000),
      outputSummary: truncate(data.outputSummary, 4000),
    },
  });
}

async function upsertWorkflowTrace(data) {
  const existing = data.workflowExecutionId
    ? await prisma.obsWorkflowTrace.findFirst({
        where: { workflowExecutionId: data.workflowExecutionId },
      })
    : null;

  const payload = {
    spanId: data.spanId || null,
    workflowId: data.workflowId || null,
    workflowExecutionId: data.workflowExecutionId || null,
    dag: data.dag || {},
    currentNodeKeys: data.currentNodeKeys || [],
    completedNodes: data.completedNodes || [],
    failedNodes: data.failedNodes || [],
    queuedNodes: data.queuedNodes || [],
    executionTimeline: data.executionTimeline || [],
    checkpoints: data.checkpoints || [],
    approvals: data.approvals || [],
    retries: data.retries || 0,
    status: data.status || "running",
    durationMs: data.durationMs ?? null,
    error: data.error ? truncate(String(data.error), 2000) : null,
  };

  if (existing) {
    return prisma.obsWorkflowTrace.update({
      where: { id: existing.id },
      data: payload,
    });
  }

  return prisma.obsWorkflowTrace.create({
    data: { traceId: data.traceId, ...payload },
  });
}

async function createKnowledgeTrace(data) {
  return prisma.obsKnowledgeTrace.create({
    data: {
      traceId: data.traceId,
      spanId: data.spanId || null,
      retrievalId: data.retrievalId || null,
      query: truncate(data.query, 4000),
      chunks: redactValue(data.chunks || []),
      similarityScores: data.similarityScores || [],
      graphPath: data.graphPath || [],
      citationRanking: data.citationRanking || [],
      contextContribution: data.contextContribution || {},
      embeddingModel: data.embeddingModel || null,
      searchLatencyMs: data.searchLatencyMs ?? null,
      mode: data.mode || null,
      topK: data.topK ?? null,
      resultCount: data.resultCount || 0,
      status: data.status || "ok",
      error: data.error ? truncate(String(data.error), 2000) : null,
    },
  });
}

async function createContextTrace(data) {
  return prisma.obsContextTrace.create({
    data: {
      traceId: data.traceId,
      spanId: data.spanId || null,
      contextSessionId: data.contextSessionId || null,
      query: truncate(data.query, 4000),
      sources: data.sources || {},
      ranking: data.ranking || [],
      selected: redactValue(data.selected || []),
      dropped: data.dropped || [],
      tokenBudget: data.tokenBudget ?? null,
      usedTokens: data.usedTokens ?? null,
      compressionRatio: data.compressionRatio ?? null,
      durationMs: data.durationMs ?? null,
      reasoningPath: data.reasoningPath || [],
      status: data.status || "ok",
      error: data.error ? truncate(String(data.error), 2000) : null,
    },
  });
}

async function createRepositoryTrace(data) {
  return prisma.obsRepositoryTrace.create({
    data: {
      traceId: data.traceId,
      spanId: data.spanId || null,
      repositoryId: data.repositoryId || null,
      projectId: data.projectId || null,
      jobId: data.jobId || null,
      stage: data.stage || null,
      filesProcessed: data.filesProcessed || 0,
      filesTotal: data.filesTotal || 0,
      symbolsIndexed: data.symbolsIndexed || 0,
      dependencyUpdates: data.dependencyUpdates || 0,
      architectureChanges: data.architectureChanges || [],
      health: data.health || {},
      durationMs: data.durationMs ?? null,
      status: data.status || "running",
      error: data.error ? truncate(String(data.error), 2000) : null,
    },
  });
}

async function createMetric(data) {
  return prisma.obsMetric.create({
    data: {
      traceId: data.traceId || null,
      userId: data.userId || null,
      name: data.name,
      value: Number(data.value) || 0,
      unit: data.unit || null,
      tags: data.tags || {},
      windowStart: data.windowStart || null,
      windowEnd: data.windowEnd || null,
      aggregated: Boolean(data.aggregated),
    },
  });
}

async function createAlert(data) {
  return prisma.obsAlert.create({
    data: {
      traceId: data.traceId || null,
      userId: data.userId || null,
      type: data.type,
      severity: data.severity || "warning",
      title: data.title,
      message: truncate(data.message, 4000),
      status: "open",
      metadata: redactValue(data.metadata || {}),
    },
  });
}

async function createReplay(data) {
  return prisma.obsReplay.create({
    data: {
      traceId: data.traceId,
      userId: data.userId || null,
      status: data.status || "ready",
      snapshot: redactValue(data.snapshot || {}),
      steps: redactValue(data.steps || []),
      result: data.result ? redactValue(data.result) : undefined,
      error: data.error || null,
    },
  });
}

async function createSnapshot(data) {
  const payload = redactValue({
    prompt: data.prompt || null,
    context: data.context || null,
    knowledge: data.knowledge || null,
    toolCalls: data.toolCalls || null,
    workflow: data.workflow || null,
    agents: data.agents || null,
    repository: data.repository || null,
    llm: data.llm || null,
    timeline: data.timeline || null,
  });
  const sizeBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  return prisma.obsExecutionSnapshot.create({
    data: {
      traceId: data.traceId,
      userId: data.userId || null,
      kind: data.kind || "full",
      ...payload,
      compressed: sizeBytes > 100_000,
      sizeBytes,
    },
  });
}

async function createAuditLog(data) {
  return prisma.obsAuditLog.create({
    data: {
      userId: data.userId || null,
      action: data.action,
      resource: data.resource || null,
      resourceId: data.resourceId || null,
      metadata: redactValue(data.metadata || {}),
      ip: data.ip || null,
    },
  });
}

module.exports = {
  fire,
  createTrace,
  updateTrace,
  createSpan,
  updateSpan,
  appendTimeline,
  createPromptTrace,
  createToolTrace,
  createAgentTrace,
  upsertWorkflowTrace,
  createKnowledgeTrace,
  createContextTrace,
  createRepositoryTrace,
  createMetric,
  createAlert,
  createReplay,
  createSnapshot,
  createAuditLog,
};
