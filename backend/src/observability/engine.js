const { tracer } = require("./tracer");
const persist = require("./persist");
const metrics = require("./metrics");
const alerts = require("./alerts");
const replay = require("./replay");
const search = require("./search");
const timeline = require("./timeline");
const { queryCache } = require("./cache");
const { runRetentionPass } = require("./retention");
const { startAggregator, stopAggregator, aggregateWindow } = require("./aggregator");
const {
  TRACE_KIND,
  SPAN_KIND,
  TRACE_STATUS,
  TIMELINE_EVENTS,
  METRIC_NAMES,
} = require("./constants");
const { estimateCost } = require("../runtime/cost");

/**
 * Central AI Observability Engine — single façade used by all bridges.
 */
class ObservabilityEngine {
  constructor() {
    this.tracer = tracer;
    this.started = false;
  }

  init() {
    if (this.started) return this;
    this.started = true;
    startAggregator({ intervalMs: 5 * 60_000 });
    // Retention once per hour
    this._retentionTimer = setInterval(() => {
      runRetentionPass().catch((e) => console.warn("[obs] retention:", e.message));
    }, 60 * 60_000);
    this._retentionTimer.unref?.();
    console.log("[obs] AI Observability Engine initialized");
    return this;
  }

  shutdown() {
    stopAggregator();
    if (this._retentionTimer) clearInterval(this._retentionTimer);
    this.started = false;
  }

  startExecutionTrace(opts) {
    return tracer.startTrace({
      kind: opts.kind || TRACE_KIND.EXECUTION,
      name: opts.name || "coordinator.execution",
      userId: opts.userId,
      projectId: opts.projectId,
      conversationId: opts.conversationId,
      workflowId: opts.workflowId,
      workflowExecutionId: opts.workflowExecutionId,
      agentExecutionId: opts.agentExecutionId,
      attributes: opts.attributes || {},
    });
  }

  startSpan(traceId, opts) {
    return tracer.startSpan(traceId, opts);
  }

  endSpan(traceId, spanId, opts) {
    return tracer.endSpan(traceId, spanId, opts);
  }

  timeline(traceId, type, data) {
    tracer.addTimeline(traceId, type, data);
  }

  endExecutionTrace(traceId, opts = {}) {
    const handle = tracer.endTrace(traceId, opts);
    if (handle) {
      metrics.record(METRIC_NAMES.AVG_LATENCY, handle.durationMs || 0, {
        userId: handle.userId,
        traceId,
        tags: { kind: handle.kind },
      });
      alerts.evaluateAfterTrace(handle, opts.extras || {});
      queryCache.invalidate(`dash:${handle.userId}`);
    }
    return handle;
  }

  recordPrompt(traceId, data) {
    const cost =
      data.estimatedCost ??
      estimateCost(data.promptTokens || 0, data.completionTokens || 0);
    persist.fire(() =>
      persist.createPromptTrace({
        ...data,
        traceId,
        estimatedCost: cost,
        totalTokens:
          data.totalTokens ||
          (data.promptTokens || 0) + (data.completionTokens || 0),
      }),
    );
    if (data.latencyMs != null) {
      metrics.record(METRIC_NAMES.PROVIDER_LATENCY, data.latencyMs, {
        userId: data.userId,
        traceId,
        tags: { model: data.model, provider: data.provider },
      });
    }
    if (data.streamingLatencyMs != null) {
      metrics.record(METRIC_NAMES.STREAMING_LATENCY, data.streamingLatencyMs, {
        userId: data.userId,
        traceId,
      });
    }
    metrics.record(METRIC_NAMES.TOTAL_TOKENS, data.totalTokens || 0, {
      userId: data.userId,
      traceId,
      unit: "tokens",
    });
    metrics.record(METRIC_NAMES.ESTIMATED_COST, cost, {
      userId: data.userId,
      traceId,
      unit: "usd",
    });
    tracer.addTimeline(traceId, TIMELINE_EVENTS.LLM, {
      label: `${data.provider}/${data.model}`,
      latencyMs: data.latencyMs,
      tokens: data.totalTokens,
    });
  }

  recordTool(traceId, data) {
    persist.fire(() => persist.createToolTrace({ ...data, traceId }));
    if (data.durationMs != null) {
      metrics.record(METRIC_NAMES.TOOL_DURATION, data.durationMs, {
        userId: data.userId,
        traceId,
        tags: { tool: data.toolName },
      });
    }
    if (data.status === "error") {
      alerts.alertToolFailure({
        userId: data.userId,
        traceId,
        toolName: data.toolName,
        error: data.error,
        retries: data.retries || 0,
      });
    }
    tracer.addTimeline(traceId, TIMELINE_EVENTS.TOOL_CALL, {
      label: data.toolName,
      status: data.status,
      durationMs: data.durationMs,
    });
  }

  recordAgent(traceId, data) {
    persist.fire(() => persist.createAgentTrace({ ...data, traceId }));
    if (data.durationMs != null) {
      metrics.record(METRIC_NAMES.AGENT_DURATION, data.durationMs, {
        userId: data.userId,
        traceId,
        tags: { agent: data.agentType },
      });
    }
    tracer.addTimeline(traceId, TIMELINE_EVENTS.AGENT, {
      label: data.agentType,
      status: data.status,
      orderIndex: data.orderIndex,
    });
  }

  recordWorkflow(traceId, data) {
    persist.fire(() => persist.upsertWorkflowTrace({ ...data, traceId }));
    if (data.durationMs != null) {
      metrics.record(METRIC_NAMES.WORKFLOW_DURATION, data.durationMs, {
        userId: data.userId,
        traceId,
      });
    }
    tracer.addTimeline(traceId, TIMELINE_EVENTS.WORKFLOW, {
      label: data.status || "workflow",
      workflowId: data.workflowId,
      status: data.status,
    });
  }

