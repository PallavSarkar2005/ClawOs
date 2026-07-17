/**
 * Impact analysis, circular deps, rename planning, breaking-change analysis.
 */

const { detectCycles } = require("../graphs/builder");
const { detectDuplicates } = require("./dead-code");

function analyzeImpact(repositoryId, target, data) {
  const { deps = [], symbols = [], references = [], files = [] } = data;
  const path = target.path || target;
  const symbolName = target.symbol || target.name;

  const dependents = deps.filter((d) => !d.isExternal && d.toPath === path).map((d) => d.fromPath);
  const dependencies = deps.filter((d) => !d.isExternal && d.fromPath === path).map((d) => d.toPath);

  let symbolRefs = [];
  if (symbolName) {
    symbolRefs = references
      .filter((r) => r.name === symbolName || r.toSymbol?.name === symbolName)
      .map((r) => ({
        file: r.file?.path || r.context,
        line: r.line,
        kind: r.kind,
      }));
  }

  const blastRadius = new Set([...dependents]);
  // 2-hop
  for (const dep of dependents) {
    for (const d of deps.filter((x) => !x.isExternal && x.toPath === dep)) {
      blastRadius.add(d.fromPath);
    }
  }

  return {
    target: { path, symbol: symbolName },
    directDependents: dependents,
    dependencies,
    symbolReferences: symbolRefs,
    blastRadius: [...blastRadius],
    risk: blastRadius.size > 20 ? "high" : blastRadius.size > 5 ? "medium" : "low",
    breakingChange: {
      wouldBreak: blastRadius.size,
      affectedFiles: [...blastRadius].slice(0, 100),
      recommendation:
        blastRadius.size > 10
          ? "Prefer additive changes; deprecate before removing."
          : "Safe to refactor with reference updates.",
    },
  };
}

function planRename(symbolName, newName, data) {
  const { symbols = [], references = [] } = data;
  const defs = symbols.filter((s) => s.name === symbolName);
  const refs = references.filter((r) => r.name === symbolName);
  const edits = [];

  for (const d of defs) {
    edits.push({
      path: d.filePath || d.file?.path,
      line: d.startLine,
      kind: "definition",
      oldText: symbolName,
      newText: newName,
    });
  }
  for (const r of refs) {
    edits.push({
      path: r.file?.path || r.context,
      line: r.line,
      kind: "reference",
      oldText: symbolName,
      newText: newName,
    });
  }

  return {
    symbolName,
    newName,
    definitionCount: defs.length,
    referenceCount: refs.length,
    edits: edits.slice(0, 500),
    safe: defs.length > 0 && edits.length > 0,
  };
}

function findCircularDependencies(deps) {
  const edges = deps.filter((d) => !d.isExternal).map((d) => ({ from: d.fromPath, to: d.toPath }));
  return detectCycles(edges);
}

function architectureViolations(deps, layers) {
  const violations = [];
  const layerOf = (path) => {
    for (const l of layers || []) {
      if (l.files?.includes(path)) return l.name;
    }
    return null;
  };
  for (const d of deps.filter((x) => !x.isExternal)) {
    const from = layerOf(d.fromPath);
    const to = layerOf(d.toPath);
    if (from === "ui" && to === "database") {
      violations.push({ type: "ui_to_db", from: d.fromPath, to: d.toPath });
    }
    if (from === "database" && to === "ui") {
      violations.push({ type: "db_to_ui", from: d.fromPath, to: d.toPath });
    }
  }
  return violations;
}

module.exports = {
  analyzeImpact,
  planRename,
  findCircularDependencies,
  architectureViolations,
  detectDuplicates,
};
