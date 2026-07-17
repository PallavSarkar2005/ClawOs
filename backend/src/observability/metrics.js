const prisma = require("../database/prisma");
const persist = require("./persist");
const { METRIC_NAMES } = require("./constants");

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function record(name, value, opts = {}) {
  persist.fire(() =>
    persist.createMetric({
      name,
      value,
      unit: opts.unit || "ms",
      userId: opts.userId || null,
      traceId: opts.traceId || null,
      tags: opts.tags || {},
    }),
  );
}

async function collectLatencyStats(userId, { since, namePrefix } = {}) {
  const where = {
    ...(userId ? { userId } : {}),
    ...(since ? { startTime: { gte: since } } : {}),
    durationMs: { not: null },
  };
  const traces = await prisma.obsTrace.findMany({
    where,
    select: { durationMs: true, status: true, kind: true, retries: true },
    take: 5000,
    orderBy: { startTime: "desc" },
  });

  const durations = traces
    .map((t) => t.durationMs)
    .filter((d) => typeof d === "number")
    .sort((a, b) => a - b);

  const total = traces.length || 1;
  const ok = traces.filter((t) => t.status === "ok").length;
  const failed = traces.filter((t) => t.status === "error").length;
  const withRetries = traces.filter((t) => (t.retries || 0) > 0).length;
  const sum = durations.reduce((a, b) => a + b, 0);

  return {
    count: traces.length,
    successRate: ok / total,
    failureRate: failed / total,
    retryRate: withRetries / total,
    avgLatencyMs: durations.length ? sum / durations.length : 0,
    p95LatencyMs: percentile(durations, 95),
    p99LatencyMs: percentile(durations, 99),
    minLatencyMs: durations[0] || 0,
    maxLatencyMs: durations[durations.length - 1] || 0,
  };
}

async function collectDomainMetrics(userId, since) {
  const sinceFilter = since ? { gte: since } : undefined;

  const [toolTraces, agentTraces, workflowTraces, prompts, repoTraces, knowledgeTraces] =
    await Promise.all([
      prisma.obsToolTrace.findMany({
        where: { trace: { userId }, ...(sinceFilter ? { createdAt: sinceFilter } : {}) },
        select: { durationMs: true, status: true, toolName: true },
        take: 5000,
      }),
      prisma.obsAgentTrace.findMany({
        where: { trace: { userId }, ...(sinceFilter ? { createdAt: sinceFilter } : {}) },
        select: { durationMs: true, status: true, agentType: true },
        take: 5000,
      }),
      prisma.obsWorkflowTrace.findMany({
        where: { trace: { userId }, ...(sinceFilter ? { createdAt: sinceFilter } : {}) },
        select: { durationMs: true, status: true },
        take: 2000,
      }),
      prisma.obsPromptTrace.findMany({
        where: { trace: { userId }, ...(sinceFilter ? { createdAt: sinceFilter } : {}) },
        select: {
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          estimatedCost: true,
          latencyMs: true,
          streamingLatencyMs: true,
          model: true,
          provider: true,
          createdAt: true,
        },
        take: 5000,
      }),
      prisma.obsRepositoryTrace.findMany({
        where: { trace: { userId }, ...(sinceFilter ? { createdAt: sinceFilter } : {}) },
        select: { durationMs: true, status: true },
        take: 1000,
      }),
      prisma.obsKnowledgeTrace.findMany({
        where: { trace: { userId }, ...(sinceFilter ? { createdAt: sinceFilter } : {}) },
        select: { searchLatencyMs: true, status: true },
        take: 2000,
      }),
    ]);

  const toolDurations = toolTraces.map((t) => t.durationMs).filter(Boolean).sort((a, b) => a - b);
  const agentDurations = agentTraces.map((t) => t.durationMs).filter(Boolean).sort((a, b) => a - b);
  const wfDurations = workflowTraces.map((t) => t.durationMs).filter(Boolean).sort((a, b) => a - b);
  const repoDurations = repoTraces.map((t) => t.durationMs).filter(Boolean).sort((a, b) => a - b);
  const embedLatencies = knowledgeTraces
    .map((t) => t.searchLatencyMs)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const totalTokens = prompts.reduce((a, p) => a + (p.totalTokens || 0), 0);
  const totalCost = prompts.reduce((a, p) => a + (p.estimatedCost || 0), 0);
  const promptLatencies = prompts.map((p) => p.latencyMs).filter(Boolean).sort((a, b) => a - b);
  const streamLatencies = prompts
    .map((p) => p.streamingLatencyMs)
    .filter(Boolean)
    .sort((a, b) => a - b);

  const modelUsage = {};
  const providerUsage = {};
  for (const p of prompts) {
    if (p.model) modelUsage[p.model] = (modelUsage[p.model] || 0) + 1;
    if (p.provider) providerUsage[p.provider] = (providerUsage[p.provider] || 0) + 1;
  }

  // RPM over last minute of prompt samples
  const oneMinAgo = Date.now() - 60_000;
  const rpm = prompts.filter((p) => new Date(p.createdAt).getTime() >= oneMinAgo).length;

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

  return {
    tool: {
      count: toolTraces.length,
      avgDurationMs: avg(toolDurations),
      p95DurationMs: percentile(toolDurations, 95),
      failureRate:
        toolTraces.length > 0
          ? toolTraces.filter((t) => t.status === "error").length / toolTraces.length
          : 0,
      byTool: summarizeBy(toolTraces, "toolName"),
    },
    agent: {
      count: agentTraces.length,
      avgDurationMs: avg(agentDurations),
      p95DurationMs: percentile(agentDurations, 95),
      byAgent: summarizeBy(agentTraces, "agentType"),
    },
    workflow: {
      count: workflowTraces.length,
      avgDurationMs: avg(wfDurations),
      p95DurationMs: percentile(wfDurations, 95),
      failureRate:
        workflowTraces.length > 0
          ? workflowTraces.filter((t) => t.status === "error").length / workflowTraces.length
          : 0,
    },
    llm: {
      promptCount: prompts.length,
      totalTokens,
      promptTokens: prompts.reduce((a, p) => a + (p.promptTokens || 0), 0),
      completionTokens: prompts.reduce((a, p) => a + (p.completionTokens || 0), 0),
      estimatedCost: totalCost,
      avgLatencyMs: avg(promptLatencies),
      p95LatencyMs: percentile(promptLatencies, 95),
      avgStreamingLatencyMs: avg(streamLatencies),
      requestsPerMinute: rpm,
      modelUsage,
      providerUsage,
    },
    repository: {
      count: repoTraces.length,
      avgIndexMs: avg(repoDurations),
      p95IndexMs: percentile(repoDurations, 95),
    },
    knowledge: {
      count: knowledgeTraces.length,
      avgSearchLatencyMs: avg(embedLatencies),
      p95SearchLatencyMs: percentile(embedLatencies, 95),
    },
  };
}

