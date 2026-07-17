const { engine, SPAN_KIND, TRACE_STATUS, TRACE_KIND } = require("../engine");

/**
 * Record repository indexing / workspace intelligence into observability.
 */
function beginIndex({ projectId, ownerId, repositoryId, jobId }) {
  const handle = engine.startExecutionTrace({
    kind: TRACE_KIND.REPOSITORY,
    name: "repository.index",
    userId: ownerId,
    projectId,
    attributes: { repositoryId, jobId },
  });
  const span = engine.startSpan(handle.traceId, {
    name: "repository.index",
    kind: SPAN_KIND.REPOSITORY,
  });
  engine.recordRepository(handle.traceId, {
    spanId: span?.spanId,
    repositoryId,
    projectId,
    jobId,
    stage: "started",
    status: "running",
    userId: ownerId,
  });
  return { traceId: handle.traceId, spanId: span?.spanId };
}

function progressIndex(obsHandle, data = {}) {
  if (!obsHandle?.traceId) return;
  engine.recordRepository(obsHandle.traceId, {
    spanId: obsHandle.spanId,
    repositoryId: data.repositoryId,
    projectId: data.projectId,
    jobId: data.jobId,
    stage: data.stage || "indexing",
    filesProcessed: data.filesProcessed || 0,
    filesTotal: data.filesTotal || 0,
    symbolsIndexed: data.symbolsIndexed || 0,
    dependencyUpdates: data.dependencyUpdates || 0,
    architectureChanges: data.architectureChanges || [],
    health: data.health || {},
    status: "running",
    userId: data.userId,
  });
}

function endIndex(obsHandle, data = {}) {
  if (!obsHandle?.traceId) return;
  if (obsHandle.spanId) {
    engine.endSpan(obsHandle.traceId, obsHandle.spanId, {
      status: data.error ? TRACE_STATUS.ERROR : TRACE_STATUS.OK,
      error: data.error,
    });
  }
  engine.recordRepository(obsHandle.traceId, {
    spanId: obsHandle.spanId,
    repositoryId: data.repositoryId,
    projectId: data.projectId,
    jobId: data.jobId,
    stage: data.stage || (data.error ? "failed" : "completed"),
    filesProcessed: data.filesProcessed || 0,
    filesTotal: data.filesTotal || 0,
    symbolsIndexed: data.symbolsIndexed || 0,
    dependencyUpdates: data.dependencyUpdates || 0,
    architectureChanges: data.architectureChanges || [],
    health: data.health || {},
    durationMs: data.durationMs,
    status: data.error ? "error" : "ok",
    error: data.error,
    userId: data.userId,
  });
  engine.endExecutionTrace(obsHandle.traceId, {
    status: data.error ? TRACE_STATUS.ERROR : TRACE_STATUS.OK,
    error: data.error,
  });
}

module.exports = { beginIndex, progressIndex, endIndex };
