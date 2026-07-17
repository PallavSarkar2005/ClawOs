const prisma = require("../database/prisma");
const persist = require("./persist");
const { METRIC_NAMES } = require("./constants");
const { percentile } = require("./metrics");

/**
 * Background aggregation of latency/token metrics into ObsMetric rows.
 */
async function aggregateWindow(hours = 1) {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hours * 3600_000);

  const users = await prisma.obsTrace.findMany({
    where: { startTime: { gte: windowStart }, userId: { not: null } },
    select: { userId: true },
    distinct: ["userId"],
  });

  let written = 0;
  for (const { userId } of users) {
    if (!userId) continue;
    const traces = await prisma.obsTrace.findMany({
      where: { userId, startTime: { gte: windowStart, lt: windowEnd }, durationMs: { not: null } },
      select: { durationMs: true, status: true, retries: true },
    });
    if (!traces.length) continue;

    const durations = traces.map((t) => t.durationMs).sort((a, b) => a - b);
    const total = traces.length;
    const ok = traces.filter((t) => t.status === "ok").length;
    const failed = traces.filter((t) => t.status === "error").length;
    const retried = traces.filter((t) => (t.retries || 0) > 0).length;
    const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

    const metrics = [
      { name: METRIC_NAMES.SUCCESS_RATE, value: ok / total, unit: "ratio" },
      { name: METRIC_NAMES.FAILURE_RATE, value: failed / total, unit: "ratio" },
      { name: METRIC_NAMES.RETRY_RATE, value: retried / total, unit: "ratio" },
      { name: METRIC_NAMES.AVG_LATENCY, value: avg, unit: "ms" },
      { name: METRIC_NAMES.P95_LATENCY, value: percentile(durations, 95), unit: "ms" },
      { name: METRIC_NAMES.P99_LATENCY, value: percentile(durations, 99), unit: "ms" },
    ];

    for (const m of metrics) {
      await persist.createMetric({
        userId,
        name: m.name,
        value: m.value,
        unit: m.unit,
        windowStart,
        windowEnd,
        aggregated: true,
        tags: { hours },
      });
      written += 1;
    }

    const prompts = await prisma.obsPromptTrace.findMany({
      where: { trace: { userId }, createdAt: { gte: windowStart, lt: windowEnd } },
      select: { totalTokens: true, estimatedCost: true },
    });
    if (prompts.length) {
      const tokens = prompts.reduce((a, p) => a + (p.totalTokens || 0), 0);
      const cost = prompts.reduce((a, p) => a + (p.estimatedCost || 0), 0);
      await persist.createMetric({
        userId,
        name: METRIC_NAMES.TOTAL_TOKENS,
        value: tokens,
        unit: "tokens",
        windowStart,
        windowEnd,
        aggregated: true,
      });
      await persist.createMetric({
        userId,
        name: METRIC_NAMES.ESTIMATED_COST,
        value: cost,
        unit: "usd",
        windowStart,
        windowEnd,
        aggregated: true,
      });
      written += 2;
    }
  }

  return { users: users.length, written, windowStart, windowEnd };
}

let timer = null;

function startAggregator({ intervalMs = 5 * 60_000 } = {}) {
  if (timer) return;
  const tick = () => {
    aggregateWindow(1).catch((e) => console.warn("[obs] aggregate:", e.message));
  };
  tick();
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
}

function stopAggregator() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { aggregateWindow, startAggregator, stopAggregator };
