const prisma = require("../../database/prisma");
const {
  toPgVector,
  distanceToSimilarity,
  distanceOperator,
  DEFAULT_DIM,
} = require("./format");

let schemaReady = false;

async function ensureVectorSchema() {
  if (schemaReady) return true;
  try {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(${DEFAULT_DIM})`,
    );
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(${DEFAULT_DIM})`,
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "KnowledgeEmbedding" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "ownerId" TEXT NOT NULL,
        "sourceType" TEXT NOT NULL,
        "sourceId" TEXT NOT NULL,
        "model" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "dimension" INTEGER NOT NULL DEFAULT ${DEFAULT_DIM},
        "version" INTEGER NOT NULL DEFAULT 1,
        "contentHash" TEXT NOT NULL,
        "vector" vector(${DEFAULT_DIM}) NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    schemaReady = true;
    return true;
  } catch (err) {
    console.warn("[VectorStore] schema init:", err.message);
    return false;
  }
}

async function ensureIndexes() {
  await ensureVectorSchema();
  const statements = [
    `CREATE INDEX IF NOT EXISTS "Memory_embeddingVector_hnsw_cosine_idx"
      ON "Memory" USING hnsw ("embeddingVector" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)`,
    `CREATE INDEX IF NOT EXISTS "DocumentChunk_embeddingVector_hnsw_cosine_idx"
      ON "DocumentChunk" USING hnsw ("embeddingVector" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)`,
    `CREATE INDEX IF NOT EXISTS "KnowledgeEmbedding_vector_hnsw_cosine_idx"
      ON "KnowledgeEmbedding" USING hnsw ("vector" vector_cosine_ops)
      WITH (m = 16, ef_construction = 64)`,
  ];
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err) {
      if (!String(err.message).includes("already exists")) {
        console.warn("[VectorStore] index:", err.message);
      }
    }
  }
}

async function upsertMemoryVector(memoryId, vector, { model = "auto", dim = DEFAULT_DIM } = {}) {
  const pg = toPgVector(vector);
  if (!pg) return false;
  await ensureVectorSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE "Memory" SET "embeddingVector" = $1::vector, "embeddingDim" = $2, "embeddingModel" = $3 WHERE "id" = $4`,
    pg,
    dim,
    model,
    memoryId,
  );
  return true;
}

async function upsertChunkVector(chunkId, vector, { model = "auto", dim = DEFAULT_DIM } = {}) {
  const pg = toPgVector(vector);
  if (!pg) return false;
  await ensureVectorSchema();
  await prisma.$executeRawUnsafe(
    `UPDATE "DocumentChunk" SET "embeddingVector" = $1::vector, "embeddingDim" = $2, "embeddingModel" = $3 WHERE "id" = $4`,
    pg,
    dim,
    model,
    chunkId,
  );
  return true;
}

async function upsertKnowledgeEmbedding({
  id,
  ownerId,
  sourceType,
  sourceId,
  vector,
  model,
  provider,
  contentHash,
  version = 1,
  dimension = DEFAULT_DIM,
}) {
  const pg = toPgVector(vector);
  if (!pg) return false;
  await ensureVectorSchema();
  await prisma.$executeRawUnsafe(
    `INSERT INTO "KnowledgeEmbedding" (
      "id", "ownerId", "sourceType", "sourceId", "model", "provider",
      "dimension", "version", "contentHash", "vector", "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, NOW())
    ON CONFLICT ("id") DO UPDATE SET
      "vector" = EXCLUDED."vector",
      "model" = EXCLUDED."model",
      "provider" = EXCLUDED."provider",
      "version" = EXCLUDED."version",
      "contentHash" = EXCLUDED."contentHash",
      "updatedAt" = NOW()`,
    id,
    ownerId,
    sourceType,
    sourceId,
    model,
    provider,
    dimension,
    version,
    contentHash,
    pg,
  );
  return true;
}

async function searchMemories(userId, queryVector, opts = {}) {
  const {
    topK = 50,
    threshold = 0.12,
    scope,
    projectId,
    pinned,
    metric = "cosine",
  } = opts;

  await ensureVectorSchema();
  const pg = toPgVector(queryVector);
  if (!pg) return [];

  const op = distanceOperator(metric);
  const params = [pg, userId];
  let paramIdx = 3;
  const filters = [`m."ownerId" = $2`, `m."deletedAt" IS NULL`, `m."embeddingVector" IS NOT NULL`];

  if (scope) {
    filters.push(`m."scope" = $${paramIdx}`);
    params.push(scope);
    paramIdx += 1;
  }
  if (projectId) {
    filters.push(`m."projectId" = $${paramIdx}`);
    params.push(projectId);
    paramIdx += 1;
  }
  if (pinned !== undefined) {
    filters.push(`m."pinned" = $${paramIdx}`);
    params.push(!!pinned);
    paramIdx += 1;
  }

  params.push(topK);

  const sql = `
    SELECT
      m."id", m."content", m."scope", m."importance", m."pinned",
      m."confidence", m."frequency", m."decay", m."source", m."tags",
      m."metadata", m."documentId", m."projectId", m."agentType",
      m."createdAt", m."updatedAt", m."lastAccessed",
      m."embeddingVector" ${op} $1::vector AS distance
    FROM "Memory" m
    WHERE ${filters.join(" AND ")}
    ORDER BY distance ASC
    LIMIT $${paramIdx}
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...params);

  return rows
    .map((r) => ({
      ...r,
      semanticScore: distanceToSimilarity(r.distance, metric),
      distance: Number(r.distance),
    }))
    .filter((r) => r.semanticScore >= threshold);
}

