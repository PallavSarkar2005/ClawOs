const prisma = require("../database/prisma");
const persist = require("./persist");
const { ALERT_TYPE, ALERT_SEVERITY, THRESHOLDS } = require("./constants");

async function raise(alert) {
  const row = await persist.createAlert(alert);
  return row;
}

function evaluateAfterTrace(handle, extras = {}) {
  const alerts = [];
  const userId = handle.userId;
  const traceId = handle.traceId;
  const duration = handle.durationMs || 0;

  if (duration >= THRESHOLDS.HIGH_LATENCY_MS) {
    alerts.push({
      type: ALERT_TYPE.HIGH_LATENCY,
      severity: duration >= THRESHOLDS.HIGH_LATENCY_MS * 2 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.WARNING,
      title: "High latency detected",
      message: `Trace ${traceId} completed in ${duration}ms (threshold ${THRESHOLDS.HIGH_LATENCY_MS}ms)`,
      userId,
      traceId,
      metadata: { durationMs: duration },
    });
  }

  if (handle.retries >= THRESHOLDS.RETRY_ALERT) {
    alerts.push({
      type: ALERT_TYPE.REPEATED_RETRIES,
      severity: ALERT_SEVERITY.WARNING,
      title: "Repeated retries",
      message: `Trace ${traceId} retried ${handle.retries} times`,
      userId,
      traceId,
      metadata: { retries: handle.retries },
    });
  }

  if (handle.status === "error" && handle.kind === "workflow") {
    alerts.push({
      type: ALERT_TYPE.FAILED_WORKFLOW,
      severity: ALERT_SEVERITY.ERROR,
      title: "Workflow failed",
      message: handle.error || "Workflow execution failed",
      userId,
      traceId,
      metadata: extras.workflow || {},
    });
  }

  if (extras.tokens >= THRESHOLDS.LARGE_TOKENS) {
    alerts.push({
      type: ALERT_TYPE.LARGE_TOKEN_USAGE,
      severity: ALERT_SEVERITY.WARNING,
      title: "Large token usage",
      message: `Trace used ${extras.tokens} tokens`,
      userId,
      traceId,
      metadata: { tokens: extras.tokens },
    });
  }

  for (const a of alerts) {
    persist.fire(() => raise(a));
  }
  return alerts;
}

function alertToolFailure({ userId, traceId, toolName, error, retries }) {
  persist.fire(() =>
    raise({
      type: ALERT_TYPE.FAILED_TOOL,
      severity: ALERT_SEVERITY.ERROR,
      title: `Tool failed: ${toolName}`,
      message: error || "Tool execution failed",
      userId,
      traceId,
      metadata: { toolName, retries },
    }),
  );
  if (retries >= THRESHOLDS.RETRY_ALERT) {
    persist.fire(() =>
      raise({
        type: ALERT_TYPE.REPEATED_RETRIES,
        severity: ALERT_SEVERITY.WARNING,
        title: `Tool retries: ${toolName}`,
        message: `${toolName} retried ${retries} times`,
        userId,
        traceId,
        metadata: { toolName, retries },
      }),
    );
  }
}

function alertRepositoryFailure({ userId, traceId, projectId, error }) {
  persist.fire(() =>
    raise({
      type: ALERT_TYPE.REPOSITORY_FAILURE,
      severity: ALERT_SEVERITY.ERROR,
      title: "Repository indexing failed",
      message: error || "Repository failure",
      userId,
      traceId,
      metadata: { projectId },
    }),
  );
}

function alertEmbeddingFailure({ userId, traceId, error }) {
  persist.fire(() =>
    raise({
      type: ALERT_TYPE.EMBEDDING_FAILURE,
      severity: ALERT_SEVERITY.ERROR,
      title: "Embedding failure",
      message: error || "Embedding generation failed",
      userId,
      traceId,
      metadata: {},
    }),
  );
}

function alertWorkerFailure({ userId, traceId, worker, error }) {
  persist.fire(() =>
    raise({
      type: ALERT_TYPE.WORKER_FAILURE,
      severity: ALERT_SEVERITY.CRITICAL,
      title: `Worker failure: ${worker}`,
      message: error || "Background worker failed",
      userId,
      traceId,
      metadata: { worker },
    }),
  );
}

async function listAlerts(userId, filters = {}) {
  const where = {
    userId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.severity ? { severity: filters.severity } : {}),
  };
  return prisma.obsAlert.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 500),
    skip: Number(filters.offset) || 0,
  });
}

async function acknowledgeAlert(id, userId) {
  const row = await prisma.obsAlert.findFirst({ where: { id, userId } });
  if (!row) return null;
  return prisma.obsAlert.update({
    where: { id },
    data: { status: "acknowledged", acknowledgedAt: new Date() },
  });
}

async function resolveAlert(id, userId) {
  const row = await prisma.obsAlert.findFirst({ where: { id, userId } });
  if (!row) return null;
  return prisma.obsAlert.update({
    where: { id },
    data: { status: "resolved", resolvedAt: new Date() },
  });
}

module.exports = {
  raise,
  evaluateAfterTrace,
  alertToolFailure,
  alertRepositoryFailure,
  alertEmbeddingFailure,
  alertWorkerFailure,
  listAlerts,
  acknowledgeAlert,
  resolveAlert,
};
