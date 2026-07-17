const prisma = require("../database/prisma");

/**
 * Multi-field trace search with permission scoping by userId.
 */
async function searchTraces(userId, query = {}) {
  const {
    q,
    projectId,
    workflowId,
    agent,
    tool,
    model,
    status,
    kind,
    traceId,
    minLatency,
    maxLatency,
    from,
    to,
    limit = 50,
    offset = 0,
  } = query;

  const where = {
    userId,
    ...(traceId ? { traceId } : {}),
    ...(projectId ? { projectId } : {}),
    ...(workflowId ? { workflowId } : {}),
    ...(status ? { status } : {}),
    ...(kind ? { kind } : {}),
    ...(minLatency != null || maxLatency != null
      ? {
          durationMs: {
            ...(minLatency != null ? { gte: Number(minLatency) } : {}),
            ...(maxLatency != null ? { lte: Number(maxLatency) } : {}),
          },
        }
      : {}),
    ...(from || to
      ? {
          startTime: {
            ...(from ? { gte: new Date(from) } : {}),
            ...(to ? { lte: new Date(to) } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { traceId: { contains: q, mode: "insensitive" } },
            { error: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(agent
      ? { agentTraces: { some: { agentType: { equals: agent, mode: "insensitive" } } } }
      : {}),
    ...(tool
      ? { toolTraces: { some: { toolName: { contains: tool, mode: "insensitive" } } } }
      : {}),
    ...(model
      ? { promptTraces: { some: { model: { contains: model, mode: "insensitive" } } } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.obsTrace.findMany({
      where,
      orderBy: { startTime: "desc" },
      take: Math.min(Number(limit) || 50, 200),
      skip: Number(offset) || 0,
      include: {
        _count: {
          select: {
            spans: true,
            promptTraces: true,
            toolTraces: true,
            agentTraces: true,
            alerts: true,
          },
        },
      },
    }),
    prisma.obsTrace.count({ where }),
  ]);

  return { items, total, limit: Number(limit) || 50, offset: Number(offset) || 0 };
}

async function getTraceDetail(traceId, userId) {
  return prisma.obsTrace.findFirst({
    where: { traceId, userId },
    include: {
      spans: { orderBy: { startTime: "asc" } },
      promptTraces: { orderBy: { createdAt: "asc" } },
      toolTraces: { orderBy: { createdAt: "asc" } },
      agentTraces: { orderBy: { orderIndex: "asc" } },
      workflowTraces: true,
      knowledgeTraces: { orderBy: { createdAt: "asc" } },
      contextTraces: { orderBy: { createdAt: "asc" } },
      repositoryTraces: { orderBy: { createdAt: "asc" } },
      metrics: { orderBy: { recordedAt: "desc" }, take: 100 },
      alerts: { orderBy: { createdAt: "desc" }, take: 50 },
      snapshots: { orderBy: { createdAt: "desc" }, take: 5 },
      replays: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
}

function buildSpanTreeFromRows(spans) {
  const nodes = spans.map((s) => ({
    spanId: s.spanId,
    parentSpanId: s.parentSpanId,
    name: s.name,
    kind: s.kind,
    status: s.status,
    durationMs: s.durationMs,
    startTime: s.startTime,
    endTime: s.endTime,
    error: s.error,
    retries: s.retries,
    attributes: s.attributes,
    events: s.events,
    children: [],
  }));
  const byId = new Map(nodes.map((n) => [n.spanId, n]));
  const roots = [];
  for (const n of nodes) {
    if (n.parentSpanId && byId.has(n.parentSpanId)) {
      byId.get(n.parentSpanId).children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

module.exports = {
  searchTraces,
  getTraceDetail,
  buildSpanTreeFromRows,
};
