const prisma = require("../../database/prisma");
const vectorStore = require("../vector/store");

async function buildInspectorPayload(userId, retrievalId) {
  const retrieval = retrievalId
    ? await prisma.retrieval.findFirst({ where: { id: retrievalId, ownerId: userId } })
    : null;

  const citations = retrieval
    ? await prisma.citation.findMany({ where: { retrievalId }, orderBy: { similarity: "desc" } })
    : [];

  const counts = await vectorStore.countVectors(userId);

  return {
    retrieval: retrieval
      ? {
          id: retrieval.id,
          query: retrieval.query,
          mode: retrieval.mode,
          resultCount: retrieval.resultCount,
          latencyMs: retrieval.latencyMs,
          indexUsed: retrieval.indexUsed,
          embeddingModel: retrieval.embeddingModel,
          distanceMetric: retrieval.distanceMetric,
          filters: retrieval.filters,
          results: retrieval.results,
        }
      : null,
    citations: citations.map((c) => ({
      id: c.id,
      sourceType: c.sourceType,
      sourceId: c.sourceId,
      confidence: c.confidence,
      similarity: c.similarity,
      page: c.page,
      chunkIndex: c.chunkIndex,
      documentName: c.documentName,
      filePath: c.filePath,
      repository: c.repository,
      excerpt: c.content?.slice(0, 300),
    })),
    vectors: counts,
    timestamp: new Date().toISOString(),
  };
}

async function getGraphPath(ownerId, nodeId, depth = 3) {
  const graphEngine = require("../graph/engine");
  return graphEngine.traverse(ownerId, nodeId, { depth });
}

module.exports = {
  buildInspectorPayload,
  getGraphPath,
};
