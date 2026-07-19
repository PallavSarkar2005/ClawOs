-- Phase 9: Autonomous Software Engineer
-- Generated migration for ProjectGoal, ExecutionPlan, tasks, decisions, artifacts, sessions, etc.

CREATE TABLE IF NOT EXISTS "ProjectGoal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "complexity" TEXT NOT NULL DEFAULT 'medium',
    "estimatedHours" DOUBLE PRECISION,
    "successCriteria" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectGoal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExecutionPlan" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "intent" TEXT,
    "strategy" TEXT,
    "milestones" JSONB NOT NULL DEFAULT '[]',
    "executionGraph" JSONB NOT NULL DEFAULT '{}',
    "estimatedDurationMs" INTEGER,
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "replanReason" TEXT,
    "parentPlanId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionPlan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExecutionTask" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "externalId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 50,
    "complexity" TEXT NOT NULL DEFAULT 'medium',
    "estimatedMs" INTEGER,
    "actualMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "input" JSONB NOT NULL DEFAULT '{}',
    "output" TEXT,
    "error" TEXT,
    "qualityScore" DOUBLE PRECISION,
    "checkpoint" JSONB,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExecutionTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TaskDependency" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'hard',
    CONSTRAINT "TaskDependency_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "agentType" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'owner',
    "status" TEXT NOT NULL DEFAULT 'assigned',
    "notes" TEXT,
    "artifactIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutonomousSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goalId" TEXT,
    "planId" TEXT,
    "projectId" TEXT,
    "conversationId" TEXT,
    "agentExecutionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "phase" TEXT NOT NULL DEFAULT 'planning',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "checkpoint" JSONB NOT NULL DEFAULT '{}',
    "memory" JSONB NOT NULL DEFAULT '{}',
    "sharedMemory" JSONB NOT NULL DEFAULT '{}',
    "currentTaskId" TEXT,
    "error" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "qualityGate" JSONB NOT NULL DEFAULT '{}',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutonomousSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Decision" (
    "id" TEXT NOT NULL,
    "goalId" TEXT,
    "taskId" TEXT,
    "sessionId" TEXT,
    "userId" TEXT,
    "kind" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "alternatives" JSONB NOT NULL DEFAULT '[]',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "risks" JSONB NOT NULL DEFAULT '[]',
    "tradeoffs" JSONB NOT NULL DEFAULT '[]',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "choice" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Decision_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutonomyArtifact" (
    "id" TEXT NOT NULL,
    "goalId" TEXT,
    "taskId" TEXT,
    "sessionId" TEXT,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT,
    "mimeType" TEXT,
    "content" TEXT,
    "contentJson" JSONB,
    "sizeBytes" INTEGER,
    "checksum" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutonomyArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BuildResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL,
    "command" TEXT,
    "exitCode" INTEGER,
    "stdout" TEXT,
    "stderr" TEXT,
    "durationMs" INTEGER,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "TestResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL,
    "suite" TEXT,
    "passed" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "coverage" DOUBLE PRECISION,
    "report" TEXT,
    "failures" JSONB NOT NULL DEFAULT '[]',
    "durationMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TestResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ReviewResult" (
    "id" TEXT NOT NULL,
    "taskId" TEXT,
    "sessionId" TEXT,
    "status" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "architecture" DOUBLE PRECISION,
    "performance" DOUBLE PRECISION,
    "security" DOUBLE PRECISION,
    "readability" DOUBLE PRECISION,
    "maintainability" DOUBLE PRECISION,
    "complexity" DOUBLE PRECISION,
    "comments" JSONB NOT NULL DEFAULT '[]',
    "fixes" JSONB NOT NULL DEFAULT '[]',
    "criticalIssues" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewResult_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ImprovementCycle" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "planId" TEXT,
    "cycleNumber" INTEGER NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "buildOk" BOOLEAN NOT NULL DEFAULT false,
    "testsOk" BOOLEAN NOT NULL DEFAULT false,
    "reviewOk" BOOLEAN NOT NULL DEFAULT false,
    "qualityScore" DOUBLE PRECISION,
    "analysis" TEXT,
    "fixes" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "ImprovementCycle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutonomyApproval" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "risk" TEXT NOT NULL DEFAULT 'high',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "decidedBy" TEXT,
    "decisionNote" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutonomyApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AutonomyLearning" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "kind" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "context" JSONB NOT NULL DEFAULT '{}',
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "reuseCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AutonomyLearning_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "ProjectGoal" ADD CONSTRAINT "ProjectGoal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionPlan" ADD CONSTRAINT "ExecutionPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProjectGoal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionTask" ADD CONSTRAINT "ExecutionTask_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskDependency" ADD CONSTRAINT "TaskDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "ExecutionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentAssignment" ADD CONSTRAINT "AgentAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutonomousSession" ADD CONSTRAINT "AutonomousSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutonomousSession" ADD CONSTRAINT "AutonomousSession_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProjectGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutonomousSession" ADD CONSTRAINT "AutonomousSession_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProjectGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Decision" ADD CONSTRAINT "Decision_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutonomyArtifact" ADD CONSTRAINT "AutonomyArtifact_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "ProjectGoal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutonomyArtifact" ADD CONSTRAINT "AutonomyArtifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutonomyArtifact" ADD CONSTRAINT "AutonomyArtifact_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuildResult" ADD CONSTRAINT "BuildResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BuildResult" ADD CONSTRAINT "BuildResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TestResult" ADD CONSTRAINT "TestResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewResult" ADD CONSTRAINT "ReviewResult_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ExecutionTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReviewResult" ADD CONSTRAINT "ReviewResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ImprovementCycle" ADD CONSTRAINT "ImprovementCycle_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ImprovementCycle" ADD CONSTRAINT "ImprovementCycle_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ExecutionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutonomyApproval" ADD CONSTRAINT "AutonomyApproval_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AutonomousSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutonomyApproval" ADD CONSTRAINT "AutonomyApproval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutonomyLearning" ADD CONSTRAINT "AutonomyLearning_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "TaskDependency_taskId_dependsOnId_key" ON "TaskDependency"("taskId", "dependsOnId");
CREATE INDEX IF NOT EXISTS "ProjectGoal_userId_status_idx" ON "ProjectGoal"("userId", "status");
CREATE INDEX IF NOT EXISTS "ProjectGoal_projectId_idx" ON "ProjectGoal"("projectId");
CREATE INDEX IF NOT EXISTS "ExecutionPlan_goalId_version_idx" ON "ExecutionPlan"("goalId", "version");
CREATE INDEX IF NOT EXISTS "ExecutionTask_planId_status_idx" ON "ExecutionTask"("planId", "status");
CREATE INDEX IF NOT EXISTS "AutonomousSession_userId_status_idx" ON "AutonomousSession"("userId", "status");
CREATE INDEX IF NOT EXISTS "Decision_goalId_createdAt_idx" ON "Decision"("goalId", "createdAt");
CREATE INDEX IF NOT EXISTS "AutonomyArtifact_goalId_kind_idx" ON "AutonomyArtifact"("goalId", "kind");
CREATE INDEX IF NOT EXISTS "AutonomyApproval_userId_status_idx" ON "AutonomyApproval"("userId", "status");
CREATE INDEX IF NOT EXISTS "AutonomyLearning_userId_kind_idx" ON "AutonomyLearning"("userId", "kind");
CREATE INDEX IF NOT EXISTS "ImprovementCycle_sessionId_cycleNumber_idx" ON "ImprovementCycle"("sessionId", "cycleNumber");
