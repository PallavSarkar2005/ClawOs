/**
 * Graph builders — construct all repository graphs from indexed parse results.
 */

function buildFileGraph(files) {
  const nodes = [];
  const edges = [];
  const folders = new Set();

  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").split("/");
    let acc = "";
    for (let i = 0; i < parts.length - 1; i++) {
      acc = acc ? `${acc}/${parts[i]}` : parts[i];
      folders.add(acc);
    }
    nodes.push({
      id: f.path,
      label: f.name || parts[parts.length - 1],
      type: f.isFolder ? "folder" : "file",
      language: f.language,
      size: f.sizeBytes || 0,
      lines: f.lineCount || 0,
    });
  }

  for (const folder of folders) {
    if (!nodes.some((n) => n.id === folder)) {
      nodes.push({ id: folder, label: folder.split("/").pop(), type: "folder" });
    }
    const parent = folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : null;
    if (parent) edges.push({ from: parent, to: folder, kind: "contains" });
  }

  for (const f of files.filter((x) => !x.isFolder)) {
    const parent = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : null;
    if (parent) edges.push({ from: parent, to: f.path, kind: "contains" });
  }

  return { nodes, edges, kind: "file" };
}

function buildFolderGraph(files) {
  const counts = new Map();
  for (const f of files.filter((x) => !x.isFolder)) {
    const folder = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ".";
    if (!counts.has(folder)) counts.set(folder, { files: 0, lines: 0, languages: {} });
    const c = counts.get(folder);
    c.files += 1;
    c.lines += f.lineCount || 0;
    if (f.language) c.languages[f.language] = (c.languages[f.language] || 0) + 1;
  }
  const nodes = [...counts.entries()].map(([id, meta]) => ({
    id,
    label: id.split("/").pop() || id,
    type: "folder",
    ...meta,
  }));
  const edges = [];
  for (const id of counts.keys()) {
    if (!id.includes("/")) continue;
    const parent = id.slice(0, id.lastIndexOf("/"));
    if (counts.has(parent) || parent) edges.push({ from: parent || ".", to: id, kind: "contains" });
  }
  return { nodes, edges, kind: "folder" };
}

function buildImportGraph(deps) {
  const nodeSet = new Set();
  const edges = [];
  for (const d of deps) {
    nodeSet.add(d.fromPath);
    nodeSet.add(d.toPath);
    edges.push({
      from: d.fromPath,
      to: d.toPath,
      kind: d.kind || "import",
      specifier: d.specifier,
      isExternal: d.isExternal,
      isCircular: d.isCircular,
    });
  }
  return {
    nodes: [...nodeSet].map((id) => ({ id, label: id.split("/").pop(), type: id.includes(".") ? "file" : "module" })),
    edges,
    cycles: detectCycles(edges),
    kind: "import",
  };
}

function buildExportGraph(files) {
  const nodes = [];
  const edges = [];
  for (const f of files) {
    const exports = Array.isArray(f.exports) ? f.exports : [];
    if (!exports.length) continue;
    nodes.push({ id: f.path, label: f.name || f.path, type: "file", exportCount: exports.length });
    for (const exp of exports) {
      const sid = `${f.path}::${exp.name}`;
      nodes.push({ id: sid, label: exp.name, type: "export", line: exp.line });
      edges.push({ from: f.path, to: sid, kind: "exports" });
    }
  }
  return { nodes, edges, kind: "export" };
}

function buildDependencyGraph(deps, packageImports = []) {
  const internal = deps.filter((d) => !d.isExternal);
  const external = [
    ...deps.filter((d) => d.isExternal),
    ...packageImports.map((p) => ({
      fromPath: "package.json",
      toPath: p.specifier || p,
      kind: "package",
      isExternal: true,
      specifier: p.specifier || p,
    })),
  ];
  return {
    internal: buildImportGraph(internal),
    external: buildImportGraph(external),
    kind: "dependency",
  };
}

function buildSymbolGraph(symbols, references = []) {
  const nodes = symbols.map((s) => ({
    id: s.id || `${s.filePath || s.path}::${s.name}`,
    label: s.name,
    kind: s.kind,
    path: s.filePath || s.path,
    line: s.startLine,
    exported: s.exported,
  }));
  const edges = references
    .filter((r) => r.fromSymbolId || r.toSymbolId)
    .map((r) => ({
      from: r.fromSymbolId,
      to: r.toSymbolId,
      kind: r.kind,
      line: r.line,
    }));
  return { nodes, edges, kind: "symbol" };
}

