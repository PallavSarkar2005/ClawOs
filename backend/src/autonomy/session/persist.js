/**
 * Persistence helpers for goals, plans, tasks, sessions, checkpoints.
 */

const prisma = require("../../database/prisma");
const {
  GOAL_STATUS,
  PLAN_STATUS,
  TASK_STATUS,
  SESSION_STATUS,
} = require("../constants");

async function createGoal(userId, data) {
  return prisma.projectGoal.create({
    data: {
      userId,
      projectId: data.projectId || null,
      title: String(data.title || data.description || "Goal").slice(0, 300),
      description: String(data.description || data.title || "").slice(0, 10000),
      status: GOAL_STATUS.ACTIVE,
      priority: Number.isFinite(data.priority) ? data.priority : 50,
      complexity: data.complexity || "medium",
      estimatedHours: data.estimatedHours ?? null,
      successCriteria: Array.isArray(data.successCriteria) ? data.successCriteria : [],
      metadata: data.metadata || {},
      startedAt: new Date(),
    },
  });
}

async function updateGoal(id, userId, data) {
  const existing = await prisma.projectGoal.findFirst({ where: { id, userId } });
  if (!existing) return null;
  return prisma.projectGoal.update({
    where: { id },
    data: {
      ...(data.title != null ? { title: String(data.title).slice(0, 300) } : {}),
      ...(data.description != null ? { description: String(data.description).slice(0, 10000) } : {}),
      ...(data.status != null ? { status: data.status } : {}),
      ...(data.priority != null ? { priority: data.priority } : {}),
      ...(data.completedAt != null ? { completedAt: data.completedAt } : {}),
      ...(data.metadata != null ? { metadata: data.metadata } : {}),
    },
  });
}

async function listGoals(userId, filters = {}) {
  const where = { userId };
  if (filters.status) where.status = filters.status;
  if (filters.projectId) where.projectId = filters.projectId;
  return prisma.projectGoal.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 50, 200),
    include: {
      plans: { orderBy: { version: "desc" }, take: 1 },
      sessions: { orderBy: { createdAt: "desc" }, take: 3 },
    },
  });
}

async function getGoal(id, userId) {
  return prisma.projectGoal.findFirst({
    where: { id, userId },
    include: {
      plans: { orderBy: { version: "desc" }, include: { tasks: true } },
      sessions: { orderBy: { createdAt: "desc" } },
      decisions: { orderBy: { createdAt: "desc" }, take: 50 },
      artifacts: { orderBy: { createdAt: "desc" }, take: 50 },
    },
  });
}

async function persistPlan(goalId, plan, { parentPlanId = null, version = 1 } = {}) {
  const row = await prisma.executionPlan.create({
    data: {
      goalId,
      version,
      status: plan.status || PLAN_STATUS.READY,
      intent: plan.intent,
      strategy: plan.strategy,
      milestones: plan.milestones || [],
      executionGraph: plan.executionGraph || {},
      estimatedDurationMs: plan.estimatedDurationMs || null,
      priorityScore: plan.priorityScore || 0,
      replanReason: plan.replanReason || null,
      parentPlanId,
      metadata: {
        successCriteria: plan.successCriteria || [],
        complexity: plan.complexity,
      },
    },
  });

  for (const t of plan.tasks || []) {
    await prisma.executionTask.create({
      data: {
        planId: row.id,
        milestoneId: t.milestoneId || null,
        externalId: t.id,
        title: t.title,
        description: t.description,
        agentType: t.agent,
        status: TASK_STATUS.PENDING,
        priority: t.priority || 50,
        complexity: t.complexity || "medium",
        estimatedMs: t.estimatedMs || null,
        input: {
          expectedOutputs: t.expectedOutputs || [],
          dependsOn: t.dependsOn || [],
        },
      },
    });
  }

  // Create dependency rows
  const tasks = await prisma.executionTask.findMany({ where: { planId: row.id } });
  const byExt = new Map(tasks.map((t) => [t.externalId, t]));
  for (const t of plan.tasks || []) {
    const task = byExt.get(t.id);
    if (!task) continue;
    for (const dep of t.dependsOn || []) {
      const parent = byExt.get(dep);
      if (!parent) continue;
      await prisma.taskDependency.create({
        data: { taskId: task.id, dependsOnId: parent.id, kind: "hard" },
      }).catch(() => null);
    }
    await prisma.agentAssignment.create({
      data: {
        taskId: task.id,
        agentType: t.agent,
        role: "owner",
        status: "assigned",
      },
    });
  }

  return prisma.executionPlan.findUnique({
    where: { id: row.id },
    include: {
      tasks: { include: { dependencies: true, assignments: true } },
    },
  });
}

