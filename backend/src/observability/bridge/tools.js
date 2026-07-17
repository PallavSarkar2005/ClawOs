const { engine, SPAN_KIND, TRACE_STATUS } = require("../engine");

/**
 * Record tool executions into the active observability trace when available.
 */
function onToolStart(record, ctx = {}) {
  const handle =
    (ctx.executionId && engine.resolveTraceForAgent(ctx.executionId)) ||
    (ctx.traceId && engine.tracer.get(ctx.traceId)) ||
    null;
  if (!handle) return null;

  const span = engine.startSpan(handle.traceId, {
    name: `tool.${record.toolId || record.toolName}`,
    kind: SPAN_KIND.TOOL,
    attributes: {
      toolExecutionId: record.id,
      category: record.category,
    },
  });

  engine.recordTool(handle.traceId, {
    spanId: span?.spanId,
    toolExecutionId: record.id,
    toolName: record.toolId || record.toolName,
    category: record.category,
    arguments: record.inputs || record.validatedArgs || {},
    status: "running",
    agentType: record.agentType || ctx.agentType,
    userId: handle.userId || record.userId,
  });

  return { traceId: handle.traceId, spanId: span?.spanId };
}

function onToolFinish(obsHandle, patch, meta = {}) {
  if (!obsHandle?.traceId) return;
  if (obsHandle.spanId) {
    engine.endSpan(obsHandle.traceId, obsHandle.spanId, {
      status: patch.status === "ok" || patch.status === "success" ? TRACE_STATUS.OK : TRACE_STATUS.ERROR,
      error: patch.error,
      retries: patch.retries,
    });
  }
  engine.recordTool(obsHandle.traceId, {
    spanId: obsHandle.spanId,
    toolExecutionId: meta.toolExecutionId || patch.id,
    toolName: meta.toolName || patch.toolName,
    category: meta.category,
    arguments: patch.inputs || meta.arguments || {},
    output: patch.output,
    status: patch.status === "ok" || patch.status === "success" ? "ok" : "error",
    error: patch.error,
    durationMs: patch.durationMs,
    retries: patch.retries || 0,
    cached: patch.cached,
    agentType: meta.agentType,
    userId: meta.userId,
  });
}

module.exports = { onToolStart, onToolFinish };
