const prisma = require("../database/prisma");
const { validateDefinition } = require("./validation/validator");
const { normalizeDefinition } = require("./dag/graph");
const { syncDefinitionToRows, autoLayout } = require("./memory/persist");
const { listBuiltinTemplates } = require("./templates/catalog");
const runtime = require("./engine/runtime");
const { createSchedule } = require("./scheduler");
const { createTrigger, fireTrigger, fireByType } = require("./triggers/manager");
const { NODE_TYPES, TRIGGER_TYPES } = require("./constants");

function emptyDefinition() {
  return {
    nodes: [
      { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 120, y: 200 }, config: {} },
      { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 480, y: 200 }, config: {} },
    ],
    edges: [{ id: "e-start-end", source: "start", target: "end" }],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

async function listWorkflows(userId, { status, q, projectId } = {}) {
  return prisma.workflow.findMany({
    where: {
      userId,
      ...(status ? { status } : {}),
      ...(projectId ? { projectId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { executions: true, triggers: true, schedules: true } },
    },
  });
}

async function getWorkflow(userId, id) {
  const wf = await prisma.workflow.findFirst({
    where: { id, userId },
    include: {
      versions: { orderBy: { version: "desc" }, take: 20 },
      triggers: true,
      schedules: true,
      nodes: true,
      edges: true,
    },
  });
  if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });
  return wf;
}

