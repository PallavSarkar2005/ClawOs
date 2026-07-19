/**
 * Quality gates — a task/session is complete only when gates pass.
 */

const { QUALITY_THRESHOLDS } = require("../constants");

function evaluateBuild(build) {
  if (!build) return { ok: false, reason: "No build result" };
  const ok = build.status === "passed" || build.status === "success" || build.exitCode === 0;
  return { ok, reason: ok ? "Build passed" : build.stderr || build.error || "Build failed" };
}

function evaluateTests(test) {
  if (!test) return { ok: false, reason: "No test result" };
  const total = (test.passed || 0) + (test.failed || 0);
  const passRate = total === 0 ? (test.status === "passed" ? 1 : 0) : (test.passed || 0) / total;
  const ok =
    (test.status === "passed" || test.status === "success") &&
    (test.failed || 0) === 0 &&
    passRate >= QUALITY_THRESHOLDS.MIN_TEST_PASS_RATE;
  return {
    ok,
    passRate,
    reason: ok ? "Tests passed" : `Tests failed (${test.failed || 0} failures, passRate=${passRate})`,
  };
}

function evaluateReview(review) {
  if (!review) return { ok: false, reason: "No review result" };
  const score = Number(review.score) || 0;
  const critical = Number(review.criticalIssues) || 0;
  const ok =
    score >= QUALITY_THRESHOLDS.REVIEW_SCORE &&
    critical <= QUALITY_THRESHOLDS.MAX_CRITICAL_SECURITY &&
    (review.security == null || review.security >= 0.7);
  return {
    ok,
    score,
    reason: ok
      ? `Review score ${score}`
      : `Review gate failed (score=${score}, critical=${critical})`,
  };
}

function evaluateArchitecture(violations = []) {
  const critical = violations.filter((v) => v.severity === "critical" || v.level === "error");
  const ok = critical.length <= QUALITY_THRESHOLDS.MAX_ARCHITECTURE_VIOLATIONS;
  return {
    ok,
    violations: critical.length,
    reason: ok ? "No architecture violations" : `${critical.length} architecture violations`,
  };
}

function evaluateSession(results = {}) {
  const build = evaluateBuild(results.build);
  const tests = evaluateTests(results.tests);
  const review = evaluateReview(results.review);
  const architecture = evaluateArchitecture(results.architectureViolations || []);

  const gates = { build, tests, review, architecture };
  const ok = build.ok && tests.ok && review.ok && architecture.ok;
  const score =
    (build.ok ? 0.25 : 0) +
    (tests.ok ? 0.3 : 0) +
    (review.ok ? 0.3 : 0) +
    (architecture.ok ? 0.15 : 0);

  return {
    ok,
    score,
    gates,
    summary: Object.values(gates)
      .map((g) => g.reason)
      .join("; "),
  };
}

module.exports = {
  QUALITY_THRESHOLDS,
  evaluateBuild,
  evaluateTests,
  evaluateReview,
  evaluateArchitecture,
  evaluateSession,
};