async function searchChunks(userId, queryVector, opts = {}) {
  const {
    topK = 50,
    threshold = 0.12,
    documentIds,
    metric = "cosine",
  } = opts;

  await ensureVectorSchema();
  const pg = toPgVector(queryVector);
  if (!pg) return [];

  const op = distanceOperator(metric);
  const params = [pg, userId];
  let paramIdx = 3;
  const filters = [
    `c."deletedAt" IS NULL`,
    `d."userId" = $2`,
    `d."deletedAt" IS NULL`,
    `c."embeddingVector" IS NOT NULL`,
  ];

  if (documentIds?.length) {
    const placeholders = documentIds.map((_, i) => `$${paramIdx + i}`).join(", ");
    filters.push(`d."id" IN (${placeholders})`);
    params.push(...documentIds);
    paramIdx += documentIds.length;
  }

  params.push(topK);

  const sql = `
    SELECT
      c."id", c."content", c."chunkIndex", c."tokenCount", c."heading",
      c."chunkType", c."pageStart", c."pageEnd", c."lineStart", c."lineEnd",
      c."metadata", c."documentId", d."name" AS "documentName", d."fileType",
      c."embeddingVector" ${op} $1::vector AS distance
    FROM "DocumentChunk" c
    INNER JOIN "Document" d ON d."id" = c."documentId"
    WHERE ${filters.join(" AND ")}
    ORDER BY distance ASC
    LIMIT $${paramIdx}
  `;

  const rows = await prisma.$queryRawUnsafe(sql, ...params);

  return rows
    .map((r) => ({
      ...r,
      semanticScore: distanceToSimilarity(r.distance, metric),
      distance: Number(r.distance),
    }))
    .filter((r) => r.semanticScore >= threshold);
}

async function countVectors(userId) {
  await ensureVectorSchema();
  const [memCount, chunkCount] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "Memory"
       WHERE "ownerId" = $1 AND "deletedAt" IS NULL AND "embeddingVector" IS NOT NULL`,
      userId,
    ),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*)::int AS count FROM "DocumentChunk" c
       INNER JOIN "Document" d ON d."id" = c."documentId"
       WHERE d."userId" = $1 AND c."deletedAt" IS NULL AND c."embeddingVector" IS NOT NULL`,
      userId,
    ),
  ]);
  return {
    memories: memCount[0]?.count || 0,
    chunks: chunkCount[0]?.count || 0,
    total: (memCount[0]?.count || 0) + (chunkCount[0]?.count || 0),
  };
}

async function backfillVectors(userId, { batchSize = 50 } = {}) {
  await ensureVectorSchema();
  let migrated = 0;

  const memories = await prisma.memory.findMany({
    where: { ownerId: userId, deletedAt: null },
    select: { id: true, embedding: true, embeddingModel: true, embeddingDim: true },
    take: batchSize,
  });

  for (const m of memories) {
    if (!Array.isArray(m.embedding) || !m.embedding.length) continue;
    const ok = await upsertMemoryVector(m.id, m.embedding, {
      model: m.embeddingModel || "auto",
      dim: m.embeddingDim || m.embedding.length,
    });
    if (ok) migrated += 1;
  }

  const chunks = await prisma.documentChunk.findMany({
    where: { deletedAt: null, document: { userId, deletedAt: null } },
    select: { id: true, embedding: true, embeddingModel: true, embeddingDim: true },
    take: batchSize,
  });

  for (const c of chunks) {
    if (!Array.isArray(c.embedding) || !c.embedding.length) continue;
    const ok = await upsertChunkVector(c.id, c.embedding, {
      model: c.embeddingModel || "auto",
      dim: c.embeddingDim || c.embedding.length,
    });
    if (ok) migrated += 1;
  }

  return { migrated };
}

module.exports = {
  ensureVectorSchema,
  ensureIndexes,
  upsertMemoryVector,
  upsertChunkVector,
  upsertKnowledgeEmbedding,
  searchMemories,
  searchChunks,
  countVectors,
  backfillVectors,
  toPgVector,
  fromPgVector: require("./format").fromPgVector,
  distanceToSimilarity,
};
