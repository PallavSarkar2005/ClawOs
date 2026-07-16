/**
 * Tools API — catalog, invoke, MCP, plugins, executions, replay.
 */

const platform = require("../tools");
const prisma = require("../database/prisma");

async function catalog(req, res) {
  platform.registerBuiltins();
  return res.json(platform.registry.catalog());
}

async function listTools(req, res) {
  platform.registerBuiltins();
  const { category, source } = req.query;
  const tools = platform.registry
    .list({ category, source })
    .map((t) => platform.registry.describe(t.id));
  return res.json({ tools, count: tools.length });
}

async function getTool(req, res) {
  platform.registerBuiltins();
  const tool = platform.registry.describe(req.params.id);
  if (!tool) return res.status(404).json({ message: "Tool not found" });
  return res.json(tool);
}

async function invokeTool(req, res) {
  platform.registerBuiltins();
  const toolId = req.params.id || req.body.toolId;
  const args = req.body.arguments || req.body.args || {};
  const result = await platform.executeTool(toolId, args, {
    userId: req.user.id,
    projectId: req.body.projectId || null,
    conversationId: req.body.conversationId || null,
    role: req.user.role || "user",
  });
  return res.status(result.ok ? 200 : 400).json(result);
}

async function parallelInvoke(req, res) {
  platform.registerBuiltins();
  const calls = req.body.calls || [];
  const results = await platform.executeParallel(calls, {
    userId: req.user.id,
    projectId: req.body.projectId || null,
    role: req.user.role || "user",
  });
  return res.json({ results });
}

async function listExecutions(req, res) {
  try {
    const executions = await prisma.toolExecution.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit) || 50, 200),
      include: { logs: { orderBy: { createdAt: "asc" }, take: 50 } },
    });
    return res.json({ executions });
  } catch (e) {
    return res.json({ executions: [], warning: e.message });
  }
}

async function getExecution(req, res) {
  try {
    const execution = await prisma.toolExecution.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: { logs: { orderBy: { createdAt: "asc" } } },
    });
    if (!execution) return res.status(404).json({ message: "Not found" });
    return res.json(execution);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

async function replayExecution(req, res) {
  try {
    const execution = await prisma.toolExecution.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!execution) return res.status(404).json({ message: "Not found" });
    const result = await platform.executeTool(execution.toolId, execution.validatedArgs || execution.inputs || {}, {
      userId: req.user.id,
      role: req.user.role || "user",
      skipCache: true,
    });
    return res.json({ replayOf: execution.id, result });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

async function metrics(req, res) {
  try {
    const rows = await prisma.toolMetric.findMany({
      where: req.query.toolId ? { toolId: String(req.query.toolId) } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const usage = await prisma.toolUsage.groupBy({
      by: ["toolId", "success"],
      _count: true,
      _avg: { durationMs: true },
    });
    return res.json({ metrics: rows, usage });
  } catch (e) {
    return res.json({ metrics: [], usage: [], warning: e.message });
  }
}

async function reloadPlugins(req, res) {
  const plugins = await platform.loadPluginsDir();
  return res.json({ plugins, catalog: platform.registry.catalog() });
}

async function listMcp(req, res) {
  return res.json({ servers: platform.listMcpServers() });
}

async function connectMcp(req, res) {
  try {
    const result = await platform.connectMcpServer(req.body);
    return res.json(result);
  } catch (e) {
    return res.status(400).json({ message: e.message });
  }
}

async function disconnectMcp(req, res) {
  const ok = await platform.disconnectMcpServer(req.params.id);
  return res.json({ disconnected: ok });
}

async function active(req, res) {
  return res.json({ active: platform.getActiveExecutions() });
}

async function cancel(req, res) {
  const ok = platform.cancelExecution(req.params.id);
  return res.json({ cancelled: ok });
}

module.exports = {
  catalog,
  listTools,
  getTool,
  invokeTool,
  parallelInvoke,
  listExecutions,
  getExecution,
  replayExecution,
  metrics,
  reloadPlugins,
  listMcp,
  connectMcp,
  disconnectMcp,
  active,
  cancel,
};