async function createWorkflow(userId, data) {
  let definition = data.definition ? normalizeDefinition(data.definition) : emptyDefinition();
  if (data.prompt && !data.definition) {
    // Legacy prompt-only: wrap as coordinator node workflow
    definition = {
      nodes: [
        { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 80, y: 180 }, config: {} },
        {
          id: "coord",
          type: NODE_TYPES.COORDINATOR,
          label: "Coordinator",
          position: { x: 300, y: 180 },
          config: { message: "{{inputs.message}}", instructions: data.prompt },
        },
        { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 540, y: 180 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "start", target: "coord" },
        { id: "e2", source: "coord", target: "end" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }

  const validation = validateDefinition(definition);
  if (!validation.ok) {
    throw Object.assign(new Error("Invalid definition"), { status: 400, errors: validation.errors });
  }

  const workflow = await prisma.workflow.create({
    data: {
      name: data.name,
      description: data.description || "",
      prompt: data.prompt || "",
      definition: validation.definition,
      status: data.status || "draft",
      enabled: data.enabled !== false,
      projectId: data.projectId || null,
      tags: data.tags || [],
      variables: data.variables || {},
      secrets: data.secrets || {},
      settings: data.settings || {},
      permissions: data.permissions || {},
      metadata: data.metadata || {},
      userId,
    },
  });

  await syncDefinitionToRows(workflow.id, validation.definition);
  await prisma.workflowVersion.create({
    data: {
      workflowId: workflow.id,
      version: 1,
      definition: validation.definition,
      variables: data.variables || {},
      changelog: "Initial version",
      publishedBy: userId,
    },
  });

  return getWorkflow(userId, workflow.id);
}

async function updateWorkflow(userId, id, data) {
  const existing = await getWorkflow(userId, id);
  let definition = data.definition != null ? normalizeDefinition(data.definition) : existing.definition;
  if (data.definition) {
    const validation = validateDefinition(definition);
    if (!validation.ok) {
      throw Object.assign(new Error("Invalid definition"), { status: 400, errors: validation.errors });
    }
    definition = validation.definition;
  }

  const bumpVersion = Boolean(data.definition || data.publish);
  const nextVersion = bumpVersion ? existing.version + (data.definition ? 1 : 0) : existing.version;

  const workflow = await prisma.workflow.update({
    where: { id },
    data: {
      name: data.name ?? existing.name,
      description: data.description ?? existing.description,
      prompt: data.prompt ?? existing.prompt,
      definition,
      enabled: data.enabled ?? existing.enabled,
      projectId: data.projectId !== undefined ? data.projectId : existing.projectId,
      tags: data.tags ?? existing.tags,
      variables: data.variables ?? existing.variables,
      secrets: data.secrets ?? existing.secrets,
      settings: data.settings ?? existing.settings,
      permissions: data.permissions ?? existing.permissions,
      metadata: data.metadata ?? existing.metadata,
      status: data.publish ? "published" : data.status ?? existing.status,
      publishedAt: data.publish ? new Date() : existing.publishedAt,
      version: data.definition ? nextVersion : existing.version,
    },
  });

  if (data.definition) {
    await syncDefinitionToRows(id, definition);
    await prisma.workflowVersion.create({
      data: {
        workflowId: id,
        version: workflow.version,
        definition,
        variables: workflow.variables,
        changelog: data.changelog || `Version ${workflow.version}`,
        publishedBy: userId,
      },
    });
  }

  return getWorkflow(userId, id);
}

async function deleteWorkflow(userId, id) {
  const existing = await prisma.workflow.findFirst({ where: { id, userId } });
  if (!existing) throw Object.assign(new Error("Workflow not found"), { status: 404 });
  await prisma.workflow.delete({ where: { id } });
  return { success: true };
}

async function cloneWorkflow(userId, id, { name } = {}) {
  const src = await getWorkflow(userId, id);
  return createWorkflow(userId, {
    name: name || `${src.name} (copy)`,
    description: src.description,
    prompt: src.prompt,
    definition: src.definition,
    variables: src.variables,
    settings: src.settings,
    tags: src.tags,
    projectId: src.projectId,
    metadata: { ...src.metadata, clonedFromId: src.id },
  });
}

async function publishWorkflow(userId, id) {
  return updateWorkflow(userId, id, { publish: true, status: "published" });
}

async function exportWorkflow(userId, id) {
  const wf = await getWorkflow(userId, id);
  return {
    format: "openclaw-workflow-v1",
    exportedAt: new Date().toISOString(),
    workflow: {
      name: wf.name,
      description: wf.description,
      prompt: wf.prompt,
      definition: wf.definition,
      variables: wf.variables,
      settings: wf.settings,
      tags: wf.tags,
      triggers: wf.triggers.map((t) => ({
        type: t.type,
        name: t.name,
        config: t.config,
        enabled: t.enabled,
      })),
      schedules: wf.schedules.map((s) => ({
        cron: s.cron,
        timezone: s.timezone,
        inputs: s.inputs,
        enabled: s.enabled,
      })),
    },
  };
}

async function importWorkflow(userId, payload) {
  const data = payload.workflow || payload;
  return createWorkflow(userId, {
    name: data.name || "Imported Workflow",
    description: data.description || "",
    prompt: data.prompt || "",
    definition: data.definition,
    variables: data.variables || {},
    settings: data.settings || {},
    tags: data.tags || [],
  });
}

async function validateWorkflow(userId, idOrDefinition) {
  if (typeof idOrDefinition === "string") {
    const wf = await getWorkflow(userId, idOrDefinition);
    return validateDefinition(wf.definition);
  }
  return validateDefinition(idOrDefinition);
}

async function layoutWorkflow(userId, id) {
  const wf = await getWorkflow(userId, id);
  const laid = autoLayout(wf.definition);
  return updateWorkflow(userId, id, { definition: laid, changelog: "Auto layout" });
}

async function listExecutions(userId, { workflowId, status, limit = 50 } = {}) {
  return prisma.workflowExecution.findMany({
    where: {
      userId,
      ...(workflowId ? { workflowId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(limit) || 50, 200),
    include: {
      workflow: { select: { id: true, name: true } },
      _count: { select: { nodes: true, artifacts: true } },
    },
  });
}

async function getExecution(userId, id) {
  const exec = await prisma.workflowExecution.findFirst({
    where: { id, userId },
    include: {
      workflow: { select: { id: true, name: true, definition: true } },
      nodes: { orderBy: { createdAt: "asc" } },
      artifacts: { orderBy: { createdAt: "desc" } },
      checkpoints: { orderBy: { createdAt: "desc" }, take: 20 },
      metricsLog: { orderBy: { recordedAt: "desc" }, take: 100 },
    },
  });
  if (!exec) throw Object.assign(new Error("Execution not found"), { status: 404 });
  return exec;
}

async function getMetrics(userId, workflowId) {
  const wf = await prisma.workflow.findFirst({ where: { id: workflowId, userId } });
  if (!wf) throw Object.assign(new Error("Workflow not found"), { status: 404 });

  const [executions, metrics] = await Promise.all([
    prisma.workflowExecution.groupBy({
      by: ["status"],
      where: { workflowId, userId },
      _count: true,
    }),
    prisma.workflowMetric.findMany({
      where: { workflowId },
      orderBy: { recordedAt: "desc" },
      take: 200,
    }),
  ]);

  const recent = await prisma.workflowExecution.findMany({
    where: { workflowId, userId, durationMs: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { durationMs: true, status: true, createdAt: true },
  });

  const durations = recent.map((r) => r.durationMs).filter(Boolean);
  const avgLatency = durations.length
    ? durations.reduce((a, b) => a + b, 0) / durations.length
    : 0;

  return {
    workflowId,
    byStatus: Object.fromEntries(executions.map((e) => [e.status, e._count])),
    avgLatencyMs: Math.round(avgLatency),
    runCount: wf.runCount,
    lastRunAt: wf.lastRunAt,
    metrics,
  };
}

async function listTemplates(userId) {
  const builtins = listBuiltinTemplates();
  const custom = await prisma.workflowTemplate.findMany({
    where: {
      OR: [{ isBuiltin: true }, { userId }],
    },
    orderBy: { updatedAt: "desc" },
  });
  return { builtins, custom };
}

async function createTemplate(userId, data) {
  const validation = validateDefinition(data.definition || emptyDefinition());
  if (!validation.ok) {
    throw Object.assign(new Error("Invalid template definition"), {
      status: 400,
      errors: validation.errors,
    });
  }
  return prisma.workflowTemplate.create({
    data: {
      name: data.name,
      description: data.description || "",
      category: data.category || "general",
      definition: validation.definition,
      variables: data.variables || {},
      tags: data.tags || [],
      isBuiltin: false,
      userId,
      metadata: data.metadata || {},
    },
  });
}

async function createFromTemplate(userId, templateId, { name } = {}) {
  let template = listBuiltinTemplates().find((t) => t.id === templateId);
  if (!template) {
    template = await prisma.workflowTemplate.findFirst({
      where: { id: templateId, OR: [{ userId }, { isBuiltin: true }] },
    });
  }
  if (!template) throw Object.assign(new Error("Template not found"), { status: 404 });

  if (template.usageCount != null && !String(template.id).startsWith("builtin-")) {
    await prisma.workflowTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } },
    });
  }

  return createWorkflow(userId, {
    name: name || template.name,
    description: template.description,
    definition: template.definition,
    variables: template.variables,
    tags: template.tags,
  });
}

async function seedBuiltinTemplates() {
  for (const t of listBuiltinTemplates()) {
    const existing = await prisma.workflowTemplate.findFirst({
      where: { name: t.name, isBuiltin: true },
    });
    if (!existing) {
      await prisma.workflowTemplate.create({
        data: {
          name: t.name,
          description: t.description,
          category: t.category,
          definition: t.definition,
          variables: t.variables || {},
          tags: t.tags || [],
          isBuiltin: true,
          userId: null,
        },
      });
    }
  }
}

module.exports = {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  cloneWorkflow,
  publishWorkflow,
  exportWorkflow,
  importWorkflow,
  validateWorkflow,
  layoutWorkflow,
  listExecutions,
  getExecution,
  getMetrics,
  listTemplates,
  createTemplate,
  createFromTemplate,
  seedBuiltinTemplates,
  emptyDefinition,
  startExecution: runtime.startExecution,
  pauseExecution: runtime.pauseExecution,
  resumeExecution: runtime.resumeExecution,
  cancelExecution: runtime.cancelExecution,
  retryExecution: runtime.retryExecution,
  subscribe: runtime.subscribe,
  getQueueStats: runtime.getQueueStats,
  createSchedule,
  createTrigger,
  fireTrigger,
  fireByType,
  NODE_TYPES,
  TRIGGER_TYPES,
};
