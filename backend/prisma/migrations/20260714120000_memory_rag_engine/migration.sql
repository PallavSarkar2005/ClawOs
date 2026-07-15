-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable Message
ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "citations" JSONB;

-- Drop old Memory and recreate with full schema (migrate data)
ALTER TABLE "Memory" RENAME TO "Memory_old";

ALTER TABLE "Memory_old"
RENAME CONSTRAINT "Memory_pkey"
TO "Memory_old_pkey";

CREATE TABLE "Memory" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'USER',
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "frequency" INTEGER NOT NULL DEFAULT 0,
    "decay" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "source" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "relationships" JSONB NOT NULL DEFAULT '[]',
    "embedding" JSONB,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "contentHash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT,
    "conversationId" TEXT,
    "agentType" TEXT,
    "workflowId" TEXT,
    "documentId" TEXT,
    "workspaceId" TEXT,
    "collectionId" TEXT,
    CONSTRAINT "Memory_pkey" PRIMARY KEY ("id")
);

INSERT INTO "Memory" ("id", "content", "ownerId", "scope", "createdAt", "updatedAt", "lastAccessed")
SELECT "id", "content", "userId", 'USER', "createdAt", "createdAt", "createdAt" FROM "Memory_old";

DROP TABLE "Memory_old";

CREATE INDEX "Memory_ownerId_scope_idx" ON "Memory"("ownerId", "scope");
CREATE INDEX "Memory_ownerId_deletedAt_idx" ON "Memory"("ownerId", "deletedAt");
CREATE INDEX "Memory_ownerId_pinned_idx" ON "Memory"("ownerId", "pinned");
CREATE INDEX "Memory_ownerId_lastAccessed_idx" ON "Memory"("ownerId", "lastAccessed");
CREATE INDEX "Memory_projectId_idx" ON "Memory"("projectId");
CREATE INDEX "Memory_documentId_idx" ON "Memory"("documentId");
CREATE INDEX "Memory_contentHash_idx" ON "Memory"("contentHash");
CREATE INDEX "Memory_agentType_idx" ON "Memory"("agentType");

ALTER TABLE "Memory" ADD CONSTRAINT "Memory_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MemoryVersion
CREATE TABLE "MemoryVersion" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryVersion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryVersion_memoryId_idx" ON "MemoryVersion"("memoryId");
CREATE UNIQUE INDEX "MemoryVersion_memoryId_version_key" ON "MemoryVersion"("memoryId", "version");
ALTER TABLE "MemoryVersion" ADD CONSTRAINT "MemoryVersion_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MemoryEdge
CREATE TABLE "MemoryEdge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryEdge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryEdge_fromId_idx" ON "MemoryEdge"("fromId");
CREATE INDEX "MemoryEdge_toId_idx" ON "MemoryEdge"("toId");
CREATE INDEX "MemoryEdge_ownerId_idx" ON "MemoryEdge"("ownerId");
CREATE UNIQUE INDEX "MemoryEdge_fromId_toId_type_key" ON "MemoryEdge"("fromId", "toId", "type");
ALTER TABLE "MemoryEdge" ADD CONSTRAINT "MemoryEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemoryEdge" ADD CONSTRAINT "MemoryEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "Memory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MemoryCollection
CREATE TABLE "MemoryCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryCollection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryCollection_ownerId_idx" ON "MemoryCollection"("ownerId");
ALTER TABLE "MemoryCollection" ADD CONSTRAINT "MemoryCollection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Memory" ADD CONSTRAINT "Memory_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MemoryCollection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MemoryCollectionItem" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "memoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryCollectionItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MemoryCollectionItem_collectionId_memoryId_key" ON "MemoryCollectionItem"("collectionId", "memoryId");
CREATE INDEX "MemoryCollectionItem_memoryId_idx" ON "MemoryCollectionItem"("memoryId");
ALTER TABLE "MemoryCollectionItem" ADD CONSTRAINT "MemoryCollectionItem_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "MemoryCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MemoryAccessLog
CREATE TABLE "MemoryAccessLog" (
    "id" TEXT NOT NULL,
    "memoryId" TEXT,
    "ownerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "query" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemoryAccessLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryAccessLog_ownerId_createdAt_idx" ON "MemoryAccessLog"("ownerId", "createdAt");
CREATE INDEX "MemoryAccessLog_memoryId_idx" ON "MemoryAccessLog"("memoryId");
ALTER TABLE "MemoryAccessLog" ADD CONSTRAINT "MemoryAccessLog_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "Memory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemoryAccessLog" ADD CONSTRAINT "MemoryAccessLog_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enhance Document
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileType" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "indexProgress" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "indexError" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "tokenCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "chunkCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "contentHash" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "metadata" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "projectId" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;
ALTER TABLE "Document" ALTER COLUMN "content" SET DEFAULT '';

CREATE INDEX IF NOT EXISTS "Document_userId_deletedAt_idx" ON "Document"("userId", "deletedAt");
CREATE INDEX IF NOT EXISTS "Document_userId_status_idx" ON "Document"("userId", "status");
CREATE INDEX IF NOT EXISTS "Document_contentHash_idx" ON "Document"("contentHash");

-- DocumentChunk
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "contentHash" TEXT,
    "embedding" JSONB,
    "embeddingModel" TEXT,
    "embeddingDim" INTEGER,
    "pageStart" INTEGER,
    "pageEnd" INTEGER,
    "lineStart" INTEGER,
    "lineEnd" INTEGER,
    "heading" TEXT,
    "chunkType" TEXT NOT NULL DEFAULT 'semantic',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "parentChunkId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentChunk_documentId_chunkIndex_idx" ON "DocumentChunk"("documentId", "chunkIndex");
CREATE INDEX "DocumentChunk_documentId_deletedAt_idx" ON "DocumentChunk"("documentId", "deletedAt");
CREATE INDEX "DocumentChunk_contentHash_idx" ON "DocumentChunk"("contentHash");
CREATE UNIQUE INDEX "DocumentChunk_documentId_chunkIndex_version_key" ON "DocumentChunk"("documentId", "chunkIndex", "version");
ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- IndexJob
CREATE TABLE "IndexJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'index',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stage" TEXT,
    "error" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IndexJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "IndexJob_userId_status_idx" ON "IndexJob"("userId", "status");
CREATE INDEX "IndexJob_status_createdAt_idx" ON "IndexJob"("status", "createdAt");
CREATE INDEX "IndexJob_documentId_idx" ON "IndexJob"("documentId");
ALTER TABLE "IndexJob" ADD CONSTRAINT "IndexJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IndexJob" ADD CONSTRAINT "IndexJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Setting embedding fields
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "embeddingProvider" TEXT NOT NULL DEFAULT 'openrouter';
ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "embeddingModel" TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small';

-- Mark existing documents as indexed (legacy full-text)
UPDATE "Document" SET "status" = 'indexed', "indexProgress" = 100 WHERE "content" IS NOT NULL AND LENGTH("content") > 0 AND ("status" IS NULL OR "status" = 'pending');
