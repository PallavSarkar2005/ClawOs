/**
 * Code Indexer — incremental repository indexing with parallel parsing.
 */

const prisma = require("../database/prisma");
const { parseFile, detectLanguage, contentHash } = require("./parsers");
const {
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
  resolveRelativeImport,
  detectCycles,
} = require("./graphs/builder");
const { analyzeQuality } = require("./analysis/quality");
const { detectDeadCode, detectUnusedImports, detectUnusedFiles } = require("./analysis/dead-code");
const { generateArchitecture } = require("./analysis/architecture");
const workspaceMemory = require("./memory/workspace-memory");

const SKIP_PATH_RE =
  /(?:^|\/)(?:node_modules|\.git|dist|build|\.next|coverage|\.cache|vendor|__pycache__|\.venv)(?:\/|$)/i;

const indexLocks = new Map();
const progressMap = new Map();

async function ensureRepository(projectId, ownerId) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: ownerId },
  });
  if (!project) throw new Error("Project not found");

  let repo = await prisma.repository.findUnique({ where: { projectId } });
  if (!repo) {
    repo = await prisma.repository.create({
      data: {
        projectId,
        ownerId,
        name: project.name,
        indexStatus: "idle",
      },
    });
  }
  return repo;
}

function getProgress(repositoryId) {
  return (
    progressMap.get(repositoryId) || {
      status: "idle",
      progress: 0,
      stage: null,
      filesDone: 0,
      filesTotal: 0,
    }
  );
}

function setProgress(repositoryId, patch) {
  const cur = getProgress(repositoryId);
  const next = { ...cur, ...patch };
  progressMap.set(repositoryId, next);
  return next;
}

