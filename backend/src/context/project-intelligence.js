const prisma = require("../database/prisma");
const { estimateTokens } = require("../runtime/token");
const { keywordScore } = require("../memory/utils");
const { CONTEXT_SOURCES, ITEM_TYPES } = require("./constants");

const IMPORT_RE =
  /(?:^|\n)\s*(?:import\s+.+\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|from\s+([a-zA-Z0-9_.]+)\s+import)/g;
const SYMBOL_RE =
  /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
const ROUTE_RE =
  /(?:app|router|Route)\.(get|post|put|patch|delete|use)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
const ENV_RE = /(?:process\.env\.|import\.meta\.env\.)([A-Z0-9_]+)/g;
const PRISMA_MODEL_RE = /^\s*model\s+(\w+)\s*\{/gm;

/**
 * Repository intelligence — open/recent files, deps, symbols, routes, schema, env, README.
 */
async function analyzeProject(projectId, query = "", options = {}) {
  if (!projectId) return { items: [], graph: {} };

  const files = await prisma.projectFile.findMany({
    where: { projectId, isFolder: false },
    orderBy: { updatedAt: "desc" },
    take: options.fileLimit || 80,
  });

  const items = [];
  const imports = new Map();
  const symbols = [];
  const routes = [];
  const envVars = new Set();
  const models = [];
  let readme = null;
  let packageJson = null;

  const queryLower = String(query || "").toLowerCase();

  for (const file of files) {
    const content = file.content || "";
    const path = file.path || file.name;
    const relevance = query
      ? Math.max(keywordScore(content.slice(0, 4000), query), keywordScore(path, query))
      : 0.4;
    const recentlyEdited = Date.now() - new Date(file.updatedAt).getTime() < 7 * 86400000;

    // README / architecture
    if (/readme\.md$/i.test(path)) {
      readme = { path, content: content.slice(0, 6000) };
      items.push({
        source: CONTEXT_SOURCES.REPOSITORY,
        type: ITEM_TYPES.README,
        sourceId: file.id,
        content: content.slice(0, 4000),
        similarity: Math.max(relevance, 0.7),
        importance: 0.85,
        projectId,
        timestamp: file.updatedAt,
        metadata: { path },
        reason: "Project README",
        tokenCount: estimateTokens(content.slice(0, 4000)),
      });
    }

    if (/package\.json$/i.test(path)) {
      try {
        packageJson = JSON.parse(content);
      } catch {
        packageJson = null;
      }
    }

    if (/schema\.prisma$/i.test(path)) {
      let m;
      const re = new RegExp(PRISMA_MODEL_RE.source, "gm");
      while ((m = re.exec(content))) {
        models.push(m[1]);
      }
      items.push({
        source: CONTEXT_SOURCES.REPOSITORY,
        type: ITEM_TYPES.SCHEMA,
        sourceId: file.id,
        content: content.slice(0, 5000),
        similarity: Math.max(relevance, 0.75),
        importance: 0.9,
        projectId,
        timestamp: file.updatedAt,
        metadata: { path, models },
        reason: "Database schema",
        tokenCount: estimateTokens(content.slice(0, 5000)),
      });
    }

    // Parse imports / symbols / routes / env for code files
    if (/\.(js|jsx|ts|tsx|mjs|cjs|py)$/i.test(path)) {
      let im;
      const importRe = new RegExp(IMPORT_RE.source, "g");
      while ((im = importRe.exec(content))) {
        const dep = im[1] || im[2] || im[3];
        if (!dep) continue;
        if (!imports.has(dep)) imports.set(dep, []);
        imports.get(dep).push(path);
      }

      let sm;
      const symRe = new RegExp(SYMBOL_RE.source, "g");
      while ((sm = symRe.exec(content))) {
        symbols.push({ name: sm[1], path, line: content.slice(0, sm.index).split("\n").length });
      }

      let rt;
      const routeRe = new RegExp(ROUTE_RE.source, "gi");
      while ((rt = routeRe.exec(content))) {
        routes.push({ method: rt[1].toUpperCase(), path: rt[2], file: path });
      }

      let ev;
      const envRe = new RegExp(ENV_RE.source, "g");
      while ((ev = envRe.exec(content))) envVars.add(ev[1]);
    }

    // Recently edited or query-relevant files
    if (recentlyEdited || relevance > 0.15 || items.length < 8) {
      const snippet = content.slice(0, recentlyEdited ? 2500 : 1500);
      items.push({
        source: CONTEXT_SOURCES.PROJECT_FILES,
        type: ITEM_TYPES.FILE,
        sourceId: file.id,
        content: `FILE ${path}:\n${snippet}`,
        similarity: relevance,
        importance: recentlyEdited ? 0.75 : 0.5,
        projectId,
        timestamp: file.updatedAt,
        frequency: recentlyEdited ? 5 : 1,
        metadata: { path, recentlyEdited, name: file.name },
        reason: recentlyEdited ? "Recently edited file" : "Project file matched query",
        tokenCount: estimateTokens(snippet),
      });
    }
  }

  // Symbol hits matching query
  if (queryLower) {
    for (const sym of symbols.filter((s) => s.name.toLowerCase().includes(queryLower)).slice(0, 20)) {
      items.push({
        source: CONTEXT_SOURCES.REPOSITORY,
        type: ITEM_TYPES.SYMBOL,
        sourceId: `${sym.path}:${sym.name}`,
        content: `Symbol ${sym.name} in ${sym.path}:${sym.line}`,
        similarity: 0.85,
        importance: 0.7,
        projectId,
        metadata: sym,
        reason: "Symbol match",
        tokenCount: 20,
      });
    }
  }

  if (routes.length) {
    const routeText = routes
      .slice(0, 40)
      .map((r) => `${r.method} ${r.path} (${r.file})`)
      .join("\n");
    items.push({
      source: CONTEXT_SOURCES.REPOSITORY,
      type: ITEM_TYPES.ROUTE,
      sourceId: `routes:${projectId}`,
      content: `API routes:\n${routeText}`,
      similarity: query ? keywordScore(routeText, query) : 0.5,
      importance: 0.8,
      projectId,
      metadata: { count: routes.length },
      reason: "Discovered API routes",
      tokenCount: estimateTokens(routeText),
    });
  }

  if (envVars.size) {
    const envText = [...envVars].sort().join(", ");
    items.push({
      source: CONTEXT_SOURCES.REPOSITORY,
      type: ITEM_TYPES.ENV,
      sourceId: `env:${projectId}`,
      content: `Environment variables referenced: ${envText}`,
      similarity: 0.4,
      importance: 0.55,
      projectId,
      reason: "Environment variable references",
      tokenCount: estimateTokens(envText),
    });
  }

  // Dependency graph summary
  const deps = packageJson
    ? {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      }
    : {};
  const depNames = Object.keys(deps);
  if (depNames.length) {
    items.push({
      source: CONTEXT_SOURCES.REPOSITORY,
      type: ITEM_TYPES.ARCHITECTURE,
      sourceId: `deps:${projectId}`,
      content: `Dependencies (${depNames.length}): ${depNames.slice(0, 60).join(", ")}`,
      similarity: query ? keywordScore(depNames.join(" "), query) : 0.45,
      importance: 0.7,
      projectId,
      reason: "Package dependency graph",
      tokenCount: estimateTokens(depNames.slice(0, 60).join(", ")),
    });
  }

  // Architecture overview
  const archLines = [
    `Files: ${files.length}`,
    readme ? `README: present` : null,
    models.length ? `Prisma models: ${models.join(", ")}` : null,
    `Imports tracked: ${imports.size}`,
    `Symbols: ${symbols.length}`,
    `Routes: ${routes.length}`,
  ].filter(Boolean);

  items.push({
    source: CONTEXT_SOURCES.REPOSITORY,
    type: ITEM_TYPES.ARCHITECTURE,
    sourceId: `arch:${projectId}`,
    content: `Architecture overview:\n${archLines.join("\n")}`,
    similarity: 0.55,
    importance: 0.8,
    projectId,
    reason: "Repository architecture summary",
    tokenCount: estimateTokens(archLines.join("\n")),
  });

  const graph = {
    files: files.map((f) => ({ id: f.id, path: f.path, updatedAt: f.updatedAt })),
    imports: Object.fromEntries([...imports.entries()].slice(0, 100)),
    symbols: symbols.slice(0, 100),
    routes: routes.slice(0, 50),
    models,
    envVars: [...envVars],
    dependencies: depNames.slice(0, 80),
  };

  return { items, graph };
}

/**
 * Lightweight git-like history from ProjectDiff + ProjectLog.
 */
async function analyzeGitHistory(projectId, query = "") {
  if (!projectId) return [];
  const items = [];

  try {
    const diffs = await prisma.projectDiff.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 15,
    });
    for (const d of diffs) {
      const snippet = [
        `DIFF ${d.filePath} (${d.status})`,
        d.reason ? `reason: ${d.reason}` : null,
        "--- before ---",
        String(d.before || "").slice(0, 600),
        "--- after ---",
        String(d.after || "").slice(0, 600),
      ]
        .filter(Boolean)
        .join("\n");
      items.push({
        source: CONTEXT_SOURCES.GIT_HISTORY,
        type: ITEM_TYPES.DIFF,
        sourceId: d.id,
        content: snippet,
        similarity: query ? keywordScore(snippet, query) : 0.5,
        importance: 0.7,
        projectId,
        timestamp: d.createdAt,
        reason: "Recent project diff",
        tokenCount: estimateTokens(snippet),
      });
    }
  } catch {
    // optional
  }

  try {
    const logs = await prisma.projectLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    if (logs.length) {
      const text = logs.map((l) => `[${l.level}] ${l.source}: ${l.message}`).join("\n");
      items.push({
        source: CONTEXT_SOURCES.GIT_HISTORY,
        type: ITEM_TYPES.GIT,
        sourceId: `logs:${projectId}`,
        content: text.slice(0, 2000),
        similarity: query ? keywordScore(text, query) : 0.35,
        importance: 0.45,
        projectId,
        reason: "Project activity log",
        tokenCount: estimateTokens(text.slice(0, 2000)),
      });
    }
  } catch {
    // optional
  }

  return items;
}

module.exports = {
  analyzeProject,
  analyzeGitHistory,
};
