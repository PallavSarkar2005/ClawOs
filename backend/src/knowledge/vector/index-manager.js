const prisma = require("../../database/prisma");
const vectorStore = require("./store");
const { indexForCount } = require("./format");

async function getIndexStatus(userId) {
  const counts = await vectorStore.countVectors(userId);
  const recommended = indexForCount(counts.total);

  const indexes = [];
  try {
    const rows = await prisma.$queryRaw`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE indexname LIKE '%embeddingVector%' OR indexname LIKE '%KnowledgeEmbedding%'
    `;
    for (const r of rows) {
      indexes.push({ name: r.indexname, table: r.tablename });
    }
  } catch {
    /* pg_indexes unavailable */
  }

  return {
    vectorCount: counts,
    recommendedIndex: recommended,
    indexes,
    metrics: {
      hnsw: indexes.some((i) => i.name.includes("hnsw")),
      ivfflat: indexes.some((i) => i.name.includes("ivfflat")),
    },
  };
}

async function optimizeIndexes() {
  await vectorStore.ensureVectorSchema();
  await vectorStore.ensureIndexes();

  const ivfStatements = [
    `CREATE INDEX IF NOT EXISTS "Memory_embeddingVector_ivfflat_ip_idx"
      ON "Memory" USING ivfflat ("embeddingVector" vector_ip_ops) WITH (lists = 100)`,
    `CREATE INDEX IF NOT EXISTS "DocumentChunk_embeddingVector_ivfflat_ip_idx"
      ON "DocumentChunk" USING ivfflat ("embeddingVector" vector_ip_ops) WITH (lists = 100)`,
  ];

  for (const sql of ivfStatements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      console.warn("[IndexManager] IVFFlat:", err.message);
    }
  }

  return getIndexStatus(null);
}

async function setSearchParams({ efSearch = 40 } = {}) {
  try {
    await prisma.$executeRawUnsafe(`SET hnsw.ef_search = ${Math.max(1, Math.min(1000, efSearch))}`);
    return { efSearch };
  } catch (err) {
    return { efSearch, warning: err.message };
  }
}

module.exports = {
  getIndexStatus,
  optimizeIndexes,
  setSearchParams,
  indexForCount,
};