function summarizeBy(rows, key) {
  const map = {};
  for (const r of rows) {
    const k = r[key] || "unknown";
    if (!map[k]) map[k] = { count: 0, failures: 0, totalDuration: 0 };
    map[k].count += 1;
    if (r.status === "error") map[k].failures += 1;
    map[k].totalDuration += r.durationMs || 0;
  }
  for (const v of Object.values(map)) {
    v.avgDurationMs = v.count ? v.totalDuration / v.count : 0;
    delete v.totalDuration;
  }
  return map;
}

async function getDashboardMetrics(userId, hours = 24) {
  const since = new Date(Date.now() - hours * 3600_000);
  const [latency, domain, recentMetrics] = await Promise.all([
    collectLatencyStats(userId, { since }),
    collectDomainMetrics(userId, since),
    prisma.obsMetric.findMany({
      where: { userId, recordedAt: { gte: since } },
      orderBy: { recordedAt: "desc" },
      take: 200,
    }),
  ]);

  return {
    windowHours: hours,
    since: since.toISOString(),
    latency,
    domain,
    recent: recentMetrics,
    named: {
      [METRIC_NAMES.SUCCESS_RATE]: latency.successRate,
      [METRIC_NAMES.FAILURE_RATE]: latency.failureRate,
      [METRIC_NAMES.RETRY_RATE]: latency.retryRate,
      [METRIC_NAMES.AVG_LATENCY]: latency.avgLatencyMs,
      [METRIC_NAMES.P95_LATENCY]: latency.p95LatencyMs,
      [METRIC_NAMES.P99_LATENCY]: latency.p99LatencyMs,
      [METRIC_NAMES.TOOL_DURATION]: domain.tool.avgDurationMs,
      [METRIC_NAMES.AGENT_DURATION]: domain.agent.avgDurationMs,
      [METRIC_NAMES.WORKFLOW_DURATION]: domain.workflow.avgDurationMs,
      [METRIC_NAMES.REPO_INDEX_TIME]: domain.repository.avgIndexMs,
      [METRIC_NAMES.EMBEDDING_LATENCY]: domain.knowledge.avgSearchLatencyMs,
      [METRIC_NAMES.TOTAL_TOKENS]: domain.llm.totalTokens,
      [METRIC_NAMES.ESTIMATED_COST]: domain.llm.estimatedCost,
      [METRIC_NAMES.REQUESTS_PER_MINUTE]: domain.llm.requestsPerMinute,
    },
  };
}

module.exports = {
  record,
  percentile,
  collectLatencyStats,
  collectDomainMetrics,
  getDashboardMetrics,
};
