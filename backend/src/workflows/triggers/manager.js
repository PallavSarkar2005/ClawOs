const crypto = require("crypto");
const prisma = require("../../database/prisma");
const { TRIGGER_TYPES } = require("../constants");
const { startExecution } = require("../engine/runtime");

async function createTrigger(workflowId, userId, data) {
  const workflow = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!workflow) throw Object.assign(new Error("Workflow not found"), { status: 404 });

  const type = data.type || TRIGGER_TYPES.MANUAL;
  const webhookSecret =
    type === TRIGGER_TYPES.WEBHOOK
      ? data.webhookSecret || crypto.randomBytes(24).toString("hex")
      : null;

  return prisma.workflowTrigger.create({
    data: {
      workflowId,
      type,
      name: data.name || type,
      enabled: data.enabled !== false,
      config: data.config || {},
      webhookSecret,
    },
  });
}

async function fireTrigger(triggerId, payload = {}, { secret } = {}) {
  const trigger = await prisma.workflowTrigger.findUnique({
    where: { id: triggerId },
    include: { workflow: true },
  });
  if (!trigger || !trigger.enabled) {
    throw Object.assign(new Error("Trigger not found or disabled"), { status: 404 });
  }
  if (!trigger.workflow.enabled) {
    throw Object.assign(new Error("Workflow disabled"), { status: 400 });
  }
  if (trigger.webhookSecret && secret !== trigger.webhookSecret) {
    throw Object.assign(new Error("Invalid webhook secret"), { status: 401 });
  }

  await prisma.workflowTrigger.update({
    where: { id: triggerId },
    data: { lastFiredAt: new Date(), fireCount: { increment: 1 } },
  });

  return startExecution({
    workflowId: trigger.workflowId,
    userId: trigger.workflow.userId,
    inputs: payload.inputs || payload.body || payload,
    triggerType: trigger.type,
    triggerData: {
      triggerId,
      webhookBody: payload.body ?? payload,
      webhookHeaders: payload.headers || {},
      ...payload,
    },
    projectId: trigger.workflow.projectId,
  });
}

async function fireByType(userId, type, match = {}, payload = {}) {
  const triggers = await prisma.workflowTrigger.findMany({
    where: {
      type,
      enabled: true,
      workflow: { userId, enabled: true },
    },
    include: { workflow: true },
  });

  const fired = [];
  for (const t of triggers) {
    const cfg = t.config || {};
    let ok = true;
    if (match.projectId && cfg.projectId && cfg.projectId !== match.projectId) ok = false;
    if (match.path && cfg.pathPattern) {
      const re = new RegExp(cfg.pathPattern);
      if (!re.test(match.path)) ok = false;
    }
    if (match.repositoryId && cfg.repositoryId && cfg.repositoryId !== match.repositoryId) ok = false;
    if (!ok) continue;
    const exec = await startExecution({
      workflowId: t.workflowId,
      userId,
      inputs: payload.inputs || payload,
      triggerType: type,
      triggerData: { triggerId: t.id, match, ...payload },
      projectId: match.projectId || t.workflow.projectId,
    });
    await prisma.workflowTrigger.update({
      where: { id: t.id },
      data: { lastFiredAt: new Date(), fireCount: { increment: 1 } },
    });
    fired.push(exec);
  }
  return fired;
}

module.exports = {
  createTrigger,
  fireTrigger,
  fireByType,
  TRIGGER_TYPES,
};