function buildCallGraph(symbols, calls) {
  const byName = new Map();
  for (const s of symbols) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }
  const nodeIds = new Set();
  const edges = [];
  for (const call of calls) {
    const callees = byName.get(call.callee) || [];
    for (const callee of callees) {
      const fromId = call.callerId || `${call.filePath}::caller`;
      const toId = callee.id || `${callee.filePath || callee.path}::${callee.name}`;
      nodeIds.add(fromId);
      nodeIds.add(toId);
      edges.push({
        from: fromId,
        to: toId,
        kind: call.kind || "call",
        line: call.line,
        file: call.filePath,
      });
    }
  }
  const nodes = [...nodeIds].map((id) => {
    const sym = symbols.find((s) => (s.id || `${s.filePath}::${s.name}`) === id);
    return {
      id,
      label: sym?.name || id.split("::").pop(),
      kind: sym?.kind || "callsite",
      path: sym?.filePath || sym?.path,
    };
  });
  return { nodes, edges: edges.slice(0, 5000), kind: "call" };
}

function buildClassHierarchy(hierarchy, symbols) {
  const classSymbols = symbols.filter((s) => ["class", "interface", "enum", "type"].includes(s.kind));
  const nodes = classSymbols.map((s) => ({
    id: s.name,
    label: s.name,
    kind: s.kind,
    path: s.filePath || s.path,
  }));
  const edges = hierarchy.map((h) => ({
    from: h.child,
    to: h.parent,
    kind: h.kind,
  }));
  return {
    nodes,
    edges,
    classHierarchy: edges.filter((e) => e.kind === "extends"),
    interfaceHierarchy: edges.filter((e) => e.kind === "implements"),
    kind: "hierarchy",
  };
}

function buildModuleGraph(files, deps) {
  const modules = new Map();
  for (const f of files.filter((x) => !x.isFolder)) {
    const parts = f.path.replace(/\\/g, "/").split("/");
    const mod = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    if (!modules.has(mod)) modules.set(mod, { files: [], languages: {} });
    const m = modules.get(mod);
    m.files.push(f.path);
    if (f.language) m.languages[f.language] = (m.languages[f.language] || 0) + 1;
  }
  const nodes = [...modules.entries()].map(([id, meta]) => ({
    id,
    label: id.split("/").pop() || id,
    type: "module",
    fileCount: meta.files.length,
    languages: meta.languages,
  }));
  const edgeMap = new Map();
  for (const d of deps.filter((x) => !x.isExternal)) {
    const fromMod = d.fromPath.includes("/") ? d.fromPath.slice(0, d.fromPath.lastIndexOf("/")) : ".";
    const toMod = d.toPath.includes("/") ? d.toPath.slice(0, d.toPath.lastIndexOf("/")) : ".";
    if (fromMod === toMod) continue;
    const key = `${fromMod}->${toMod}`;
    edgeMap.set(key, { from: fromMod, to: toMod, kind: "depends", weight: (edgeMap.get(key)?.weight || 0) + 1 });
  }
  return { nodes, edges: [...edgeMap.values()], kind: "module" };
}

function buildApiGraph(routes, symbols = []) {
  const nodes = routes.map((r, i) => ({
    id: `route:${r.method}:${r.path}:${i}`,
    label: `${r.method} ${r.path}`,
    method: r.method,
    path: r.path,
    file: r.file,
    line: r.line,
    type: "route",
  }));
  const handlers = symbols
    .filter((s) => /controller|handler|router|route/i.test(s.name) || /controller|routes/i.test(s.filePath || s.path || ""))
    .map((s) => ({
      id: s.id || `${s.filePath}::${s.name}`,
      label: s.name,
      type: "handler",
      path: s.filePath || s.path,
    }));
  const edges = [];
  for (const route of nodes) {
    const handler = handlers.find((h) => route.file && h.path === route.file);
    if (handler) edges.push({ from: route.id, to: handler.id, kind: "handled_by" });
  }
  return { nodes: [...nodes, ...handlers], edges, routes, handlers, kind: "api" };
}