  recordKnowledge(traceId, data) {
    persist.fire(() => persist.createKnowledgeTrace({ ...data, traceId }));
    if (data.searchLatencyMs != null) {
      metrics.record(METRIC_NAMES.EMBEDDING_LATENCY, data.searchLatencyMs, {
        userId: data.userId,
        traceId,
      });
    }
    if (data.status === "error") {
      alerts.alertEmbeddingFailure({
        userId: data.userId,
        traceId,
        error: data.error,
      });
    }
    tracer.addTimeline(traceId, TIMELINE_EVENTS.KNOWLEDGE_RETRIEVAL, {
      label: "knowledge",
      resultCount: data.resultCount,
      latencyMs: data.searchLatencyMs,
    });
  }

  recordContext(traceId, data) {
    persist.fire(() => persist.createContextTrace({ ...data, traceId }));
    tracer.addTimeline(traceId, TIMELINE_EVENTS.CONTEXT_RETRIEVAL, {
      label: "context",
      usedTokens: data.usedTokens,
      durationMs: data.durationMs,
    });
  }

  recordRepository(traceId, data) {
    persist.fire(() => persist.createRepositoryTrace({ ...data, traceId }));
    if (data.durationMs != null) {
      metrics.record(METRIC_NAMES.REPO_INDEX_TIME, data.durationMs, {
        userId: data.userId,
        traceId,
      });
    }
    if (data.status === "error") {
      alerts.alertRepositoryFailure({
        userId: data.userId,
        traceId,
        projectId: data.projectId,
        error: data.error,
      });
    }
    tracer.addTimeline(traceId, TIMELINE_EVENTS.WORKSPACE_ANALYSIS, {
      label: data.stage || "repository",
      filesProcessed: data.filesProcessed,
      status: data.status,
    });
  }

  recordUserAction(traceId, data) {
    tracer.addTimeline(traceId, TIMELINE_EVENTS.USER_MESSAGE, data);
  }

  resolveTraceForAgent(executionId) {
    return tracer.getByAgentExecution(executionId);
  }

  resolveTraceForWorkflow(executionId) {
    return tracer.getByWorkflowExecution(executionId);
  }

  // ── Query APIs ──────────────────────────────────────────────────────────

  async search(userId, query) {
    return search.searchTraces(userId, query);
  }

  async getTrace(traceId, userId) {
    const detail = await search.getTraceDetail(traceId, userId);
    if (!detail) return null;
    return {
      ...detail,
      spanTree: search.buildSpanTreeFromRows(detail.spans || []),
    };
  }

  async getTimeline(traceId, userId) {
    return timeline.buildTimeline(traceId, userId);
  }

  async getMetrics(userId, hours = 24) {
    return queryCache.getOrSet(
      `dash:${userId}:${hours}`,
      () => metrics.getDashboardMetrics(userId, hours),
      10_000,
    );
  }

  async getAlerts(userId, filters) {
    return alerts.listAlerts(userId, filters);
  }

  async acknowledgeAlert(id, userId) {
    return alerts.acknowledgeAlert(id, userId);
  }

  async resolveAlert(id, userId) {
    return alerts.resolveAlert(id, userId);
  }

  async createReplay(traceId, userId) {
    return replay.createReplayPackage(traceId, userId);
  }

  async getReplay(id, userId) {
    return replay.getReplay(id, userId);
  }

  async listReplays(userId, opts) {
    return replay.listReplays(userId, opts);
  }

  async playReplay(id, userId, opts) {
    return replay.playReplay(id, userId, opts);
  }

  async getLogs(userId, { limit = 100, offset = 0, level } = {}) {
    const where = {
      userId,
      ...(level ? { status: level } : {}),
    };
    const traces = await search.searchTraces(userId, {
      limit,
      offset,
      status: level === "error" ? "error" : undefined,
    });
    const items = [];
    for (const t of traces.items) {
      items.push({
        at: t.startTime,
        level: t.status === "error" ? "error" : "info",
        message: t.error || t.name,
        traceId: t.traceId,
        kind: t.kind,
        durationMs: t.durationMs,
      });
    }
    return { items, total: traces.total };
  }

  async getDashboard(userId, hours = 24) {
    const [metricsDash, recent, openAlerts, errors] = await Promise.all([
      this.getMetrics(userId, hours),
      this.search(userId, { limit: 20 }),
      this.getAlerts(userId, { status: "open", limit: 20 }),
      this.search(userId, { status: "error", limit: 20 }),
    ]);
    return {
      metrics: metricsDash,
      recentTraces: recent.items,
      openAlerts,
      errors: errors.items,
      generatedAt: new Date().toISOString(),
    };
  }

  async exportTrace(traceId, userId) {
    const detail = await this.getTrace(traceId, userId);
    if (!detail) return null;
    persist.fire(() =>
      persist.createAuditLog({
        userId,
        action: "trace.export",
        resource: "ObsTrace",
        resourceId: traceId,
      }),
    );
    return detail;
  }

  async runMaintenance() {
    const [retention, agg] = await Promise.all([
      runRetentionPass(),
      aggregateWindow(1),
    ]);
    return { retention, aggregation: agg };
  }
}

const engine = new ObservabilityEngine();

function initObservability() {
  return engine.init();
}

module.exports = {
  ObservabilityEngine,
  engine,
  initObservability,
  tracer,
  persist,
  metrics,
  alerts,
  replay,
  search,
  timeline,
  TRACE_KIND,
  SPAN_KIND,
  TRACE_STATUS,
  TIMELINE_EVENTS,
  METRIC_NAMES,
};
