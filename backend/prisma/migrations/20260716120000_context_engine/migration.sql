-- CreateTable
CREATE TABLE "ContextSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "projectId" TEXT,
    "agentExecutionId" TEXT,
    "agentType" TEXT,
    "query" TEXT NOT NULL,
    "modelLimit" INTEGER NOT NULL DEFAULT 128000,
    "tokenBudget" INTEGER NOT NULL DEFAULT 6000,
    "usedTokens" INTEGER NOT NULL DEFAULT 0,
    "compressionRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "allocation" JSONB NOT NULL DEFAULT '{}',
    "dropped" JSONB NOT NULL DEFAULT '[]',
    "reasoningPath" JSONB NOT NULL DEFAULT '[]',
    "graph" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'built',
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetrievedContext" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceId" TEXT,
    "content" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrievedContext_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContextScore" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "frequency" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "agentRelevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "projectRelevance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pinned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "collectionWeight" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "executionSuccess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "factors" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContextScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ContextSummary" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "projectId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'conversation',
    "originalTokens" INTEGER NOT NULL DEFAULT 0,
    "summaryTokens" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "sourceIds" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContextSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompressionHistory" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "ratio" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompressionHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RankingMetrics" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RankingMetrics_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContextSession_userId_createdAt_idx" ON "ContextSession"("userId", "createdAt");
CREATE INDEX "ContextSession_conversationId_idx" ON "ContextSession"("conversationId");
CREATE INDEX "ContextSession_agentExecutionId_idx" ON "ContextSession"("agentExecutionId");
CREATE INDEX "ContextSession_projectId_idx" ON "ContextSession"("projectId");
CREATE INDEX "ContextSession_agentType_idx" ON "ContextSession"("agentType");

CREATE INDEX "RetrievedContext_sessionId_selected_idx" ON "RetrievedContext"("sessionId", "selected");
CREATE INDEX "RetrievedContext_source_type_idx" ON "RetrievedContext"("source", "type");
CREATE INDEX "RetrievedContext_sourceId_idx" ON "RetrievedContext"("sourceId");

CREATE INDEX "ContextScore_sessionId_idx" ON "ContextScore"("sessionId");
CREATE INDEX "ContextScore_finalScore_idx" ON "ContextScore"("finalScore");

CREATE INDEX "ContextSummary_userId_kind_idx" ON "ContextSummary"("userId", "kind");
CREATE INDEX "ContextSummary_conversationId_idx" ON "ContextSummary"("conversationId");
CREATE INDEX "ContextSummary_sessionId_idx" ON "ContextSummary"("sessionId");

CREATE INDEX "CompressionHistory_sessionId_idx" ON "CompressionHistory"("sessionId");
CREATE INDEX "CompressionHistory_method_idx" ON "CompressionHistory"("method");

CREATE INDEX "RankingMetrics_sessionId_key_idx" ON "RankingMetrics"("sessionId", "key");

ALTER TABLE "ContextSession" ADD CONSTRAINT "ContextSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RetrievedContext" ADD CONSTRAINT "RetrievedContext_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ContextSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextScore" ADD CONSTRAINT "ContextScore_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ContextSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContextSummary" ADD CONSTRAINT "ContextSummary_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ContextSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompressionHistory" ADD CONSTRAINT "CompressionHistory_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ContextSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RankingMetrics" ADD CONSTRAINT "RankingMetrics_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ContextSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