function buildDatabaseGraph(databaseItems, symbols) {
  const models = [
    ...databaseItems.filter((d) => d.kind === "model" || d.kind === "table"),
    ...symbols.filter((s) => s.kind === "model" || s.kind === "table"),
  ];
  const nodes = models.map((m) => ({
    id: m.name,
    label: m.name,
    kind: m.kind || "model",
    fields: m.fields || m.metadata?.fields || [],
  }));
  const edges = [];
  for (const m of models) {
    const fieldText = Array.isArray(m.fields)
      ? m.fields.join("\n")
      : typeof m.database === "string"
        ? m.database
        : "";
    const text = fieldText || (m.metadata?.fields || []).join("\n") || "";
    for (const other of models) {
      if (other.name === m.name) continue;
      if (text.includes(other.name) || new RegExp(`\\b${other.name}\\b`).test(text)) {
        edges.push({ from: m.name, to: other.name, kind: "relation" });
      }
    }
  }
  return { nodes, edges, kind: "database" };
}

function buildComponentTree(symbols, calls) {
  const components = symbols.filter((s) => s.kind === "component" || (s.kind === "function" && /^[A-Z]/.test(s.name)));
  const nodes = components.map((c) => ({
    id: c.id || `${c.filePath}::${c.name}`,
    label: c.name,
    path: c.filePath || c.path,
    line: c.startLine,
    type: "component",
  }));
  const nameToId = new Map(nodes.map((n) => [n.label, n.id]));
  const edges = [];
  for (const call of calls.filter((c) => c.kind === "jsx")) {
    const parentComps = components.filter((c) => (c.filePath || c.path) === call.filePath);
    for (const parent of parentComps) {
      const childId = nameToId.get(call.callee);
      const parentId = parent.id || `${parent.filePath}::${parent.name}`;
      if (childId && childId !== parentId) {
        edges.push({ from: parentId, to: childId, kind: "renders", line: call.line });
      }
    }
  }
  const childIds = new Set(edges.map((e) => e.to));
  const roots = nodes.filter((n) => !childIds.has(n.id)).map((n) => n.id);
  return { nodes, edges, roots, kind: "component" };
}

function buildRoutingGraph(routes) {
  const nodes = routes.map((r, i) => ({
    id: `nav:${i}:${r.path}`,
    label: r.path,
    method: r.method,
    file: r.file,
    type: r.kind === "react-router" ? "page" : "api",
  }));
  const edges = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      if (nodes[j].label.startsWith(nodes[i].label + "/") || nodes[j].label.startsWith(nodes[i].label + ":")) {
        edges.push({ from: nodes[i].id, to: nodes[j].id, kind: "nested" });
      }
    }
  }
  return { nodes, edges, kind: "routing" };
}

function buildWorkspaceGraph(allGraphs) {
  return {
    kind: "workspace",
    graphs: Object.keys(allGraphs),
    metrics: {
      files: allGraphs.file?.nodes?.length || 0,
      imports: allGraphs.import?.edges?.length || 0,
      symbols: allGraphs.symbol?.nodes?.length || 0,
      calls: allGraphs.call?.edges?.length || 0,
      routes: allGraphs.api?.routes?.length || 0,
      components: allGraphs.component?.nodes?.length || 0,
      models: allGraphs.database?.nodes?.length || 0,
    },
  };
}

function detectCycles(edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const cycles = [];
  const visited = new Set();
  const stack = new Set();
  const path = [];

  function dfs(node) {
    if (stack.has(node)) {
      const idx = path.indexOf(node);
      if (idx >= 0) cycles.push(path.slice(idx).concat(node));
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    stack.add(node);
    path.push(node);
    for (const next of adj.get(node) || []) dfs(next);
    path.pop();
    stack.delete(node);
  }

  for (const node of adj.keys()) dfs(node);
  return cycles.slice(0, 50);
}

function resolveRelativeImport(fromPath, specifier) {
  if (!specifier.startsWith(".") && !specifier.startsWith("/")) return null;
  const fromDir = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const parts = (fromDir ? fromDir.split("/") : []).concat(specifier.split("/"));
  const resolved = [];
  for (const p of parts) {
    if (p === "." || p === "") continue;
    if (p === "..") resolved.pop();
    else resolved.push(p);
  }
  return resolved.join("/");
}

module.exports = {
  buildFileGraph,
  buildFolderGraph,
  buildImportGraph,
  buildExportGraph,
  buildDependencyGraph,
  buildSymbolGraph,
  buildCallGraph,
  buildClassHierarchy,
  buildModuleGraph,
  buildApiGraph,
  buildDatabaseGraph,
  buildComponentTree,
  buildRoutingGraph,
  buildWorkspaceGraph,
  detectCycles,
  resolveRelativeImport,
};