async function indexRepository(projectId, ownerId, options = {}) {
  const lockKey = `${ownerId}:${projectId}`;
  if (indexLocks.get(lockKey)) {
    return { status: "busy", message: "Indexing already in progress" };
  }
  indexLocks.set(lockKey, true);

  let repo;
  let job;
  try {
    repo = await ensureRepository(projectId, ownerId);
    job = await prisma.repoIndexJob.create({
      data: {
        repositoryId: repo.id,
        type: options.incremental ? "incremental" : "full",
        status: "running",
        stage: "loading",
        startedAt: new Date(),
      },
    });

    await prisma.repository.update({
      where: { id: repo.id },
      data: { indexStatus: "indexing", indexProgress: 0, indexError: null },
    });
    setProgress(repo.id, { status: "indexing", progress: 0, stage: "loading", filesDone: 0 });

    const projectFiles = await prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { path: "asc" },
    });

    const files = projectFiles.filter((f) => !SKIP_PATH_RE.test(f.path || f.name || ""));
    const codeFiles = files.filter((f) => !f.isFolder);

    await prisma.repoIndexJob.update({
      where: { id: job.id },
      data: { filesTotal: codeFiles.length, stage: "parsing" },
    });
    setProgress(repo.id, { filesTotal: codeFiles.length, stage: "parsing" });

    // Existing hashes for incremental
    const existing = options.incremental
      ? await prisma.repositoryFile.findMany({
          where: { repositoryId: repo.id },
          select: { id: true, path: true, contentHash: true },
        })
      : [];
    const hashByPath = new Map(existing.map((e) => [e.path, e]));

    if (!options.incremental) {
      await clearIndex(repo.id);
    }

    const parsedFiles = [];
    const allSymbols = [];
    const allCalls = [];
    const allRoutes = [];
    const allHierarchy = [];
    const allDatabase = [];
    const allDeps = [];
    const packageImports = [];
    const languageStats = {};
    let filesDone = 0;

    const batchSize = options.parallel || 8;
    for (let i = 0; i < codeFiles.length; i += batchSize) {
      const batch = codeFiles.slice(i, i + batchSize);
      await Promise.all(
        batch.map(async (pf) => {
          const path = pf.path || pf.name;
          const content = pf.content || "";
          const hash = contentHash(content);
          const prev = hashByPath.get(path);
          const parse = parseFile(path, content);
          languageStats[parse.language] = (languageStats[parse.language] || 0) + 1;

          // Always collect in-memory graph data from real parse (no placeholders)
          for (const call of parse.calls) allCalls.push({ ...call, filePath: path });
          for (const route of parse.routes) allRoutes.push({ ...route, file: route.file || path });
          allHierarchy.push(...parse.hierarchy);
          allDatabase.push(...parse.database);
          for (const imp of parse.imports) {
            const resolved = resolveRelativeImport(path, imp.specifier);
            const toPath = resolved
              ? await resolveToExistingPath(resolved, codeFiles)
              : imp.specifier;
            allDeps.push({
              fromPath: path,
              toPath: toPath || imp.specifier,
              kind: imp.kind || "import",
              specifier: imp.specifier,
              isExternal: Boolean(imp.isExternal) || !resolved,
            });
            if (imp.kind === "package" || (path.endsWith("package.json") && imp.isExternal)) {
              packageImports.push(imp);
            }
          }

          if (options.incremental && prev && prev.contentHash === hash) {
            const existingFile = await prisma.repositoryFile.findUnique({
              where: { repositoryId_path: { repositoryId: repo.id, path } },
              include: { symbols: true },
            });
            if (existingFile) {
              for (const s of existingFile.symbols) allSymbols.push({ ...s, filePath: path });
              parsedFiles.push({
                ...existingFile,
                parse,
                imports: existingFile.imports || parse.imports,
              });
            }
            return;
          }

          if (options.incremental && prev) {
            await prisma.symbol.deleteMany({ where: { fileId: prev.id } });
            await prisma.repositoryFile.delete({ where: { id: prev.id } });
          }

          const parts = path.replace(/\\/g, "/").split("/");
          const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;

          const repoFile = await prisma.repositoryFile.create({
            data: {
              repositoryId: repo.id,
              projectFileId: pf.id,
              path,
              name: pf.name || parts[parts.length - 1],
              extension: path.includes(".") ? path.slice(path.lastIndexOf(".")) : null,
              language: parse.language,
              isFolder: false,
              parentPath,
              contentHash: hash,
              sizeBytes: parse.sizeBytes,
              lineCount: parse.lineCount,
              complexity: estimateComplexity(content),
              exports: parse.exports,
              imports: parse.imports,
              metadata: parse.metadata || {},
              indexedAt: new Date(),
            },
          });

          const symbolRecords = [];
          for (const sym of parse.symbols) {
            const created = await prisma.symbol.create({
              data: {
                repositoryId: repo.id,
                fileId: repoFile.id,
                name: sym.name,
                kind: sym.kind,
                signature: sym.signature,
                startLine: sym.startLine,
                endLine: sym.endLine,
                exported: sym.exported,
                visibility: sym.visibility || "public",
                parentSymbol: sym.parentSymbol,
                documentation: sym.documentation,
                typeInfo: sym.typeInfo,
                metadata: sym.metadata || {},
              },
            });
            symbolRecords.push({ ...created, filePath: path });
            allSymbols.push({ ...created, filePath: path });
          }

          parsedFiles.push({ ...repoFile, parse, symbols: symbolRecords, imports: parse.imports });
        }),
      );

      filesDone = Math.min(i + batch.length, codeFiles.length);
      const progress = codeFiles.length ? filesDone / codeFiles.length : 1;
      setProgress(repo.id, { progress: progress * 0.7, filesDone, stage: "parsing" });
      await prisma.repository.update({
        where: { id: repo.id },
        data: { indexProgress: progress * 0.7, filesIndexed: filesDone },
      });
      await prisma.repoIndexJob.update({
        where: { id: job.id },
        data: { progress: progress * 0.7, filesDone },
      });
    }

    // Folder entries
    setProgress(repo.id, { stage: "folders", progress: 0.72 });
    const folderPaths = new Set();
    for (const f of files) {
      const path = f.path || f.name;
      if (f.isFolder) folderPaths.add(path);
      const parts = path.replace(/\\/g, "/").split("/");
      let acc = "";
      for (let i = 0; i < parts.length - (f.isFolder ? 0 : 1); i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        folderPaths.add(acc);
      }
    }
    for (const folder of folderPaths) {
      await prisma.repositoryFile.upsert({
        where: { repositoryId_path: { repositoryId: repo.id, path: folder } },
        create: {
          repositoryId: repo.id,
          path: folder,
          name: folder.split("/").pop(),
          isFolder: true,
          parentPath: folder.includes("/") ? folder.slice(0, folder.lastIndexOf("/")) : null,
          language: null,
          indexedAt: new Date(),
        },
        update: { isFolder: true, indexedAt: new Date() },
      });
    }

    // Mark circular deps
    setProgress(repo.id, { stage: "dependencies", progress: 0.78 });
    const cycles = detectCycles(
      allDeps.filter((d) => !d.isExternal).map((d) => ({ from: d.fromPath, to: d.toPath })),
    );
    const cyclePairs = new Set();
    for (const cycle of cycles) {
      for (let i = 0; i < cycle.length - 1; i++) {
        cyclePairs.add(`${cycle[i]}->${cycle[i + 1]}`);
      }
    }

    if (!options.incremental) {
      await prisma.dependency.deleteMany({ where: { repositoryId: repo.id } });
    }
    for (const dep of allDeps) {
      const isCircular = cyclePairs.has(`${dep.fromPath}->${dep.toPath}`);
      try {
        await prisma.dependency.upsert({
          where: {
            repositoryId_fromPath_toPath_kind: {
              repositoryId: repo.id,
              fromPath: dep.fromPath,
              toPath: dep.toPath,
              kind: dep.kind || "import",
            },
          },
          create: {
            repositoryId: repo.id,
            fromPath: dep.fromPath,
            toPath: dep.toPath,
            kind: dep.kind || "import",
            specifier: dep.specifier,
            isExternal: dep.isExternal,
            isCircular,
          },
          update: {
            specifier: dep.specifier,
            isExternal: dep.isExternal,
            isCircular,
          },
        });
      } catch {
        // ignore unique races
      }
    }

    // Cross-file references
    setProgress(repo.id, { stage: "references", progress: 0.85 });
    await buildReferences(repo.id, allSymbols, allCalls, parsedFiles);

    // Build & persist graphs
    setProgress(repo.id, { stage: "graphs", progress: 0.9 });
    const repoFiles = await prisma.repositoryFile.findMany({ where: { repositoryId: repo.id } });
    const deps = await prisma.dependency.findMany({ where: { repositoryId: repo.id } });
    const symbols = await prisma.symbol.findMany({ where: { repositoryId: repo.id } });
    const symbolsWithPath = symbols.map((s) => {
      const f = repoFiles.find((rf) => rf.id === s.fileId);
      return { ...s, filePath: f?.path };
    });

    const fileGraph = buildFileGraph(repoFiles);
    const folderGraph = buildFolderGraph(repoFiles);
    const importGraph = buildImportGraph(deps.filter((d) => !d.isExternal || d.kind === "import"));
    const exportGraph = buildExportGraph(repoFiles);
    const dependencyGraph = buildDependencyGraph(deps, packageImports);
    const symbolGraph = buildSymbolGraph(symbolsWithPath);
    const callGraph = buildCallGraph(symbolsWithPath, allCalls);
    const hierarchy = buildClassHierarchy(allHierarchy, symbolsWithPath);
    const moduleGraph = buildModuleGraph(repoFiles, deps);
    const apiGraph = buildApiGraph(allRoutes, symbolsWithPath);
    const databaseGraph = buildDatabaseGraph(allDatabase, symbolsWithPath);
    const componentGraph = buildComponentTree(symbolsWithPath, allCalls);
    const routingGraph = buildRoutingGraph(allRoutes);
    const allGraphs = {
      file: fileGraph,
      folder: folderGraph,
      import: importGraph,
      export: exportGraph,
      dependency: dependencyGraph,
      symbol: symbolGraph,
      call: callGraph,
      hierarchy,
      module: moduleGraph,
      api: apiGraph,
      database: databaseGraph,
      component: componentGraph,
      routing: routingGraph,
    };
    allGraphs.workspace = buildWorkspaceGraph(allGraphs);

    await prisma.importGraph.create({
      data: {
        repositoryId: repo.id,
        nodes: importGraph.nodes,
        edges: importGraph.edges,
        cycles: importGraph.cycles || cycles,
        metadata: { edgeCount: importGraph.edges.length },
      },
    });
    await prisma.callGraph.create({
      data: {
        repositoryId: repo.id,
        nodes: callGraph.nodes,
        edges: callGraph.edges,
        metadata: { edgeCount: callGraph.edges.length },
      },
    });
    await prisma.componentGraph.create({
      data: {
        repositoryId: repo.id,
        nodes: componentGraph.nodes,
        edges: componentGraph.edges,
        roots: componentGraph.roots,
        metadata: { count: componentGraph.nodes.length },
      },
    });
    await prisma.apiGraph.create({
      data: {
        repositoryId: repo.id,
        routes: apiGraph.routes || allRoutes,
        handlers: apiGraph.handlers || [],
        edges: apiGraph.edges,
        metadata: { routeCount: allRoutes.length },
      },
    });

    // Quality + architecture
    setProgress(repo.id, { stage: "quality", progress: 0.95 });
    await prisma.codeMetric.deleteMany({ where: { repositoryId: repo.id } });
    const metrics = analyzeQuality(repoFiles, symbolsWithPath, deps, allCalls);
    for (const metric of metrics.slice(0, 500)) {
      await prisma.codeMetric.create({
        data: {
          repositoryId: repo.id,
          path: metric.path,
          symbolName: metric.symbolName,
          metricType: metric.metricType,
          value: metric.value,
          severity: metric.severity,
          message: metric.message,
          metadata: metric.metadata || {},
        },
      });
    }

    const deadCode = detectDeadCode(symbolsWithPath, allCalls, deps);
    const unusedImports = detectUnusedImports(repoFiles, deps);
    const unusedFiles = detectUnusedFiles(repoFiles, deps);
    const architecture = generateArchitecture({
      files: repoFiles,
      symbols: symbolsWithPath,
      deps,
      routes: allRoutes,
      database: databaseGraph,
      languageStats,
      components: componentGraph,
      packageImports,
      metrics,
      deadCode,
      unusedFiles,
      cycles,
    });

    await prisma.architectureSnapshot.create({
      data: {
        repositoryId: repo.id,
        summary: architecture.summary,
        layers: architecture.layers,
        patterns: architecture.patterns,
        conventions: architecture.conventions,
        techStack: architecture.techStack,
        diagrams: architecture.diagrams,
        violations: architecture.violations,
        metadata: {
          deadCode: deadCode.slice(0, 50),
          unusedImports: unusedImports.slice(0, 50),
          unusedFiles: unusedFiles.slice(0, 50),
          cycles: cycles.slice(0, 20),
        },
      },
    });

    const healthScore = computeHealthScore(metrics, cycles, deadCode, unusedFiles);

    const techInventory = architecture.techStack;
    await prisma.repository.update({
      where: { id: repo.id },
      data: {
        indexStatus: "ready",
        indexProgress: 1,
        filesIndexed: codeFiles.length,
        symbolsIndexed: symbols.length,
        depsIndexed: deps.length,
        languageStats,
        techInventory,
        healthScore,
        summary: architecture.summary,
        lastIndexedAt: new Date(),
        metadata: {
          graphs: Object.keys(allGraphs),
          routeCount: allRoutes.length,
          componentCount: componentGraph.nodes.length,
          modelCount: databaseGraph.nodes.length,
        },
      },
    });

    await workspaceMemory.recordIndex(repo.id, {
      filesIndexed: codeFiles.length,
      symbolsIndexed: symbols.length,
      healthScore,
    });

    await prisma.repoIndexJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        progress: 1,
        stage: "done",
        filesDone: codeFiles.length,
        finishedAt: new Date(),
        result: {
          filesIndexed: codeFiles.length,
          symbolsIndexed: symbols.length,
          healthScore,
        },
      },
    });

    setProgress(repo.id, {
      status: "ready",
      progress: 1,
      stage: "done",
      filesDone: codeFiles.length,
      filesTotal: codeFiles.length,
    });

    return {
      repositoryId: repo.id,
      status: "ready",
      filesIndexed: codeFiles.length,
      symbolsIndexed: symbols.length,
      depsIndexed: deps.length,
      healthScore,
      languageStats,
      techInventory,
      graphs: allGraphs,
      architecture,
    };
  } catch (err) {
    if (repo) {
      await prisma.repository.update({
        where: { id: repo.id },
        data: { indexStatus: "error", indexError: err.message },
      });
      setProgress(repo.id, { status: "error", stage: "error" });
    }
    if (job) {
      await prisma.repoIndexJob.update({
        where: { id: job.id },
        data: { status: "failed", error: err.message, finishedAt: new Date() },
      });
    }
    throw err;
  } finally {
    indexLocks.delete(lockKey);
  }
}

