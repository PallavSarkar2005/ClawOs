/**
 * Repository Intelligence Engine — Phase 6 facade.
 */

const prisma = require("../database/prisma");
const { indexRepository, ensureRepository, getProgress, reindexFile } = require("./indexer");
const navigation = require("./navigation");
const { answerQuestion } = require("./understanding/answers");
const { analyzeImpact, planRename, findCircularDependencies } = require("./analysis/impact");
const { detectDeadCode, detectUnusedImports, detectUnusedFiles, detectDuplicates } = require("./analysis/dead-code");
const workspaceMemory = require("./memory/workspace-memory");
const { supportedLanguages } = require("./parsers");
const { startWatcher, stopWatcher, notifyFileChange } = require("./watcher");

async function getRepository(projectId, ownerId) {
  return ensureRepository(projectId, ownerId);
}

async function getStatus(projectId, ownerId) {
  const repo = await ensureRepository(projectId, ownerId);
  const progress = getProgress(repo.id);
  const latestJob = await prisma.repoIndexJob.findFirst({
    where: { repositoryId: repo.id },
    orderBy: { createdAt: "desc" },
  });
  return {
    repositoryId: repo.id,
    name: repo.name,
    indexStatus: repo.indexStatus,
    indexProgress: repo.indexProgress,
    filesIndexed: repo.filesIndexed,
    symbolsIndexed: repo.symbolsIndexed,
    depsIndexed: repo.depsIndexed,
    healthScore: repo.healthScore,
    languageStats: repo.languageStats,
    techInventory: repo.techInventory,
    lastIndexedAt: repo.lastIndexedAt,
    summary: repo.summary,
    progress,
    latestJob,
    supportedLanguages: supportedLanguages(),
  };
}

