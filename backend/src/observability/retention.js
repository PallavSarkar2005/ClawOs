const prisma = require("../database/prisma");
const { RETENTION } = require("./constants");

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 3600_000);
}

/**
 * Retention + light compression: prune old rows, mark old traces compressed.
 */
async function runRetentionPass() {
  const traceCutoff = daysAgo(RETENTION.TRACE_DAYS);
  const metricCutoff = daysAgo(RETENTION.METRIC_DAYS);
  const alertCutoff = daysAgo(RETENTION.ALERT_DAYS);
  const snapshotCutoff = daysAgo(RETENTION.SNAPSHOT_DAYS);
  const compressCutoff = daysAgo(RETENTION.COMPRESS_AFTER_DAYS);

  const [deletedTraces, deletedMetrics, deletedAlerts, deletedSnapshots, compressed] =
    await Promise.all([
      prisma.obsTrace.deleteMany({ where: { startTime: { lt: traceCutoff } } }),
      prisma.obsMetric.deleteMany({ where: { recordedAt: { lt: metricCutoff } } }),
      prisma.obsAlert.deleteMany({
        where: { createdAt: { lt: alertCutoff }, status: "resolved" },
      }),
      prisma.obsExecutionSnapshot.deleteMany({
        where: { createdAt: { lt: snapshotCutoff } },
      }),
      prisma.obsTrace.updateMany({
        where: { startTime: { lt: compressCutoff }, compressed: false },
        data: { compressed: true },
      }),
    ]);

  // Strip bulky timeline from compressed traces (keep attributes lightweight)
  const toSlim = await prisma.obsTrace.findMany({
    where: { compressed: true, startTime: { lt: compressCutoff } },
    select: { id: true, timeline: true },
    take: 100,
  });
  for (const row of toSlim) {
    const tl = Array.isArray(row.timeline) ? row.timeline : [];
    if (tl.length > 50) {
      await prisma.obsTrace.update({
        where: { id: row.id },
        data: { timeline: tl.slice(-50) },
      });
    }
  }

  return {
    deletedTraces: deletedTraces.count,
    deletedMetrics: deletedMetrics.count,
    deletedAlerts: deletedAlerts.count,
    deletedSnapshots: deletedSnapshots.count,
    compressed: compressed.count,
  };
}

module.exports = { runRetentionPass, daysAgo };
