const { engine, SPAN_KIND, TRACE_STATUS } = require("../engine");

/**
 * Record context engine builds into active traces.
 */
function recordContextBuild(result, ctx = {}) {
  const handle =
    (ctx.executionId && engine.resolveTraceForAgent(ctx.executionId)) ||
    (ctx.traceId && engine.tracer.get(ctx.traceId)) ||
    null;

  const obs = result?.observability || {};
  const traceId = handle?.traceId;

  if (!traceId) {
    // Standalone context session — create short-lived trace
    const standalone = engine.startExecutionTrace({
      kind: "context",
      name: "context.build",
      userId: ctx.userId,
      projectId: ctx.projectId,
      conversationId: ctx.conversationId,
      attributes: { sessionId: obs.sessionId },
    });
    engine.recordContext(standalone.traceId, {
      contextSessionId: obs.sessionId || result?.sessionId,
      query: ctx.query || result?.query,
      sources: obs.bySource || {},
      ranking: obs.ranking || [],
      selected: obs.retrieved || result?.items || [],
      dropped: obs.dropped || [],
      tokenBudget: obs.tokenAllocation?.total,
      usedTokens: obs.usedTokens,
      compressionRatio: obs.compressionRatio,
      durationMs: obs.durationMs,
      reasoningPath: obs.reasoningPath || [],
      userId: ctx.userId,
    });
    engine.endExecutionTrace(standalone.traceId, { status: TRACE_STATUS.OK });
    return standalone.traceId;
  }

  const span = engine.startSpan(traceId, {
    name: "context.build",
    kind: SPAN_KIND.CONTEXT,
  });
  engine.recordContext(traceId, {
    spanId: span?.spanId,
    contextSessionId: obs.sessionId || result?.sessionId,
    query: ctx.query,
    sources: obs.bySource || {},
    ranking: obs.ranking || [],
    selected: obs.retrieved || [],
    dropped: obs.dropped || [],
    tokenBudget: obs.tokenAllocation?.total,
    usedTokens: obs.usedTokens,
    compressionRatio: obs.compressionRatio,
    durationMs: obs.durationMs,
    reasoningPath: obs.reasoningPath || [],
    userId: handle.userId || ctx.userId,
  });
  if (span) engine.endSpan(traceId, span.spanId, { status: TRACE_STATUS.OK });
  return traceId;
}

module.exports = { recordContextBuild };