async function createSession(userId, data) {
  return prisma.autonomousSession.create({
    data: {
      userId,
      goalId: data.goalId || null,
      planId: data.planId || null,
      projectId: data.projectId || null,
      conversationId: data.conversationId || null,
      status: SESSION_STATUS.PENDING,
      phase: "planning",
      progress: 0,
      checkpoint: {},
      memory: {},
      sharedMemory: data.sharedMemory || {},
      metrics: {},
    },
  });
}

async function updateSession(id, data) {
  return prisma.autonomousSession.update({
    where: { id },
    data: {
      ...(data.status != null ? { status: data.status } : {}),
      ...(data.phase != null ? { phase: data.phase } : {}),
      ...(data.progress != null ? { progress: data.progress } : {}),
      ...(data.checkpoint != null ? { checkpoint: data.checkpoint } : {}),
      ...(data.memory != null ? { memory: data.memory } : {}),
      ...(data.sharedMemory != null ? { sharedMemory: data.sharedMemory } : {}),
      ...(data.currentTaskId != null ? { currentTaskId: data.currentTaskId } : {}),
      ...(data.error != null ? { error: data.error } : {}),
      ...(data.cancelRequested != null ? { cancelRequested: data.cancelRequested } : {}),
      ...(data.qualityGate != null ? { qualityGate: data.qualityGate } : {}),
      ...(data.metrics != null ? { metrics: data.metrics } : {}),
      ...(data.planId != null ? { planId: data.planId } : {}),
      ...(data.agentExecutionId != null ? { agentExecutionId: data.agentExecutionId } : {}),
      ...(data.startedAt != null ? { startedAt: data.startedAt } : {}),
      ...(data.finishedAt != null ? { finishedAt: data.finishedAt } : {}),
      lastHeartbeatAt: new Date(),
    },
  });
}

async function saveCheckpoint(sessionId, checkpoint) {
  return updateSession(sessionId, {
    checkpoint: {
      ...checkpoint,
      savedAt: new Date().toISOString(),
    },
  });
}

async function getSession(id, userId) {
  return prisma.autonomousSession.findFirst({
    where: { id, userId },
    include: {
      goal: true,
      plan: { include: { tasks: { include: { assignments: true, dependencies: true } } } },
      artifacts: { orderBy: { createdAt: "desc" }, take: 100 },
      decisions: { orderBy: { createdAt: "desc" }, take: 100 },
      buildResults: { orderBy: { createdAt: "desc" }, take: 20 },
      testResults: { orderBy: { createdAt: "desc" }, take: 20 },
      reviewResults: { orderBy: { createdAt: "desc" }, take: 20 },
      cycles: { orderBy: { cycleNumber: "desc" } },
      approvals: { orderBy: { createdAt: "desc" } },
    },
  });
}

async function listSessions(userId, filters = {}) {
  const where = { userId };
  if (filters.status) where.status = filters.status;
  if (filters.goalId) where.goalId = filters.goalId;
  if (filters.projectId) where.projectId = filters.projectId;
  return prisma.autonomousSession.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: Math.min(Number(filters.limit) || 50, 200),
    include: {
      goal: { select: { id: true, title: true, status: true } },
      plan: { select: { id: true, version: true, status: true } },
    },
  });
}

async function updateTaskStatus(taskId, data) {
  return prisma.executionTask.update({
    where: { id: taskId },
    data: {
      ...(data.status != null ? { status: data.status } : {}),
      ...(data.output != null ? { output: data.output } : {}),
      ...(data.error != null ? { error: data.error } : {}),
      ...(data.actualMs != null ? { actualMs: data.actualMs } : {}),
      ...(data.qualityScore != null ? { qualityScore: data.qualityScore } : {}),
      ...(data.checkpoint != null ? { checkpoint: data.checkpoint } : {}),
      ...(data.retryCount != null ? { retryCount: data.retryCount } : {}),
      ...(data.startedAt != null ? { startedAt: data.startedAt } : {}),
      ...(data.finishedAt != null ? { finishedAt: data.finishedAt } : {}),
    },
  });
}

async function requestCancel(sessionId, userId) {
  const session = await prisma.autonomousSession.findFirst({ where: { id: sessionId, userId } });
  if (!session) return null;
  return updateSession(sessionId, {
    cancelRequested: true,
    status: session.status === SESSION_STATUS.COMPLETED ? session.status : SESSION_STATUS.CANCELLED,
  });
}

module.exports = {
  createGoal,
  updateGoal,
  listGoals,
  getGoal,
  persistPlan,
  createSession,
  updateSession,
  saveCheckpoint,
  getSession,
  listSessions,
  updateTaskStatus,
  requestCancel,
};
