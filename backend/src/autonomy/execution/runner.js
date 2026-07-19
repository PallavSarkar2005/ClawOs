/**
 * Project / task execution runner — runs tasks via specialist agents,
 * supports parallel waves, incremental progress, retries.
 */

const { getAgent } = require("../agents/registry");
const {
  createSharedMemory,
  writeShared,
  detectConflicts,
  resolveConflicts,
  summarizeArtifacts,
} = require("../agents/collaboration");
const { topologicalWaves } = require("../planner/master");
const { updateTaskStatus, updateSession, saveCheckpoint } = require("../session/persist");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS, TASK_STATUS, STREAM_EVENTS } = require("../constants");
const contextManager = require("../../runtime/context-manager");
const prisma = require("../../database/prisma");

async function buildTaskContext(ctx, task, priorOutputs) {
  const context = await contextManager.build(ctx.userId, `${ctx.goalDescription}\n${task.description}`, {
    conversationId: ctx.conversationId,
    projectId: ctx.projectId,
    agentType: task.agent,
    agentExecutionId: ctx.agentExecutionId,
    tokenBudget: 5000,
  }).catch(() => ({ text: "", usedTokens: 0 }));

  const prior = priorOutputs
    .map((o) => `### ${o.agent} (${o.taskId})\n${String(o.content || "").slice(0, 3000)}`)
    .join("\n\n");

  return {
    ...ctx,
    contextText: [context.text, prior].filter(Boolean).join("\n\n"),
    userMessage: ctx.goalDescription,
    sharedMemory: ctx.sharedMemory || createSharedMemory(),
    artifactSummaries: summarizeArtifacts(ctx.artifacts || []),
  };
}

async function runSingleTask(task, dbTask, ctx, priorOutputs) {
  const agent = getAgent(task.agent);
  if (!agent) {
    throw Object.assign(new Error(`No agent for ${task.agent}`), { code: "UNKNOWN_AGENT" });
  }

  const started = Date.now();
  ctx.emit?.(STREAM_EVENTS.TASK_STARTED, {
    taskId: task.id,
    dbTaskId: dbTask?.id,
    agent: task.agent,
    title: task.title,
  });

  if (dbTask) {
    await updateTaskStatus(dbTask.id, {
      status: TASK_STATUS.RUNNING,
      startedAt: new Date(),
    });
    await updateSession(ctx.sessionId, {
      currentTaskId: dbTask.id,
      phase: task.agent,
    });
  }

  const agentCtx = await buildTaskContext(
    { ...ctx, dbTaskId: dbTask?.id },
    task,
    priorOutputs,
  );

  try {
    const output = await agent.run(
      {
        id: task.id,
        description: `${task.title}\n\n${task.description}`,
        expectedOutputs: task.expectedOutputs || [],
        requiredTools: task.requiredTools || [],
      },
      agentCtx,
    );

    const content = output.content || "";
    ctx.sharedMemory = writeShared(agentCtx.sharedMemory, {
      fact: { agent: task.agent, taskId: task.id, summary: content.slice(0, 400) },
      artifact: { agent: task.agent, name: task.title, kind: "task_output" },
    });

    await createArtifact(
      {
        sessionId: ctx.sessionId,
        goalId: ctx.goalId,
        taskId: dbTask?.id,
        kind: ARTIFACT_KINDS.CODE,
        name: `${task.agent}-${task.id}.md`,
        content,
        metadata: { agent: task.agent, title: task.title },
      },
      ctx.emit,
    );

    if (dbTask) {
      await updateTaskStatus(dbTask.id, {
        status: TASK_STATUS.COMPLETED,
        output: content.slice(0, 100000),
        actualMs: Date.now() - started,
        finishedAt: new Date(),
      });
    }

    ctx.emit?.(STREAM_EVENTS.TASK_COMPLETED, {
      taskId: task.id,
      agent: task.agent,
      durationMs: Date.now() - started,
    });

    return {
      taskId: task.id,
      agent: task.agent,
      content,
      usage: output.usage,
      ok: true,
    };
  } catch (error) {
    if (dbTask) {
      await updateTaskStatus(dbTask.id, {
        status: TASK_STATUS.FAILED,
        error: error.message,
        actualMs: Date.now() - started,
        finishedAt: new Date(),
        retryCount: (dbTask.retryCount || 0) + 1,
      });
    }
    ctx.emit?.(STREAM_EVENTS.TASK_FAILED, {
      taskId: task.id,
      agent: task.agent,
      error: error.message,
    });
    return {
      taskId: task.id,
      agent: task.agent,
      content: "",
      error: error.message,
      ok: false,
    };
  }
}

async function executePlan(plan, dbPlan, ctx) {
  const tasks = plan.tasks || [];
  const dbTasks = dbPlan?.tasks || [];
  const byExt = new Map(dbTasks.map((t) => [t.externalId, t]));

  const waves = topologicalWaves(tasks);
  const outputs = [];
  const failures = [];

  let completed = 0;
  const total = tasks.length;

  for (const wave of waves) {
    if (ctx.cancelRequested?.() || ctx.signal?.aborted) {
      throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
    }

    // Parallel within wave
    const results = await Promise.all(
      wave.map((task) => runSingleTask(task, byExt.get(task.id), ctx, outputs)),
    );

    for (const r of results) {
      if (r.ok) outputs.push(r);
      else failures.push(r);
      completed += 1;
    }

    const progress = total ? completed / total : 1;
    await updateSession(ctx.sessionId, {
      progress,
      sharedMemory: ctx.sharedMemory,
      metrics: {
        ...(ctx.metrics || {}),
        completedTasks: completed,
        totalTasks: total,
        failures: failures.length,
      },
    });
    ctx.emit?.(STREAM_EVENTS.PROGRESS, { progress, completed, total });

    await saveCheckpoint(ctx.sessionId, {
      wave: wave.map((t) => t.id),
      completedTaskIds: outputs.map((o) => o.taskId),
      failedTaskIds: failures.map((f) => f.taskId),
      progress,
    });
    ctx.emit?.(STREAM_EVENTS.CHECKPOINT, { progress, completed });

    // Conflict detection across wave outputs
    const conflicts = detectConflicts(results.filter((r) => r.ok));
    if (conflicts.length) {
      const resolution = await resolveConflicts(conflicts, ctx);
      ctx.sharedMemory = resolution.memory;
    }

    // Stop wave chain on hard failure if configured
    if (failures.length && ctx.stopOnFailure) break;
  }

  return { outputs, failures, progress: total ? completed / total : 1 };
}

async function recordBuild(ctx, result, taskId = null) {
  const row = await prisma.buildResult.create({
    data: {
      taskId,
      sessionId: ctx.sessionId || null,
      status: result.status,
      command: result.command || null,
      exitCode: result.exitCode ?? null,
      stdout: (result.stdout || "").slice(0, 100000),
      stderr: (result.stderr || "").slice(0, 100000),
      durationMs: result.durationMs || null,
      errors: result.errors || [],
      metadata: result.metadata || {},
    },
  });
  ctx.emit?.(STREAM_EVENTS.BUILD_RESULT, {
    buildId: row.id,
    status: row.status,
    exitCode: row.exitCode,
  });
  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      taskId,
      kind: ARTIFACT_KINDS.BUILD_LOG,
      name: `build-${row.id}.txt`,
      content: `${row.stdout || ""}\n${row.stderr || ""}`,
    },
    ctx.emit,
  );
  return row;
}

module.exports = {
  runSingleTask,
  executePlan,
  buildTaskContext,
  recordBuild,
};
