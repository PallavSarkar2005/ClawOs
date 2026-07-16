/**
 * Tool observability — persist metrics, logs, usage, latency, cost.
 * All writes are fire-and-forget so a down DB never blocks tool execution.
 */

const prisma = require("../../database/prisma");

function fire(fn) {
  Promise.resolve()
    .then(fn)
    .catch(() => {});
}

function recordExecutionStart(record) {
  fire(() =>
    prisma.toolExecution.create({
      data: {
        id: record.id,
        toolId: record.toolId,
        toolVersion: record.toolVersion || "1.0.0",
        userId: record.userId || null,
        agentExecutionId: record.executionId || null,
        agentStepId: record.stepId || null,
        agentType: record.agentType || null,
        status: "running",
        inputs: record.inputs || {},
        validatedArgs: record.validatedArgs || {},
        retries: 0,
        startedAt: new Date(),
      },
    }),
  );
  return null;
}

function recordExecutionFinish(id, patch) {
  fire(() =>
    prisma.toolExecution.update({
      where: { id },
      data: {
        status: patch.status,
        output: patch.output ?? undefined,
        error: patch.error || null,
        errorCode: patch.errorCode || null,
        durationMs: patch.durationMs ?? null,
        retries: patch.retries ?? 0,
        cached: Boolean(patch.cached),
        finishedAt: new Date(),
        latencyMs: patch.durationMs ?? null,
        tokenUsage: patch.tokenUsage ?? 0,
        cost: patch.cost ?? 0,
      },
    }),
  );
  return null;
}

function recordLog(executionId, entry) {
  fire(() =>
    prisma.toolLog.create({
      data: {
        executionId,
        toolId: entry.toolId || null,
        level: entry.level || "info",
        message: entry.message || "",
        data: entry.data || {},
      },
    }),
  );
  return null;
}

function recordMetric(toolId, key, value, unit, metadata) {
  fire(() =>
    prisma.toolMetric.create({
      data: {
        toolId,
        key,
        value: Number(value) || 0,
        unit: unit || null,
        metadata: metadata || {},
      },
    }),
  );
  return null;
}

function recordUsage(toolId, userId, durationMs, ok) {
  fire(() =>
    prisma.toolUsage.create({
      data: {
        toolId,
        userId: userId || null,
        durationMs: durationMs ?? 0,
        success: Boolean(ok),
      },
    }),
  );
  return null;
}

function upsertToolRow(tool) {
  fire(() =>
    prisma.tool.upsert({
      where: { id: tool.id },
      create: {
        id: tool.id,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        version: tool.version,
        schema: tool.schema,
        permissions: tool.permissions,
        timeout: tool.timeout,
        retries: tool.retries,
        source: tool.source,
        pluginId: tool.pluginId,
        mcpServerId: tool.mcpServerId,
        enabled: tool.enabled !== false,
        dangerous: Boolean(tool.dangerous),
        metadata: tool.metadata || {},
      },
      update: {
        name: tool.name,
        description: tool.description,
        category: tool.category,
        version: tool.version,
        schema: tool.schema,
        permissions: tool.permissions,
        timeout: tool.timeout,
        retries: tool.retries,
        source: tool.source,
        pluginId: tool.pluginId,
        mcpServerId: tool.mcpServerId,
        enabled: tool.enabled !== false,
        dangerous: Boolean(tool.dangerous),
        metadata: tool.metadata || {},
      },
    }),
  );
  return null;
}

module.exports = {
  recordExecutionStart,
  recordExecutionFinish,
  recordLog,
  recordMetric,
  recordUsage,
  upsertToolRow,
};
