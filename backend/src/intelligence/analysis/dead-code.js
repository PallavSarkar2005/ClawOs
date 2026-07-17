/**
 * Dead code, unused imports, unused files detection from real index data.
 */

function detectDeadCode(symbols, calls, deps) {
  const called = new Set(calls.map((c) => c.callee));
  const exported = new Set(symbols.filter((s) => s.exported).map((s) => s.name));
  const dead = [];

  for (const s of symbols) {
    if (!["function", "class", "component", "hook", "variable"].includes(s.kind)) continue;
    if (s.exported) continue;
    if (called.has(s.name)) continue;
    if (/^(main|index|App|handler|middleware)/i.test(s.name)) continue;
    // Entry-ish files
    if (/^(index|main|app|server)\.(js|ts|tsx|jsx|py)$/i.test((s.filePath || "").split("/").pop() || "")) {
      continue;
    }
    dead.push({
      name: s.name,
      kind: s.kind,
      path: s.filePath,
      line: s.startLine,
      reason: "No references found",
    });
  }
  return dead.slice(0, 200);
}

function detectUnusedImports(files, deps) {
  const unused = [];
  for (const f of files.filter((x) => !x.isFolder)) {
    const imports = Array.isArray(f.imports) ? f.imports : [];
    for (const imp of imports) {
      if (imp.isExternal) continue;
      const used = deps.some(
        (d) => d.fromPath === f.path && (d.specifier === imp.specifier || d.toPath === imp.specifier),
      );
      // Without full AST binding analysis, flag only clearly unresolved relative imports
      if (imp.specifier?.startsWith(".") && !used) {
        unused.push({ path: f.path, specifier: imp.specifier, line: imp.line });
      }
    }
  }
  return unused.slice(0, 100);
}

function detectUnusedFiles(files, deps) {
  const codeFiles = files.filter(
    (f) =>
      !f.isFolder &&
      /\.(js|jsx|ts|tsx|mjs|cjs|py)$/i.test(f.path) &&
      !/(^|\/)index\.(js|ts|tsx)$/i.test(f.path) &&
      !/(^|\/)(main|app|server)\.(js|ts|tsx)$/i.test(f.path) &&
      !/\.(test|spec)\./i.test(f.path),
  );
  const referenced = new Set();
  for (const d of deps) {
    if (!d.isExternal) referenced.add(d.toPath);
  }
  return codeFiles
    .filter((f) => !referenced.has(f.path))
    .filter((f) => {
      const outbound = deps.some((d) => d.fromPath === f.path);
      return outbound; // has imports but nothing imports it
    })
    .map((f) => ({ path: f.path, reason: "No inbound dependencies" }))
    .slice(0, 100);
}

function detectDuplicates(symbols) {
  const groups = new Map();
  for (const s of symbols.filter((x) => ["function", "class"].includes(x.kind))) {
    const key = `${s.kind}:${s.name}:${(s.signature || "").slice(0, 40)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      count: list.length,
      locations: list.map((s) => ({ path: s.filePath, line: s.startLine, name: s.name })),
    }));
}

module.exports = {
  detectDeadCode,
  detectUnusedImports,
  detectUnusedFiles,
  detectDuplicates,
};
