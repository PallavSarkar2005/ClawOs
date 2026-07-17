const intelligence = require("../intelligence");

function ok(res, data) {
  return res.json(data);
}

function fail(res, err, code = 500) {
  const status = err.message === "Project not found" ? 404 : code;
  return res.status(status).json({ message: err.message || "Intelligence error" });
}

async function status(req, res) {
  try {
    const data = await intelligence.getStatus(req.params.projectId, req.user.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function index(req, res) {
  try {
    const incremental = Boolean(req.body?.incremental);
    // Async for large repos — return job started, but also await for moderate sizes
    const result = await intelligence.indexRepository(req.params.projectId, req.user.id, {
      incremental,
    });
    return ok(res, result);
  } catch (err) {
    return fail(res, err);
  }
}

async function graphs(req, res) {
  try {
    const data = await intelligence.getGraphs(req.params.projectId, req.user.id, req.query.kind || null);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function symbols(req, res) {
  try {
    const data = await intelligence.getSymbols(req.params.projectId, req.user.id, {
      kind: req.query.kind,
      name: req.query.name,
      path: req.query.path,
      limit: Number(req.query.limit) || 200,
      offset: Number(req.query.offset) || 0,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function search(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const q = req.body?.query || req.query.q || "";
    const data = await intelligence.navigation.workspaceSearch(repo.id, q, {
      mode: req.body?.mode || req.query.mode || "hybrid",
      limit: Number(req.body?.limit || req.query.limit) || 40,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function definition(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const data = await intelligence.navigation.goToDefinition(repo.id, {
      name: req.query.name || req.body?.name,
      path: req.query.path || req.body?.path,
      line: Number(req.query.line || req.body?.line) || undefined,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function references(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const data = await intelligence.navigation.findReferences(repo.id, {
      name: req.query.name || req.body?.name,
      symbolId: req.query.symbolId || req.body?.symbolId,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function peek(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const data = await intelligence.navigation.peekDefinition(repo.id, {
      name: req.query.name || req.body?.name,
      path: req.query.path || req.body?.path,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function callHierarchy(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const data = await intelligence.navigation.callHierarchy(repo.id, req.query.name || req.body?.name);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function typeHierarchy(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const data = await intelligence.navigation.typeHierarchy(repo.id, req.query.name || req.body?.name);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function breadcrumbs(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    const data = await intelligence.navigation.breadcrumbs(repo.id, req.query.path || req.body?.path);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function ask(req, res) {
  try {
    const question = req.body?.question || req.query.q || "";
    const data = await intelligence.ask(req.params.projectId, req.user.id, question);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function impact(req, res) {
  try {
    const target = req.body?.target || { path: req.query.path, symbol: req.query.symbol };
    const data = await intelligence.impact(req.params.projectId, req.user.id, target);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function rename(req, res) {
  try {
    const { symbolName, newName } = req.body || {};
    if (!symbolName || !newName) return res.status(400).json({ message: "symbolName and newName required" });
    const data = await intelligence.renamePlan(req.params.projectId, req.user.id, symbolName, newName);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function metrics(req, res) {
  try {
    const data = await intelligence.getMetrics(req.params.projectId, req.user.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function debt(req, res) {
  try {
    const data = await intelligence.getDebt(req.params.projectId, req.user.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function architecture(req, res) {
  try {
    const graphs = await intelligence.getGraphs(req.params.projectId, req.user.id);
    return ok(res, {
      architecture: graphs.architecture,
      diagrams: graphs.architecture?.diagrams,
      layers: graphs.architecture?.layers,
      techStack: graphs.architecture?.techStack,
    });
  } catch (err) {
    return fail(res, err);
  }
}

async function memory(req, res) {
  try {
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    if (req.method === "POST") {
      const { kind, key, value, importance } = req.body || {};
      if (kind === "open_tabs") {
        await intelligence.workspaceMemory.recordOpenTabs(repo.id, value?.tabs || value || []);
      } else if (kind === "architecture_decision") {
        await intelligence.workspaceMemory.recordDecision(repo.id, value);
      } else {
        await intelligence.workspaceMemory.upsertMemory(repo.id, kind, key || "default", value || {}, importance);
      }
      return ok(res, { ok: true });
    }
    const data = await intelligence.workspaceMemory.getWorkspaceContext(repo.id);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function observability(req, res) {
  try {
    const statusData = await intelligence.getStatus(req.params.projectId, req.user.id);
    const metricsData = await intelligence.getMetrics(req.params.projectId, req.user.id);
    const searchStart = Date.now();
    const repo = await intelligence.getRepository(req.params.projectId, req.user.id);
    await intelligence.navigation.workspaceSearch(repo.id, "index", { limit: 5 });
    return ok(res, {
      indexing: statusData.progress,
      repositorySize: statusData.filesIndexed,
      filesIndexed: statusData.filesIndexed,
      symbolsIndexed: statusData.symbolsIndexed,
      dependencies: statusData.depsIndexed,
      healthScore: statusData.healthScore,
      languageStats: statusData.languageStats,
      metricCounts: metricsData.byType,
      searchLatencyMs: Date.now() - searchStart,
      lastIndexedAt: statusData.lastIndexedAt,
    });
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = {
  status,
  index,
  graphs,
  symbols,
  search,
  definition,
  references,
  peek,
  callHierarchy,
  typeHierarchy,
  breadcrumbs,
  ask,
  impact,
  rename,
  metrics,
  debt,
  architecture,
  memory,
  observability,
};
