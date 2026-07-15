-- Agent Runtime persistence (Phase 2)

CREATE TABLE IF NOT EXISTS "AgentExecution" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "projectId" TEXT,
    "messageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "intent" TEXT,
    "plan" JSONB,
    "agentTree" JSONB NOT NULL DEFAULT '[]',
    "finalOutput" TEXT,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "timeoutMs" INTEGER NOT NULL DEFAULT 300000,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contextSize" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentStep" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "taskId" TEXT,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "complexity" TEXT,
    "dependencies" JSONB NOT NULL DEFAULT '[]',
    "requiredTools" JSONB NOT NULL DEFAULT '[]',
    "expectedOutputs" JSONB NOT NULL DEFAULT '[]',
    "input" JSONB,
    "output" TEXT,
    "reasoning" TEXT,
    "prompt" TEXT,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentToolCall" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepId" TEXT,
    "agentType" TEXT,
    "toolName" TEXT NOT NULL,
    "arguments" JSONB NOT NULL DEFAULT '{}',
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentLog" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'info',
    "agentType" TEXT,
    "event" TEXT,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentMetric" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMetric_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentStateTransition" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "fromState" TEXT,
    "toState" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStateTransition_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AgentExecution_userId_createdAt_idx" ON "AgentExecution"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentExecution_conversationId_idx" ON "AgentExecution"("conversationId");
CREATE INDEX IF NOT EXISTS "AgentExecution_status_idx" ON "AgentExecution"("status");
CREATE INDEX IF NOT EXISTS "AgentExecution_projectId_idx" ON "AgentExecution"("projectId");

CREATE INDEX IF NOT EXISTS "AgentStep_executionId_status_idx" ON "AgentStep"("executionId", "status");
CREATE INDEX IF NOT EXISTS "AgentStep_agentType_idx" ON "AgentStep"("agentType");

CREATE INDEX IF NOT EXISTS "AgentToolCall_executionId_idx" ON "AgentToolCall"("executionId");
CREATE INDEX IF NOT EXISTS "AgentToolCall_stepId_idx" ON "AgentToolCall"("stepId");
CREATE INDEX IF NOT EXISTS "AgentToolCall_toolName_idx" ON "AgentToolCall"("toolName");

CREATE INDEX IF NOT EXISTS "AgentLog_executionId_createdAt_idx" ON "AgentLog"("executionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentLog_stepId_idx" ON "AgentLog"("stepId");

CREATE INDEX IF NOT EXISTS "AgentMetric_executionId_key_idx" ON "AgentMetric"("executionId", "key");
CREATE INDEX IF NOT EXISTS "AgentStateTransition_executionId_createdAt_idx" ON "AgentStateTransition"("executionId", "createdAt");

ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AgentStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentLog" ADD CONSTRAINT "AgentLog_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AgentStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AgentMetric" ADD CONSTRAINT "AgentMetric_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentStateTransition" ADD CONSTRAINT "AgentStateTransition_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "AgentExecution"("id") ON DELETE CASCADE ON UPDATE CASCADE;
