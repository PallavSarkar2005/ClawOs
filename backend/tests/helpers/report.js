/**
 * Test reporting helpers — summary, performance, and diagnostics.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPORT_DIR = path.resolve(__dirname, "../reports");

const metrics = {
  startedAt: Date.now(),
  suites: [],
  performance: [],
  failures: [],
};

function ensureReportDir() {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

function recordSuite(name, { passed, failed, durationMs }) {
  metrics.suites.push({ name, passed, failed, durationMs, at: new Date().toISOString() });
}

function recordPerformance(name, durationMs, meta = {}) {
  metrics.performance.push({ name, durationMs, ...meta, at: new Date().toISOString() });
}

function recordFailure(name, error) {
  metrics.failures.push({
    name,
    message: error?.message || String(error),
    stack: error?.stack || null,
    at: new Date().toISOString(),
  });
}

function writeReports() {
  ensureReportDir();
  const summary = {
    startedAt: new Date(metrics.startedAt).toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: Date.now() - metrics.startedAt,
    suites: metrics.suites,
    performance: metrics.performance,
    failures: metrics.failures,
    totals: {
      suites: metrics.suites.length,
      passed: metrics.suites.reduce((s, x) => s + (x.passed || 0), 0),
      failed: metrics.suites.reduce((s, x) => s + (x.failed || 0), 0) + metrics.failures.length,
    },
  };

  fs.writeFileSync(
    path.join(REPORT_DIR, "integration-summary.json"),
    JSON.stringify(summary, null, 2),
  );
  fs.writeFileSync(
    path.join(REPORT_DIR, "performance-report.json"),
    JSON.stringify({ entries: metrics.performance }, null, 2),
  );

  const md = [
    "# OpenClaw Integration Test Summary",
    "",
    `- Duration: ${summary.durationMs}ms`,
    `- Suites: ${summary.totals.suites}`,
    `- Passed assertions (tracked): ${summary.totals.passed}`,
    `- Failures: ${summary.totals.failed}`,
    "",
    "## Performance",
    ...metrics.performance.map((p) => `- ${p.name}: ${p.durationMs}ms`),
    "",
    "## Failures",
    ...(metrics.failures.length
      ? metrics.failures.map((f) => `- **${f.name}**: ${f.message}`)
      : ["- none"]),
    "",
  ].join("\n");

  fs.writeFileSync(path.join(REPORT_DIR, "test-summary.md"), md);
  return summary;
}

module.exports = {
  recordSuite,
  recordPerformance,
  recordFailure,
  writeReports,
  REPORT_DIR,
};
