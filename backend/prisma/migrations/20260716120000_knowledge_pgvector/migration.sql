-- Phase 5: pgvector columns and indexes for production vector search
CREATE EXTENSION IF NOT EXISTS vector;

-- Memory vector column
ALTER TABLE "Memory" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);

-- DocumentChunk vector column
ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embeddingVector" vector(1536);

-- Knowledge embedding vectors (unified store)
CREATE TABLE IF NOT EXISTS "KnowledgeEmbedding" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "dimension" INTEGER NOT NULL DEFAULT 1536,
  "version" INTEGER NOT NULL DEFAULT 1,
  "contentHash" TEXT NOT NULL,
  "vector" vector(1536) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KnowledgeEmbedding_ownerId_sourceType_idx"
  ON "KnowledgeEmbedding"("ownerId", "sourceType");
CREATE INDEX IF NOT EXISTS "KnowledgeEmbedding_sourceType_sourceId_idx"
  ON "KnowledgeEmbedding"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "KnowledgeEmbedding_contentHash_model_idx"
  ON "KnowledgeEmbedding"("contentHash", "model");

-- HNSW indexes for cosine similarity (production default)
CREATE INDEX IF NOT EXISTS "Memory_embeddingVector_hnsw_cosine_idx"
  ON "Memory" USING hnsw ("embeddingVector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embeddingVector_hnsw_cosine_idx"
  ON "DocumentChunk" USING hnsw ("embeddingVector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS "KnowledgeEmbedding_vector_hnsw_cosine_idx"
  ON "KnowledgeEmbedding" USING hnsw ("vector" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- IVFFlat indexes for large-scale fallback (dot product)
CREATE INDEX IF NOT EXISTS "Memory_embeddingVector_ivfflat_ip_idx"
  ON "Memory" USING ivfflat ("embeddingVector" vector_ip_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embeddingVector_ivfflat_ip_idx"
  ON "DocumentChunk" USING ivfflat ("embeddingVector" vector_ip_ops)
  WITH (lists = 100);

-- Migrate existing JSON embeddings to vector columns
UPDATE "Memory"
SET "embeddingVector" = ("embedding"::text)::vector
WHERE "embedding" IS NOT NULL
  AND "embeddingVector" IS NULL
  AND jsonb_typeof("embedding"::jsonb) = 'array';

UPDATE "DocumentChunk"
SET "embeddingVector" = ("embedding"::text)::vector
WHERE "embedding" IS NOT NULL
  AND "embeddingVector" IS NULL
  AND jsonb_typeof("embedding"::jsonb) = 'array';
