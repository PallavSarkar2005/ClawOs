/**
 * Human approval gate — dangerous actions require explicit approval.
 * Everything else may execute automatically.
 */

const prisma = require("../../database/prisma");
const { APPROVAL_KINDS, STREAM_EVENTS } = require("../constants");

const DANGEROUS_COMMAND_RE = [
  /\brm\s+(-[a-zA-Z]*f|-[a-zA-Z]*r)/i,
  /\bdel\s+\/[sq]/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+push\s+-f\b/i,
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bkubectl\s+delete\b/i,
  /\bdocker\s+(system\s+prune|rmi)\b/i,
  /\bformat\s+[a-z]:/i,
  /\bchmod\s+-R\s+777\b/i,
];

const MIGRATION_RE = [
  /\bprisma\s+migrate\b/i,
  /\bknex\s+migrate\b/i,
  /\balembic\s+(upgrade|downgrade)\b/i,
  /\bflyway\b/i,
  /\bsequelize\s+db:migrate\b/i,
];

const DEPLOY_RE = [
  /\b(kubectl|helm)\s+(apply|upgrade|install)\b/i,
  /\b(terraform|pulumi)\s+(apply|up)\b/i,
  /\b(vercel|netlify|fly)\s+deploy\b/i,
  /\bdocker\s+(compose\s+)?(up|push)\b/i,
  /\bnpm\s+publish\b/i,
];

function classifyAction(action, payload = {}) {
  const text = `${action} ${JSON.stringify(payload)}`.toLowerCase();
  const files = payload.files || payload.paths || [];

  if (payload.forcePush || /force.?push/.test(text)) {
    return { kind: APPROVAL_KINDS.FORCE_PUSH, risk: "critical", required: true };
  }
  if (payload.production || DEPLOY_RE.some((re) => re.test(text))) {
    return { kind: APPROVAL_KINDS.PRODUCTION_DEPLOY, risk: "critical", required: true };
  }
  if (MIGRATION_RE.some((re) => re.test(text)) || payload.migration) {
    return { kind: APPROVAL_KINDS.DATABASE_MIGRATION, risk: "high", required: true };
  }
  if (
    payload.delete ||
    /delete.*(file|dir|folder|path)/.test(text) ||
    (Array.isArray(files) && payload.operation === "delete")
  ) {
    return { kind: APPROVAL_KINDS.DELETE_FILES, risk: "high", required: true };
  }
  if (DANGEROUS_COMMAND_RE.some((re) => re.test(text))) {
    return { kind: APPROVAL_KINDS.DANGEROUS_TERMINAL, risk: "critical", required: true };
  }
  if (payload.largeRefactor || (payload.filesChanged && payload.filesChanged > 25)) {
    return { kind: APPROVAL_KINDS.LARGE_REFACTOR, risk: "medium", required: true };
  }
  return { kind: null, risk: "low", required: false };
}

async function requestApproval({
  userId,
  sessionId = null,
  action,
  description,
  payload = {},
  emit,
  expiresInMs = 24 * 60 * 60 * 1000,
}) {
  const classification = classifyAction(action, payload);
  if (!classification.required) {
    return { required: false, allowed: true, classification };
  }

  const row = await prisma.autonomyApproval.create({
    data: {
      userId,
      sessionId,
      kind: classification.kind,
      action: String(action).slice(0, 500),
      description: String(description || action).slice(0, 4000),
      payload,
      risk: classification.risk,
      status: "pending",
      expiresAt: new Date(Date.now() + expiresInMs),
    },
  });

  emit?.(STREAM_EVENTS.APPROVAL_REQUIRED, {
    approvalId: row.id,
    kind: row.kind,
    action: row.action,
    risk: row.risk,
    description: row.description,
  });

  return { required: true, allowed: false, approval: row, classification };
}

async function resolveApproval(approvalId, userId, { approve, note } = {}) {
  const row = await prisma.autonomyApproval.findFirst({
    where: { id: approvalId, userId },
  });
  if (!row) {
    const err = new Error("Approval not found");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (row.status !== "pending") {
    const err = new Error(`Approval already ${row.status}`);
    err.code = "CONFLICT";
    throw err;
  }
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await prisma.autonomyApproval.update({
      where: { id: approvalId },
      data: { status: "expired", decidedAt: new Date() },
    });
    const err = new Error("Approval expired");
    err.code = "EXPIRED";
    throw err;
  }

  return prisma.autonomyApproval.update({
    where: { id: approvalId },
    data: {
      status: approve ? "approved" : "rejected",
      decidedBy: userId,
      decisionNote: note || null,
      decidedAt: new Date(),
    },
  });
}

async function isApproved(approvalId) {
  const row = await prisma.autonomyApproval.findUnique({ where: { id: approvalId } });
  return row?.status === "approved";
}

async function waitForApproval(approvalId, { timeoutMs = 3_600_000, pollMs = 2000, signal } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) {
      const err = new Error("Cancelled while waiting for approval");
      err.code = "CANCELLED";
      throw err;
    }
    const row = await prisma.autonomyApproval.findUnique({ where: { id: approvalId } });
    if (!row) {
      const err = new Error("Approval missing");
      err.code = "NOT_FOUND";
      throw err;
    }
    if (row.status === "approved") return row;
    if (row.status === "rejected" || row.status === "expired") {
      const err = new Error(`Approval ${row.status}`);
      err.code = "APPROVAL_DENIED";
      err.approval = row;
      throw err;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  const err = new Error("Approval wait timed out");
  err.code = "TIMEOUT";
  throw err;
}

async function listApprovals(userId, filters = {}) {
  const where = { userId };
  if (filters.status) where.status = filters.status;
  if (filters.sessionId) where.sessionId = filters.sessionId;
  if (filters.kind) where.kind = filters.kind;
  return prisma.autonomyApproval.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 50, 200),
  });
}

async function gateOrExecute(ctx, action, description, payload, executeFn) {
  const result = await requestApproval({
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    action,
    description,
    payload,
    emit: ctx.emit,
  });
  if (!result.required) {
    return executeFn();
  }
  if (ctx.autoWaitApproval) {
    await waitForApproval(result.approval.id, {
      signal: ctx.signal,
      timeoutMs: ctx.approvalTimeoutMs || 3_600_000,
    });
    ctx.emit?.(STREAM_EVENTS.APPROVAL_RESOLVED, {
      approvalId: result.approval.id,
      status: "approved",
    });
    return executeFn();
  }
  return { pendingApproval: true, approval: result.approval };
}

module.exports = {
  APPROVAL_KINDS,
  classifyAction,
  requestApproval,
  resolveApproval,
  isApproved,
  waitForApproval,
  listApprovals,
  gateOrExecute,
};