async function getGraphs(projectId, ownerId, kind = null) {
  const repo = await ensureRepository(projectId, ownerId);
  const [importG, callG, componentG, apiG, files, deps, symbols, arch] = await Promise.all([
    prisma.importGraph.findFirst({ where: { repositoryId: repo.id }, orderBy: { computedAt: "desc" } }),
    prisma.callGraph.findFirst({ where: { repositoryId: repo.id }, orderBy: { computedAt: "desc" } }),
    prisma.componentGraph.findFirst({ where: { repositoryId: repo.id }, orderBy: { computedAt: "desc" } }),
    prisma.apiGraph.findFirst({ where: { repositoryId: repo.id }, orderBy: { computedAt: "desc" } }),
    prisma.repositoryFile.findMany({ where: { repositoryId: repo.id }, take: 2000 }),
    prisma.dependency.findMany({ where: { repositoryId: repo.id }, take: 5000 }),
    prisma.symbol.findMany({ where: { repositoryId: repo.id }, take: 5000 }),
    prisma.architectureSnapshot.findFirst({ where: { repositoryId: repo.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const graphs = {
    import: importG,
    call: callG,
    component: componentG,
    api: apiG,
    file: {
      nodes: files.map((f) => ({
        id: f.path,
        label: f.name,
        type: f.isFolder ? "folder" : "file",
        language: f.language,
      })),
      edges: files
        .filter((f) => f.parentPath)
        .map((f) => ({ from: f.parentPath, to: f.path, kind: "contains" })),
    },
    dependency: {
      nodes: [...new Set(deps.flatMap((d) => [d.fromPath, d.toPath]))].map((id) => ({ id, label: id.split("/").pop() })),
      edges: deps.map((d) => ({
        from: d.fromPath,
        to: d.toPath,
        kind: d.kind,
        isExternal: d.isExternal,
        isCircular: d.isCircular,
      })),
    },
    symbol: {
      nodes: symbols.slice(0, 1000).map((s) => ({ id: s.id, label: s.name, kind: s.kind })),
      edges: [],
    },
    database: arch?.diagrams?.database || { nodes: [], edges: [] },
    routing: { routes: apiG?.routes || [] },
    hierarchy: arch?.diagrams || {},
    architecture: arch,
  };

  if (kind && graphs[kind]) return { [kind]: graphs[kind] };
  return graphs;
}

async function getSymbols(projectId, ownerId, filters = {}) {
  const repo = await ensureRepository(projectId, ownerId);
  const where = { repositoryId: repo.id };
  if (filters.kind) where.kind = filters.kind;
  if (filters.name) where.name = { contains: filters.name, mode: "insensitive" };
  if (filters.path) {
    const file = await prisma.repositoryFile.findFirst({ where: { repositoryId: repo.id, path: filters.path } });
    if (file) where.fileId = file.id;
  }
  const symbols = await prisma.symbol.findMany({
    where,
    include: { file: true },
    orderBy: [{ name: "asc" }],
    take: filters.limit || 200,
    skip: filters.offset || 0,
  });
  return symbols.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    path: s.file.path,
    line: s.startLine,
    endLine: s.endLine,
    signature: s.signature,
    exported: s.exported,
  }));
}

async function getMetrics(projectId, ownerId) {
  const repo = await ensureRepository(projectId, ownerId);
  const metrics = await prisma.codeMetric.findMany({
    where: { repositoryId: repo.id },
    orderBy: [{ severity: "asc" }, { value: "desc" }],
    take: 300,
  });
  const byType = {};
  for (const m of metrics) {
    byType[m.metricType] = (byType[m.metricType] || 0) + 1;
  }
  return {
    healthScore: repo.healthScore,
    metrics,
    byType,
    filesIndexed: repo.filesIndexed,
    symbolsIndexed: repo.symbolsIndexed,
    depsIndexed: repo.depsIndexed,
  };
}

async function getDebt(projectId, ownerId) {
  const repo = await ensureRepository(projectId, ownerId);
  const [metrics, deps, symbols, files, arch] = await Promise.all([
    prisma.codeMetric.findMany({ where: { repositoryId: repo.id } }),
    prisma.dependency.findMany({ where: { repositoryId: repo.id } }),
    prisma.symbol.findMany({ where: { repositoryId: repo.id }, include: { file: true } }),
    prisma.repositoryFile.findMany({ where: { repositoryId: repo.id } }),
    prisma.architectureSnapshot.findFirst({ where: { repositoryId: repo.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const symbolsWithPath = symbols.map((s) => ({ ...s, filePath: s.file.path }));
  const calls = await prisma.reference.findMany({
    where: { repositoryId: repo.id, kind: { in: ["call", "jsx"] } },
    take: 5000,
  });
  const callLike = calls.map((c) => ({ callee: c.name, filePath: c.context, line: c.line, kind: c.kind }));

  const deadCode = detectDeadCode(symbolsWithPath, callLike, deps);
  const unusedImports = detectUnusedImports(files, deps);
  const unusedFiles = detectUnusedFiles(files, deps);
  const cycles = findCircularDependencies(deps);
  const duplicates = detectDuplicates(symbolsWithPath);

  const debt = {
    healthScore: repo.healthScore,
    largeFiles: metrics.filter((m) => m.metricType === "large_file"),
    complexMethods: metrics.filter((m) => m.metricType === "complex_method"),
    security: metrics.filter((m) => m.metricType === "security"),
    missingTests: metrics.filter((m) => m.metricType.includes("test")),
    deadCode,
    unusedImports,
    unusedFiles,
    cycles,
    duplicates,
    violations: arch?.violations || [],
  };

  await workspaceMemory.recordTechDebt(repo.id, [
    ...deadCode.slice(0, 20),
    ...unusedFiles.slice(0, 20),
    ...cycles.slice(0, 10).map((c) => ({ type: "cycle", path: c.join(" → ") })),
  ]);

  return debt;
}

async function ask(projectId, ownerId, question) {
  const repo = await ensureRepository(projectId, ownerId);
  const [files, symbols, deps, references, arch, componentG, apiG] = await Promise.all([
    prisma.repositoryFile.findMany({ where: { repositoryId: repo.id } }),
    prisma.symbol.findMany({ where: { repositoryId: repo.id }, include: { file: true } }),
    prisma.dependency.findMany({ where: { repositoryId: repo.id } }),
    prisma.reference.findMany({
      where: { repositoryId: repo.id },
      include: { file: true, toSymbol: true },
      take: 5000,
    }),
    prisma.architectureSnapshot.findFirst({ where: { repositoryId: repo.id }, orderBy: { createdAt: "desc" } }),
    prisma.componentGraph.findFirst({ where: { repositoryId: repo.id }, orderBy: { computedAt: "desc" } }),
    prisma.apiGraph.findFirst({ where: { repositoryId: repo.id }, orderBy: { computedAt: "desc" } }),
  ]);

  const symbolsWithPath = symbols.map((s) => ({ ...s, filePath: s.file.path }));
  return answerQuestion(question, {
    files,
    symbols: symbolsWithPath,
    deps,
    routes: apiG?.routes || [],
    references: references.map((r) => ({ ...r, context: r.file?.path || r.context })),
    architecture: arch,
    components: componentG,
    database: arch?.diagrams?.database,
    apiGraph: apiG,
  });
}

async function impact(projectId, ownerId, target) {
  const repo = await ensureRepository(projectId, ownerId);
  const [deps, symbols, references, files] = await Promise.all([
    prisma.dependency.findMany({ where: { repositoryId: repo.id } }),
    prisma.symbol.findMany({ where: { repositoryId: repo.id }, include: { file: true } }),
    prisma.reference.findMany({
      where: { repositoryId: repo.id },
      include: { file: true, toSymbol: true },
      take: 5000,
    }),
    prisma.repositoryFile.findMany({ where: { repositoryId: repo.id } }),
  ]);
  return analyzeImpact(repo.id, target, {
    deps,
    symbols: symbols.map((s) => ({ ...s, filePath: s.file.path })),
    references,
    files,
  });
}

async function renamePlan(projectId, ownerId, symbolName, newName) {
  const repo = await ensureRepository(projectId, ownerId);
  const [symbols, references] = await Promise.all([
    prisma.symbol.findMany({ where: { repositoryId: repo.id, name: symbolName }, include: { file: true } }),
    prisma.reference.findMany({
      where: { repositoryId: repo.id, name: symbolName },
      include: { file: true },
    }),
  ]);
  return planRename(symbolName, newName, {
    symbols: symbols.map((s) => ({ ...s, filePath: s.file.path })),
    references,
  });
}

async function buildCoordinatorContext(projectId, ownerId, query = "") {
  if (!projectId) return { items: [], intelligence: null };
  try {
    const repo = await prisma.repository.findUnique({ where: { projectId } });
    if (!repo || repo.indexStatus !== "ready") {
      // Kick off background index if idle
      if (repo?.indexStatus === "idle" || !repo) {
        indexRepository(projectId, ownerId, { incremental: false }).catch(() => {});
      }
      return { items: [], intelligence: repo ? await getStatus(projectId, ownerId) : null };
    }

    const memory = await workspaceMemory.getWorkspaceContext(repo.id);
    const arch = await prisma.architectureSnapshot.findFirst({
      where: { repositoryId: repo.id },
      orderBy: { createdAt: "desc" },
    });

    let answer = null;
    if (query) {
      answer = await ask(projectId, ownerId, query);
    }

    const items = [
      {
        source: "repository_intelligence",
        type: "architecture",
        content: arch?.summary || repo.summary || "",
        importance: 0.9,
        similarity: 0.8,
        projectId,
        reason: "Repository architecture",
        metadata: { healthScore: repo.healthScore, tech: repo.techInventory },
      },
    ];

    if (answer) {
      items.push({
        source: "repository_intelligence",
        type: "understanding",
        content: `${answer.answer}\n${JSON.stringify(answer, null, 0).slice(0, 3000)}`,
        importance: 0.95,
        similarity: 0.9,
        projectId,
        reason: "Repository Q&A",
        metadata: { type: answer.type },
      });
    }

    if (memory.recentEdits?.length) {
      items.push({
        source: "repository_intelligence",
        type: "workspace_memory",
        content: `Recent edits: ${memory.recentEdits
          .slice(0, 10)
          .map((e) => e.path)
          .join(", ")}`,
        importance: 0.7,
        similarity: 0.6,
        projectId,
        reason: "Workspace memory",
      });
    }

    return {
      items,
      intelligence: {
        healthScore: repo.healthScore,
        summary: repo.summary,
        languageStats: repo.languageStats,
        techInventory: repo.techInventory,
        memory,
        answer,
      },
    };
  } catch (err) {
    return { items: [], intelligence: null, error: err.message };
  }
}

module.exports = {
  getRepository,
  getStatus,
  indexRepository,
  reindexFile,
  getGraphs,
  getSymbols,
  getMetrics,
  getDebt,
  ask,
  impact,
  renamePlan,
  buildCoordinatorContext,
  navigation,
  workspaceMemory,
  startWatcher,
  stopWatcher,
  notifyFileChange,
  supportedLanguages,
};
