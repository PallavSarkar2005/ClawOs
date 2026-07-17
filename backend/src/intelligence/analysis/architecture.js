/**
 * Automatic architecture generation from real repository analysis.
 */

function generateArchitecture(ctx) {
  const {
    files = [],
    symbols = [],
    deps = [],
    routes = [],
    database = { nodes: [], edges: [] },
    languageStats = {},
    components = { nodes: [] },
    packageImports = [],
    metrics = [],
    deadCode = [],
    unusedFiles = [],
    cycles = [],
  } = ctx;

  const codeFiles = files.filter((f) => !f.isFolder);
  const layers = detectLayers(codeFiles);
  const patterns = detectPatterns(codeFiles, symbols, routes);
  const conventions = detectConventions(codeFiles, symbols);
  const techStack = buildTechInventory(languageStats, packageImports, codeFiles);

  const violations = [];
  for (const cycle of cycles.slice(0, 20)) {
    violations.push({
      type: "circular_dependency",
      severity: "warning",
      message: `Circular dependency: ${cycle.join(" → ")}`,
      path: cycle[0],
    });
  }
  for (const m of metrics.filter((x) => x.severity === "error").slice(0, 30)) {
    violations.push({
      type: m.metricType,
      severity: m.severity,
      message: m.message,
      path: m.path,
    });
  }

  // Layer violations: UI importing database directly, etc.
  for (const d of deps.filter((x) => !x.isExternal)) {
    const fromLayer = layerOf(d.fromPath, layers);
    const toLayer = layerOf(d.toPath, layers);
    if (fromLayer === "ui" && toLayer === "database") {
      violations.push({
        type: "architecture_violation",
        severity: "warning",
        message: `UI layer imports database: ${d.fromPath} → ${d.toPath}`,
        path: d.fromPath,
      });
    }
  }

  const summary = [
    `Repository with ${codeFiles.length} files and ${symbols.length} symbols.`,
    `Languages: ${Object.entries(languageStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => `${k}(${v})`)
      .join(", ") || "unknown"}.`,
    layers.length ? `Layers: ${layers.map((l) => l.name).join(", ")}.` : null,
    routes.length ? `API/routes: ${routes.length}.` : null,
    database.nodes?.length ? `Data models: ${database.nodes.length}.` : null,
    components.nodes?.length ? `React components: ${components.nodes.length}.` : null,
    cycles.length ? `Circular dependencies: ${cycles.length}.` : null,
    deadCode.length ? `Potential dead symbols: ${deadCode.length}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const diagrams = {
    layers: {
      nodes: layers.map((l) => ({ id: l.name, label: l.name, files: l.files.length })),
      edges: [
        { from: "ui", to: "api", kind: "calls" },
        { from: "api", to: "service", kind: "calls" },
        { from: "service", to: "database", kind: "queries" },
      ].filter((e) => layers.some((l) => l.name === e.from) && layers.some((l) => l.name === e.to)),
    },
    dependencies: {
      edgeCount: deps.filter((d) => !d.isExternal).length,
      externalCount: deps.filter((d) => d.isExternal).length,
    },
    api: {
      routes: routes.slice(0, 100),
    },
    database: database,
    requestLifecycle: buildRequestLifecycle(routes, layers),
    executionFlow: buildExecutionFlow(symbols, layers),
  };

  return {
    summary,
    layers,
    patterns,
    conventions,
    techStack,
    diagrams,
    violations,
    stats: {
      files: codeFiles.length,
      symbols: symbols.length,
      routes: routes.length,
      components: components.nodes?.length || 0,
      models: database.nodes?.length || 0,
      cycles: cycles.length,
      deadCode: deadCode.length,
      unusedFiles: unusedFiles.length,
    },
  };
}

function detectLayers(files) {
  const buckets = {
    ui: [],
    api: [],
    service: [],
    database: [],
    config: [],
    test: [],
    other: [],
  };

  for (const f of files) {
    const p = f.path.replace(/\\/g, "/").toLowerCase();
    if (/\.(test|spec)\.|__tests__|\/tests?\//.test(p)) buckets.test.push(f.path);
    else if (/schema\.prisma|\.sql$|\/models?\/|\/entities?\//.test(p)) buckets.database.push(f.path);
    else if (/\/controllers?\/|\/routes?\/|\/api\//.test(p)) buckets.api.push(f.path);
    else if (/\/services?\/|\/repositories?\/|\/domain\//.test(p)) buckets.service.push(f.path);
    else if (/\/components?\/|\/pages?\/|\/views?\/|\.tsx$|\.jsx$/.test(p) && /frontend|client|src\/pages|src\/components/.test(p))
      buckets.ui.push(f.path);
    else if (/config|\.env|package\.json|tsconfig|vite\.config/.test(p)) buckets.config.push(f.path);
    else if (/frontend|client/.test(p) && /\.(tsx|jsx|css)$/.test(p)) buckets.ui.push(f.path);
    else buckets.other.push(f.path);
  }

  return Object.entries(buckets)
    .filter(([, files]) => files.length)
    .map(([name, fileList]) => ({ name, files: fileList, count: fileList.length }));
}

function layerOf(path, layers) {
  for (const l of layers) {
    if (l.files.includes(path)) return l.name;
  }
  return "other";
}

function detectPatterns(files, symbols, routes) {
  const patterns = [];
  if (files.some((f) => /\/controllers?\//i.test(f.path)) && files.some((f) => /\/services?\//i.test(f.path))) {
    patterns.push({ name: "Controller-Service", confidence: 0.85 });
  }
  if (files.some((f) => /\/repositories?\//i.test(f.path))) {
    patterns.push({ name: "Repository Pattern", confidence: 0.8 });
  }
  if (symbols.some((s) => s.kind === "component")) {
    patterns.push({ name: "React Component Architecture", confidence: 0.9 });
  }
  if (routes.length) {
    patterns.push({ name: "REST/HTTP Routing", confidence: 0.85 });
  }
  if (files.some((f) => /schema\.prisma$/i.test(f.path))) {
    patterns.push({ name: "Prisma ORM", confidence: 0.95 });
  }
  if (files.some((f) => /\/agents?\//i.test(f.path) || /\/runtime\//i.test(f.path))) {
    patterns.push({ name: "Multi-Agent Runtime", confidence: 0.8 });
  }
  return patterns;
}

function detectConventions(files, symbols) {
  const naming = {
    camelCaseFns: symbols.filter((s) => s.kind === "function" && /^[a-z][a-zA-Z0-9]*$/.test(s.name)).length,
    pascalComponents: symbols.filter((s) => s.kind === "component" && /^[A-Z]/.test(s.name)).length,
    snakePy: symbols.filter((s) => s.kind === "function" && /_/.test(s.name)).length,
  };
  const folders = {};
  for (const f of files) {
    const top = f.path.replace(/\\/g, "/").split("/")[0];
    folders[top] = (folders[top] || 0) + 1;
  }
  return {
    naming,
    folderConventions: folders,
    preferredStyle: naming.camelCaseFns >= naming.snakePy ? "camelCase" : "snake_case",
  };
}

function buildTechInventory(languageStats, packageImports, files) {
  const tech = [];
  for (const [lang, count] of Object.entries(languageStats)) {
    if (lang !== "unknown") tech.push({ name: lang, kind: "language", count });
  }
  const pkgNames = packageImports.map((p) => p.specifier || p).filter(Boolean);
  const frameworks = [
    ["react", "React"],
    ["express", "Express"],
    ["@prisma/client", "Prisma"],
    ["next", "Next.js"],
    ["vue", "Vue"],
    ["fastapi", "FastAPI"],
    ["django", "Django"],
    ["flask", "Flask"],
  ];
  for (const [pkg, label] of frameworks) {
    if (pkgNames.some((n) => n === pkg || n.startsWith(pkg + "/")) || files.some((f) => (f.path || "").includes(pkg))) {
      tech.push({ name: label, kind: "framework" });
    }
  }
  if (files.some((f) => /schema\.prisma$/i.test(f.path))) tech.push({ name: "Prisma", kind: "orm" });
  if (files.some((f) => /\.go$/i.test(f.path))) tech.push({ name: "Go", kind: "language" });
  if (files.some((f) => /\.rs$/i.test(f.path))) tech.push({ name: "Rust", kind: "language" });
  return tech;
}

function buildRequestLifecycle(routes, layers) {
  const steps = [];
  if (layers.some((l) => l.name === "api")) steps.push({ step: 1, name: "Route/Controller", layer: "api" });
  if (layers.some((l) => l.name === "service")) steps.push({ step: 2, name: "Service Logic", layer: "service" });
  if (layers.some((l) => l.name === "database")) steps.push({ step: 3, name: "Data Access", layer: "database" });
  if (routes.length) {
    steps.unshift({ step: 0, name: "HTTP Request", examples: routes.slice(0, 5).map((r) => `${r.method} ${r.path}`) });
  }
  return steps;
}

function buildExecutionFlow(symbols, layers) {
  return {
    entryPoints: symbols
      .filter((s) => /^(main|start|bootstrap|createServer|app)$/i.test(s.name) || s.exported)
      .slice(0, 20)
      .map((s) => ({ name: s.name, path: s.filePath, kind: s.kind })),
    layers: layers.map((l) => l.name),
  };
}

module.exports = { generateArchitecture, detectLayers, buildTechInventory };