async function clearIndex(repositoryId) {
  await prisma.reference.deleteMany({ where: { repositoryId } });
  await prisma.symbol.deleteMany({ where: { repositoryId } });
  await prisma.dependency.deleteMany({ where: { repositoryId } });
  await prisma.repositoryFile.deleteMany({ where: { repositoryId } });
  await prisma.codeMetric.deleteMany({ where: { repositoryId } });
}

async function resolveToExistingPath(resolved, codeFiles) {
  const candidates = [
    resolved,
    `${resolved}.js`,
    `${resolved}.jsx`,
    `${resolved}.ts`,
    `${resolved}.tsx`,
    `${resolved}.mjs`,
    `${resolved}.cjs`,
    `${resolved}/index.js`,
    `${resolved}/index.ts`,
    `${resolved}/index.tsx`,
    `${resolved}.py`,
    `${resolved}.go`,
    `${resolved}.rs`,
  ];
  const paths = new Set(codeFiles.map((f) => (f.path || f.name).replace(/\\/g, "/")));
  for (const c of candidates) {
    if (paths.has(c)) return c;
  }
  return resolved;
}

async function buildReferences(repositoryId, symbols, calls, parsedFiles) {
  await prisma.reference.deleteMany({ where: { repositoryId } });
  const byName = new Map();
  for (const s of symbols) {
    if (!byName.has(s.name)) byName.set(s.name, []);
    byName.get(s.name).push(s);
  }

  const refs = [];
  for (const call of calls) {
    const targets = byName.get(call.callee) || [];
    for (const target of targets.slice(0, 3)) {
      const file = parsedFiles.find((f) => f.path === call.filePath);
      refs.push({
        repositoryId,
        toSymbolId: target.id,
        fileId: file?.id || null,
        kind: call.kind === "jsx" ? "jsx" : "call",
        name: call.callee,
        line: call.line || 1,
        context: call.filePath,
      });
    }
  }

  // Import references
  for (const f of parsedFiles) {
    const imports = Array.isArray(f.imports) ? f.imports : f.parse?.imports || [];
    for (const imp of imports) {
      refs.push({
        repositoryId,
        fileId: f.id,
        kind: "import",
        name: imp.specifier,
        line: imp.line || 1,
        context: f.path,
      });
    }
  }

  // Batch insert
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100);
    await prisma.reference.createMany({ data: chunk });
  }
}

function estimateComplexity(content) {
  const text = String(content || "");
  const decisions = (text.match(/\b(if|else|for|while|switch|case|catch|\?|&&|\|\|)\b/g) || []).length;
  const lines = text.split("\n").length;
  return Math.round((1 + decisions + lines / 50) * 10) / 10;
}

function computeHealthScore(metrics, cycles, deadCode, unusedFiles) {
  let score = 100;
  const errors = metrics.filter((m) => m.severity === "error").length;
  const warns = metrics.filter((m) => m.severity === "warning").length;
  score -= errors * 5;
  score -= warns * 1.5;
  score -= Math.min(20, cycles.length * 3);
  score -= Math.min(15, deadCode.length * 0.5);
  score -= Math.min(10, unusedFiles.length * 0.3);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

async function reindexFile(projectId, ownerId, filePath) {
  const repo = await ensureRepository(projectId, ownerId);
  return indexRepository(projectId, ownerId, { incremental: true, focusPath: filePath });
}

module.exports = {
  ensureRepository,
  indexRepository,
  reindexFile,
  getProgress,
  setProgress,
  clearIndex,
  SKIP_PATH_RE,
};
