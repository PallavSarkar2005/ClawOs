const {
  memoryService,
  documentService,
  retrievalEngine,
  contextBuilder,
  citationEngine,
  collectionRepository,
  relationshipRepository,
  indexJobRepository,
  MEMORY_SCOPES,
} = require("../memory");

function handleError(res, error) {
  console.error("[MemoryController]", error);
  const status = error.status || 500;
  res.status(status).json({ message: error.message || "Server Error" });
}

// -------- Memories --------

async function listMemories(req, res) {
  try {
    const result = await memoryService.list(req.user.id, {
      scope: req.query.scope,
      pinned: req.query.pinned,
      tags: req.query.tags ? String(req.query.tags).split(",") : undefined,
      projectId: req.query.projectId,
      agentType: req.query.agentType,
      q: req.query.q || req.query.search,
      skip: req.query.skip,
      take: req.query.take || req.query.limit,
      orderBy: req.query.orderBy,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function getMemory(req, res) {
  try {
    const memory = await memoryService.get(req.user.id, req.params.id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });
    res.json(memory);
  } catch (error) {
    handleError(res, error);
  }
}

async function createMemory(req, res) {
  try {
    const memory = await memoryService.create(req.user.id, req.body);
    res.status(201).json(memory);
  } catch (error) {
    handleError(res, error);
  }
}

async function updateMemory(req, res) {
  try {
    const memory = await memoryService.update(req.user.id, req.params.id, req.body);
    if (!memory) return res.status(404).json({ message: "Memory not found" });
    res.json(memory);
  } catch (error) {
    handleError(res, error);
  }
}

async function pinMemory(req, res) {
  try {
    const pinned = req.body.pinned !== undefined ? !!req.body.pinned : true;
    const memory = await memoryService.pin(req.user.id, req.params.id, pinned);
    if (!memory) return res.status(404).json({ message: "Memory not found" });
    res.json(memory);
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteMemory(req, res) {
  try {
    const memory = await memoryService.remove(req.user.id, req.params.id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteAllMemories(req, res) {
  try {
    const result = await memoryService.removeAll(req.user.id);
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    handleError(res, error);
  }
}

async function reembedMemory(req, res) {
  try {
    const memory = await memoryService.reembed(req.user.id, req.params.id);
    if (!memory) return res.status(404).json({ message: "Memory not found" });
    res.json(memory);
  } catch (error) {
    handleError(res, error);
  }
}

async function memoryStats(req, res) {
  try {
    const stats = await memoryService.stats(req.user.id);
    const jobs = await indexJobRepository.list(req.user.id, { take: 10 });
    const docs = await documentService.list(req.user.id, { take: 5 });
    res.json({
      ...stats,
      documents: docs.total,
      jobs: jobs.items,
      scopes: MEMORY_SCOPES,
    });
  } catch (error) {
    handleError(res, error);
  }
}

async function memoryHistory(req, res) {
  try {
    const history = await memoryService.history(req.user.id, {
      skip: req.query.skip,
      take: req.query.take,
    });
    res.json({ items: history });
  } catch (error) {
    handleError(res, error);
  }
}

// -------- Search / Context / Citations --------

async function searchMemory(req, res) {
  try {
    const query = req.body.query || req.query.q;
    if (!query) return res.status(400).json({ message: "query is required" });
    const mode = req.body.mode || req.query.mode || "hybrid";
    const opts = {
      topK: Number(req.body.topK || req.query.topK || 10),
      threshold: Number(req.body.threshold || 0.12),
      scope: req.body.scope,
      projectId: req.body.projectId,
      documentIds: req.body.documentIds,
      useMmr: req.body.useMmr !== false,
    };

    let result;
    if (mode === "semantic") {
      const { results } = await retrievalEngine.semanticSearch(req.user.id, query, opts);
      result = { query, mode, count: results.length, results: results.slice(0, opts.topK) };
    } else if (mode === "keyword") {
      const results = await retrievalEngine.keywordSearch(req.user.id, query, opts);
      result = { query, mode, count: results.length, results };
    } else {
      result = { mode, ...(await retrievalEngine.hybridSearch(req.user.id, query, opts)) };
    }

    const citations = citationEngine.fromRetrievalResults(result.results || []);
    res.json({ ...result, citations });
  } catch (error) {
    handleError(res, error);
  }
}

async function buildContext(req, res) {
  try {
    const prompt = req.body.prompt || req.body.query;
    if (!prompt) return res.status(400).json({ message: "prompt is required" });
    const built = await contextBuilder.build(req.user.id, prompt, req.body);
    res.json(built);
  } catch (error) {
    handleError(res, error);
  }
}

// -------- Documents --------

async function listDocuments(req, res) {
  try {
    const result = await documentService.list(req.user.id, {
      status: req.query.status,
      q: req.query.q,
      skip: req.query.skip,
      take: req.query.take,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function uploadDocument(req, res) {
  try {
    const result = await documentService.upload(req.user.id, req.file, {
      projectId: req.body.projectId,
      workspaceId: req.body.workspaceId,
    });
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function getDocument(req, res) {
  try {
    const preview = await documentService.preview(req.user.id, req.params.id);
    if (!preview) return res.status(404).json({ message: "Document not found" });
    res.json(preview);
  } catch (error) {
    handleError(res, error);
  }
}

async function getDocumentChunks(req, res) {
  try {
    const chunks = await documentService.getChunks(req.user.id, req.params.id);
    if (!chunks) return res.status(404).json({ message: "Document not found" });
    res.json({ items: chunks });
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteDocument(req, res) {
  try {
    const doc = await documentService.remove(req.user.id, req.params.id);
    if (!doc) return res.status(404).json({ message: "Document not found" });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

async function reindexDocument(req, res) {
  try {
    const result = await documentService.enqueueReindex(req.user.id, req.params.id);
    if (!result) return res.status(404).json({ message: "Document not found" });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function listJobs(req, res) {
  try {
    const result = await indexJobRepository.list(req.user.id, {
      status: req.query.status,
      skip: req.query.skip,
      take: req.query.take,
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

async function getJob(req, res) {
  try {
    const job = await indexJobRepository.findById(req.params.jobId, req.user.id);
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.json(job);
  } catch (error) {
    handleError(res, error);
  }
}

// -------- Collections --------

async function listCollections(req, res) {
  try {
    const items = await collectionRepository.list(req.user.id);
    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
}

async function createCollection(req, res) {
  try {
    const col = await collectionRepository.create({
      name: req.body.name,
      description: req.body.description,
      color: req.body.color,
      isShared: !!req.body.isShared,
      ownerId: req.user.id,
    });
    res.status(201).json(col);
  } catch (error) {
    handleError(res, error);
  }
}

async function updateCollection(req, res) {
  try {
    const col = await collectionRepository.update(req.params.id, req.user.id, req.body);
    if (!col) return res.status(404).json({ message: "Collection not found" });
    res.json(col);
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteCollection(req, res) {
  try {
    const col = await collectionRepository.remove(req.params.id, req.user.id);
    if (!col) return res.status(404).json({ message: "Collection not found" });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

async function addToCollection(req, res) {
  try {
    const item = await collectionRepository.addMemory(req.params.id, req.body.memoryId, req.user.id);
    if (!item) return res.status(404).json({ message: "Collection or memory not found" });
    res.json(item);
  } catch (error) {
    handleError(res, error);
  }
}

async function removeFromCollection(req, res) {
  try {
    const result = await collectionRepository.removeMemory(req.params.id, req.params.memoryId, req.user.id);
    if (!result) return res.status(404).json({ message: "Collection not found" });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
}

// -------- Relationships / Graph --------

async function listRelationships(req, res) {
  try {
    const items = await relationshipRepository.list(req.user.id, {
      memoryId: req.query.memoryId,
      type: req.query.type,
    });
    res.json({ items });
  } catch (error) {
    handleError(res, error);
  }
}

async function createRelationship(req, res) {
  try {
    const edge = await relationshipRepository.create(
      req.user.id,
      req.body.fromId,
      req.body.toId,
      req.body.type || "related",
      req.body.weight,
      req.body.metadata,
    );
    if (!edge) return res.status(404).json({ message: "Memory nodes not found" });
    res.status(201).json(edge);
  } catch (error) {
    handleError(res, error);
  }
}

async function traverseGraph(req, res) {
  try {
    const graph = await relationshipRepository.traverse(req.user.id, req.params.id, {
      depth: Number(req.query.depth || 2),
      type: req.query.type,
    });
    res.json(graph);
  } catch (error) {
    handleError(res, error);
  }
}

async function deleteRelationship(req, res) {
  try {
    const edge = await relationshipRepository.remove(req.params.id, req.user.id);
    if (!edge) return res.status(404).json({ message: "Relationship not found" });
    res.json({ success: true });
  } catch (error) {
    handleError(res, error);
  }
}

module.exports = {
  listMemories,
  getMemory,
  createMemory,
  updateMemory,
  pinMemory,
  deleteMemory,
  deleteAllMemories,
  reembedMemory,
  memoryStats,
  memoryHistory,
  searchMemory,
  buildContext,
  listDocuments,
  uploadDocument,
  getDocument,
  getDocumentChunks,
  deleteDocument,
  reindexDocument,
  listJobs,
  getJob,
  listCollections,
  createCollection,
  updateCollection,
  deleteCollection,
  addToCollection,
  removeFromCollection,
  listRelationships,
  createRelationship,
  traverseGraph,
  deleteRelationship,
  // backward compatible aliases
  getMemories: listMemories,
};
