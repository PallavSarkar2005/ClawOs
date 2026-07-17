const { engine, SPAN_KIND, TRACE_STATUS, TRACE_KIND } = require("../engine");

/**
 * Record knowledge retrieval into observability.
 */
function recordRetrieval(result, ctx = {}) {
  const handle =
    (ctx.executionId && engine.resolveTraceForAgent(ctx.executionId)) ||
    (ctx.traceId && engine.tracer.get(ctx.traceId)) ||
    null;

  const chunks = result?.chunks || result?.results || result?.items || [];
  const scores = chunks.map((c) => c.score ?? c.similarity ?? null).filter((s) => s != null);

  let traceId = handle?.traceId;
  let standalone = false;
  if (!traceId) {
    const h = engine.startExecutionTrace({
      kind: TRACE_KIND.KNOWLEDGE,
      name: "knowledge.retrieve",
      userId: ctx.userId,
      projectId: ctx.projectId,
    });
    traceId = h.traceId;
    standalone = true;
  }

  const span = engine.startSpan(traceId, {
    name: "knowledge.retrieve",
    kind: SPAN_KIND.KNOWLEDGE,
  });

  engine.recordKnowledge(traceId, {
    spanId: span?.spanId,
    retrievalId: result?.id || result?.retrievalId,
    query: ctx.query || result?.query,
    chunks: chunks.slice(0, 50).map((c) => ({
      id: c.id,
      content: String(c.content || c.text || "").slice(0, 500),
      score: c.score ?? c.similarity,
      source: c.source || c.documentId,
    })),
    similarityScores: scores,
    graphPath: result?.graphPath || result?.path || [],
    citationRanking: result?.citations || [],
    contextContribution: result?.contribution || {},
    embeddingModel: result?.embeddingModel || ctx.embeddingModel,
    searchLatencyMs: result?.latencyMs || ctx.latencyMs,
    mode: result?.mode || ctx.mode,
    topK: result?.topK || ctx.topK,
    resultCount: chunks.length || result?.resultCount || 0,
    status: result?.error ? "error" : "ok",
    error: result?.error,
    userId: handle?.userId || ctx.userId,
  });

  if (span) {
    engine.endSpan(traceId, span.spanId, {
      status: result?.error ? TRACE_STATUS.ERROR : TRACE_STATUS.OK,
      error: result?.error,
    });
  }
  if (standalone) {
    engine.endExecutionTrace(traceId, {
      status: result?.error ? TRACE_STATUS.ERROR : TRACE_STATUS.OK,
      error: result?.error,
    });
  }
  return traceId;
}

module.exports = { recordRetrieval };
