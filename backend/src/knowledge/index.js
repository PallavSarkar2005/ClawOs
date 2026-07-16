const vectorStore = require("./vector/store");
const indexManager = require("./vector/index-manager");
const embeddingSync = require("./embeddings/sync");
const knowledgeRetrieval = require("./retrieval/engine");
const graphEngine = require("./graph/engine");
const ltmEngine = require("./memory/ltm");
const searchEngine = require("./search/engine");
const inspector = require("./observability/inspector");
const evaluation = require("./evaluation/metrics");
const semanticChunker = require("./chunking/engine");
const { startKnowledgeWorkers, queue } = require("./workers/queue");

async function initKnowledgeEngine() {
  await vectorStore.ensureVectorSchema();
  await vectorStore.ensureIndexes();
  startKnowledgeWorkers();
}

module.exports = {
  vectorStore,
  indexManager,
  embeddingSync,
  knowledgeRetrieval,
  graphEngine,
  ltmEngine,
  searchEngine,
  inspector,
  evaluation,
  semanticChunker,
  queue,
  initKnowledgeEngine,
  startKnowledgeWorkers,
};
