const {
  knowledgeRetrieval,
  searchEngine,
  graphEngine,
  ltmEngine,
  vectorStore,
  indexManager,
  inspector,
  evaluation,
  queue,
  embeddingSync,
} = require("../knowledge");
const prisma = require("../database/prisma");

function handleError(res, error) {
  console.error("[KnowledgeController]", error);
  const status = error.status || 500;
  res.status(status).json({ message: error.message || "Server Error" });
}

async function search(req, res) {
  try {
    const query = req.body.query || req.query.q;
    if (!query) return res.status(400).json({ message: "query is required" });
    const mode = req.body.mode || req.query.mode || "hybrid";
    const result = await searchEngine.search(req.user.id, query, {
      mode,
      topK: Number(req.body.topK || req.query.topK || 15),
      threshold: Number(req.body.threshold || 0.12),
      scope: req.body.scope,
      projectId: req.body.projectId,
      documentIds: req.body.documentIds,
      agentType: req.body.agentType,
      workspaceId: req.body.workspaceId,
      collectionId: req.body.collectionId,
      pinned: req.body.pinned,
      useMmr: req.body.useMmr !== false,
      rerank: req.body.rerank !== false,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function hybridSearch(req, res) {
  try {
    const query = req.body.query || req.query.q;
    if (!query) return res.status(400).json({ message: "query is required" });
    const result = await knowledgeRetrieval.hybridSearch(req.user.id, query, req.body);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function semanticSearch(req, res) {
  try {
    const query = req.body.query || req.query.q;
    if (!query) return res.status(400).json({ message: "query is required" });
    const result = await knowledgeRetrieval.semanticSearch(req.user.id, query, req.body);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function searchHistory(req, res) {
  try {
    const items = await searchEngine.history(req.user.id, { take: req.query.take });
    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
}

async function getGraph(req, res) {
  try {
    const { id } = req.params;
    const depth = Number(req.query.depth || 2);
    const graph = await graphEngine.traverse(req.user.id, id, { depth });
    res.json(graph);
  } catch (error) {
    handleError(res, error);
  }
}

async function graphMetrics(req, res) {
  try {
    const metrics = await graphEngine.computeMetrics(req.user.id);
    res.json(metrics);
  } catch (error) {
    handleError(res, error);
  }
}

async function listCollections(req, res) {
  try {
    const items = await prisma.knowledgeCollection.findMany({
      where: { ownerId: req.user.id },
      include: { _count: { select: { nodes: true } } },
      orderBy: { updatedAt: "desc" },
    });
    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
}

async function createCollection(req, res) {
  try {
    const col = await prisma.knowledgeCollection.create({
      data: {
        ownerId: req.user.id,
        name: req.body.name,
        description: req.body.description,
        color: req.body.color,
        pinned: !!req.body.pinned,
        isShared: !!req.body.isShared,
        metadata: req.body.metadata || {},
      },
    });
    res.status(201).json(col);
  } catch (error) {
    handleError(res, error);
  }
}

async function listPinned(req, res) {
  try {
    const result = await ltmEngine.listPinned(req.user.id);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function listArchived(req, res) {
  try {
    const items = await ltmEngine.listArchived(req.user.id);
    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
}

async function reinforceMemory(req, res) {
  try {
    const result = await ltmEngine.reinforce(req.user.id, req.params.id, req.body);
    if (!result) return res.status(404).json({ message: "Memory not found" });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function indexStatus(req, res) {
  try {
    const status = await indexManager.getIndexStatus(req.user.id);
    res.json(status);
  } catch (error) {
    handleError(res, error);
  }
}

async function optimizeIndexes(req, res) {
  try {
    const result = await indexManager.optimizeIndexes();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function embeddingStatus(req, res) {
  try {
    const counts = await vectorStore.countVectors(req.user.id);
    const pending = await prisma.memory.count({
      where: { ownerId: req.user.id, deletedAt: null, embedding: null },
    });
    res.json({ counts, pendingMemories: pending });
  } catch (error) {
    handleError(res, error);
  }
}

async function backfill(req, res) {
  try {
    const job = await queue.enqueue(req.user.id, "reindex", { reason: "manual" });
    res.status(202).json({ jobId: job.id, status: job.status });
  } catch (error) {
    handleError(res, error);
  }
}

async function inspectRetrieval(req, res) {
  try {
    const payload = await inspector.buildInspectorPayload(req.user.id, req.params.id);
    res.json(payload);
  } catch (error) {
    handleError(res, error);
  }
}

async function evaluate(req, res) {
  try {
    const metrics = await evaluation.evaluateRetrieval(req.user.id, req.body);
    res.json(metrics);
  } catch (error) {
    handleError(res, error);
  }
}

async function listNodes(req, res) {
  try {
    const where = { ownerId: req.user.id, deletedAt: null };
    if (req.query.sourceType) where.sourceType = req.query.sourceType;
    if (req.query.scope) where.scope = req.query.scope;
    if (req.query.pinned === "true") where.pinned = true;
    const items = await prisma.knowledgeNode.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: Math.min(Number(req.query.take) || 50, 200),
    });
    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
}

async function getNode(req, res) {
  try {
    const node = await prisma.knowledgeNode.findFirst({
      where: { id: req.params.id, ownerId: req.user.id, deletedAt: null },
      include: {
        edgesFrom: { include: { to: true } },
        edgesTo: { include: { from: true } },
        collection: true,
      },
    });
    if (!node) return res.status(404).json({ message: "Node not found" });
    res.json(node);
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  search,
  hybridSearch,
  semanticSearch,
  searchHistory,
  getGraph,
  graphMetrics,
  listCollections,
  createCollection,
  listPinned,
  listArchived,
  reinforceMemory,
  indexStatus,
  optimizeIndexes,
  embeddingStatus,
  backfill,
  inspectRetrieval,
  evaluate,
  listNodes,
  getNode,
};
