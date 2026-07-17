/**
 * Code quality analysis — large files, complexity, coupling, smells, security, tests.
 */

function analyzeQuality(files, symbols, deps, calls = []) {
  const metrics = [];
  const codeFiles = files.filter((f) => !f.isFolder);

  for (const f of codeFiles) {
    const lines = f.lineCount || 0;
    if (lines > 500) {
      metrics.push({
        path: f.path,
        metricType: "large_file",
        value: lines,
        severity: lines > 1000 ? "error" : "warning",
        message: `Large file: ${lines} lines`,
      });
    }
    if ((f.complexity || 0) > 40) {
      metrics.push({
        path: f.path,
        metricType: "high_complexity",
        value: f.complexity,
        severity: f.complexity > 80 ? "error" : "warning",
        message: `High file complexity: ${f.complexity}`,
      });
    }

    const outbound = deps.filter((d) => d.fromPath === f.path && !d.isExternal).length;
    const inbound = deps.filter((d) => d.toPath === f.path && !d.isExternal).length;
    if (outbound > 15) {
      metrics.push({
        path: f.path,
        metricType: "high_coupling",
        value: outbound,
        severity: "warning",
        message: `High outbound coupling: ${outbound} imports`,
      });
    }
    if (inbound > 20) {
      metrics.push({
        path: f.path,
        metricType: "hotspot",
        value: inbound,
        severity: "info",
        message: `Many dependents: ${inbound} files import this`,
      });
    }
    if (outbound > 10 && inbound === 0 && !/index\.(js|ts|tsx)$/i.test(f.path)) {
      metrics.push({
        path: f.path,
        metricType: "low_cohesion",
        value: outbound,
        severity: "info",
        message: "Many imports but no dependents — possible low cohesion",
      });
    }
  }

  for (const s of symbols.filter((x) => x.kind === "function" || x.kind === "method")) {
    const span = (s.endLine || s.startLine) - (s.startLine || 1);
    if (span > 80) {
      metrics.push({
        path: s.filePath,
        symbolName: s.name,
        metricType: "complex_method",
        value: span,
        severity: span > 150 ? "error" : "warning",
        message: `Long method ${s.name}: ~${span} lines`,
      });
    }
  }

  // Security smells (path-based heuristics on indexed content metadata)
  for (const f of codeFiles) {
    const lower = (f.path || "").toLowerCase();
    if (/\.env$|\.pem$|secrets?\.|credentials/i.test(lower)) {
      metrics.push({
        path: f.path,
        metricType: "security",
        value: 1,
        severity: "error",
        message: "Sensitive file in repository",
      });
    }
  }

  // Missing tests
  const testFiles = codeFiles.filter((f) =>
    /\.(test|spec)\.(js|jsx|ts|tsx|py)$|__tests__|\/tests?\//i.test(f.path),
  );
  const sourceFiles = codeFiles.filter(
    (f) =>
      /\.(js|jsx|ts|tsx|py)$/i.test(f.path) &&
      !/\.(test|spec)\./i.test(f.path) &&
      !/node_modules/.test(f.path),
  );
  if (sourceFiles.length > 5 && testFiles.length === 0) {
    metrics.push({
      path: null,
      metricType: "missing_tests",
      value: 0,
      severity: "warning",
      message: `No test files found among ${sourceFiles.length} source files`,
    });
  } else if (sourceFiles.length > 0) {
    const ratio = testFiles.length / sourceFiles.length;
    if (ratio < 0.1) {
      metrics.push({
        path: null,
        metricType: "low_test_coverage_proxy",
        value: ratio,
        severity: "info",
        message: `Low test file ratio: ${(ratio * 100).toFixed(1)}%`,
      });
    }
  }

  // Code smells: duplicate symbol names across files
  const nameCounts = new Map();
  for (const s of symbols.filter((x) => ["function", "class", "component"].includes(x.kind))) {
    if (!nameCounts.has(s.name)) nameCounts.set(s.name, []);
    nameCounts.get(s.name).push(s);
  }
  for (const [name, list] of nameCounts) {
    if (list.length >= 3 && name.length > 3) {
      metrics.push({
        path: list[0].filePath,
        symbolName: name,
        metricType: "duplicate_symbol",
        value: list.length,
        severity: "info",
        message: `Symbol "${name}" defined ${list.length} times`,
        metadata: { paths: list.map((l) => l.filePath) },
      });
    }
  }

  // Performance: huge call fan-out
  const callCounts = new Map();
  for (const c of calls) {
    callCounts.set(c.callee, (callCounts.get(c.callee) || 0) + 1);
  }

  return metrics;
}

module.exports = { analyzeQuality };
