const prisma = require("../../database/prisma");
const { EXECUTION_STATUS, NODE_STATUS, STREAM_EVENTS, DEFAULT_SETTINGS } = require("../constants");
const { normalizeDefinition, buildAdjacency, getStartNodes, getSuccessors } = require("../dag/graph");
const { VariableStore } = require("../variables/store");
const { evaluate } = require("../expression/engine");
const { canTransition, isTerminal, assertTransition } = require("./state-machine");
const { ConcurrencyController, WorkerPool } = require("./concurrency");
const { executeNode, sleep } = require("../nodes/handlers");
const { validateDefinition } = require("../validation/validator");

const active = new Map();
const listeners = new Map();
const concurrency = new ConcurrencyController({ maxGlobal: 20, maxPerUser: 5 });
const queue = [];
let pumping = false;

function emit(executionId, event, data = {}) {
  const payload = { event, executionId, at: new Date().toISOString(), ...data };
  const set = listeners.get(executionId);
  if (set) for (const fn of set) {
    try { fn(payload); } catch { /* ignore */ }
  }
  return payload;
}

function subscribe(executionId, fn) {
  if (!listeners.has(executionId)) listeners.set(executionId, new Set());
  listeners.get(executionId).add(fn);
  return () => listeners.get(executionId)?.delete(fn);
}

async function persistStatus(executionId, status, extra = {}) {
  return prisma.workflowExecution.update({
    where: { id: executionId },
    data: { status, ...extra, updatedAt: new Date() },
  });
}

async function saveCheckpoint(executionId, vars, completedKeys, nodeKey = null) {
  const state = {
    completedKeys: [...completedKeys],
    variables: vars.toPersistence(),
    at: new Date().toISOString(),
  };
  await prisma.workflowCheckpoint.create({
    data: {
      executionId,
      nodeKey,
      state,
      variables: vars.toPersistence(),
      completedKeys: [...completedKeys],
      label: nodeKey ? `after:${nodeKey}` : "checkpoint",
    },
  });
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { checkpoint: state, variables: vars.toPersistence() },
  });
  emit(executionId, STREAM_EVENTS.CHECKPOINT, { nodeKey, completedKeys: [...completedKeys] });
  return state;
}

async function recordMetric(workflowId, executionId, name, value, unit = null, tags = {}) {
  await prisma.workflowMetric.create({
    data: { workflowId, executionId, name, value, unit, tags },
  }).catch(() => null);
  emit(executionId, STREAM_EVENTS.METRIC, { name, value, unit, tags });
}

async function createArtifact(executionId, { nodeKey, name, type = "json", content, data, mimeType }) {
  const sizeBytes = content ? Buffer.byteLength(content) : Buffer.byteLength(JSON.stringify(data || {}));
  return prisma.workflowArtifact.create({
    data: {
      executionId,
      nodeKey: nodeKey || null,
      name,
      type,
      mimeType: mimeType || null,
      content: content || null,
      data: data || undefined,
      sizeBytes,
    },
  });
}

async function upsertNodeRun(executionId, node, attempt, patch) {
  const existing = await prisma.workflowExecutionNode.findFirst({
    where: { executionId, nodeKey: node.id, attempt },
  });
  if (existing) {
    return prisma.workflowExecutionNode.update({
      where: { id: existing.id },
      data: patch,
    });
  }
  return prisma.workflowExecutionNode.create({
    data: {
      executionId,
      nodeKey: node.id,
      nodeType: node.type,
      label: node.label || "",
      attempt,
      maxAttempts: 1,
      ...patch,
    },
  });
}

function edgeAllowed(edge, branch, vars) {
  if (edge.condition) {
    try {
      return Boolean(evaluate(vars.interpolate(String(edge.condition)), vars.flat()));
    } catch {
      return false;
    }
  }
  if (!edge.sourceHandle) return true;
  if (branch == null) return true;
  return edge.sourceHandle === branch || edge.sourceHandle === String(branch);
}

async function runNodeWithRetry(node, ctx, retryPolicy) {
  const maxAttempts = Number(retryPolicy?.maxAttempts || node.retryPolicy?.maxAttempts || 1);
  const baseDelay = Number(retryPolicy?.backoffMs || node.retryPolicy?.backoffMs || 500);
  const exponential = retryPolicy?.exponential !== false && node.retryPolicy?.exponential !== false;
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (ctx.signal?.aborted) throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
    try {
      await upsertNodeRun(ctx.executionId, node, attempt, {
        status: attempt > 1 ? NODE_STATUS.RETRYING : NODE_STATUS.RUNNING,
        attempt,
        maxAttempts,
        startedAt: new Date(),
        inputs: ctx.vars.resolve(node.config || {}),
      });
      emit(ctx.executionId, STREAM_EVENTS.NODE_STARTED, { nodeKey: node.id, type: node.type, attempt });
      const result = await executeNode(node, { ...ctx, attempt });
      return { result, attempt };
    } catch (err) {
      lastError = err;
      await upsertNodeRun(ctx.executionId, node, attempt, {
        status: NODE_STATUS.FAILED,
        error: err.message,
        finishedAt: new Date(),
      });
      emit(ctx.executionId, STREAM_EVENTS.NODE_FAILED, {
        nodeKey: node.id,
        attempt,
        error: err.message,
      });
      if (attempt >= maxAttempts) break;
      const delay = exponential ? baseDelay * Math.pow(2, attempt - 1) : baseDelay;
      await sleep(delay, ctx.signal);
    }
  }
  throw lastError;
}

async function executeDefinition(execution, options = {}) {
  const def = normalizeDefinition(execution.definition || {});
  const validation = validateDefinition(def);
  if (!validation.ok) {
    throw Object.assign(new Error(`Invalid workflow: ${validation.errors.map((e) => e.message).join("; ")}`), {
      code: "VALIDATION",
      errors: validation.errors,
    });
  }

  const settings = { ...DEFAULT_SETTINGS, ...(execution.workflowSettings || {}), ...(options.settings || {}) };
  const vars = new VariableStore({
    inputs: execution.inputs || {},
    workflow: execution.variables?.workflow || {},
    global: execution.variables?.global || {},
    outputs: execution.variables?.outputs || {},
    nodes: execution.variables?.nodes || {},
    secrets: execution.secrets || {},
    env: {
      NODE_ENV: process.env.NODE_ENV,
      WORKFLOW_ID: execution.workflowId,
      EXECUTION_ID: execution.id,
    },
  });

  const completed = new Set(options.completedKeys || execution.checkpoint?.completedKeys || []);
  const skipped = new Set(options.skippedKeys || []);
  const { nodeMap, outgoing, incoming } = buildAdjacency(def);
  const abort = new AbortController();
  const pool = new WorkerPool(settings.concurrency || 4);

  const handle = {
    abort,
    pause: false,
    approvalDecision: options.approvalDecision || null,
    vars,
  };
  active.set(execution.id, handle);

  const ctxBase = {
    executionId: execution.id,
    workflowId: execution.workflowId,
    userId: execution.userId,
    projectId: execution.projectId || options.projectId || null,
    conversationId: execution.conversationId || options.conversationId || null,
    triggerData: execution.triggerData || {},
    variables: vars,
    vars,
    signal: abort.signal,
    nodeTimeoutMs: settings.nodeTimeoutMs,
    approvalDecision: handle.approvalDecision,
    emit: (type, data) => emit(execution.id, STREAM_EVENTS.LOG, { type, ...data }),
  };

  await persistStatus(execution.id, EXECUTION_STATUS.RUNNING, {
    startedAt: execution.startedAt || new Date(),
    currentNodeKeys: [],
  });
  emit(execution.id, STREAM_EVENTS.EXECUTION_STARTED, {});

  const startedAt = Date.now();
  let terminalHit = false;
  let waitingState = null;
  let approvalState = null;

  try {
    // Seed: if nothing completed, mark start nodes ready by ensuring their preds are empty
    const startIds = getStartNodes(def);

    while (!terminalHit) {
      if (abort.signal.aborted || execution.cancelRequested) {
        throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
      }

      const live = await prisma.workflowExecution.findUnique({ where: { id: execution.id } });
      if (live?.cancelRequested) {
        throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
      }
      if (live?.pauseRequested || handle.pause) {
        await persistStatus(execution.id, EXECUTION_STATUS.PAUSED, {
          variables: vars.toPersistence(),
          checkpoint: {
            completedKeys: [...completed],
            variables: vars.toPersistence(),
          },
        });
        await saveCheckpoint(execution.id, vars, completed);
        emit(execution.id, STREAM_EVENTS.EXECUTION_PAUSED, {});
        return { status: EXECUTION_STATUS.PAUSED, outputs: vars.layers.outputs };
      }

      const ready = [...nodeMap.keys()].filter((id) => {
        if (completed.has(id) || skipped.has(id)) return false;
        const preds = incoming.get(id) || [];
        if (!preds.length) return startIds.includes(id) || completed.size === 0;
        // A node is ready if all incoming edges from completed/skipped sources that are "active" are satisfied.
        // For branching: only edges whose source completed AND whose condition/handle matched (tracked via skipped alternate branches).
        const relevant = preds.filter((e) => completed.has(e.source) || skipped.has(e.source));
        if (!relevant.length) return false;
        // All predecessors must be done (completed or skipped)
        return preds.every((e) => completed.has(e.source) || skipped.has(e.source));
      });

      // Refine ready set: if a predecessor completed with a branch, only follow matching edges
      const filteredReady = ready.filter((id) => {
        const preds = incoming.get(id) || [];
        if (!preds.length) return true;
        return preds.some((e) => {
          if (skipped.has(e.source)) return false;
          if (!completed.has(e.source)) return false;
          const branchMeta = vars.layers.nodes[e.source]?.__branch;
          return edgeAllowed(e, branchMeta, vars);
        }) || preds.every((e) => skipped.has(e.source));
      });

      if (!filteredReady.length) {
        // Check if all nodes done
        const pending = [...nodeMap.keys()].filter((id) => !completed.has(id) && !skipped.has(id));
        if (!pending.length || terminalHit) break;
        // Deadlock / waiting for branch skips — skip unreachable
        for (const id of pending) {
          const preds = incoming.get(id) || [];
          const anyPossible = preds.some((e) => {
            if (!completed.has(e.source)) return !skipped.has(e.source);
            const branchMeta = vars.layers.nodes[e.source]?.__branch;
            return edgeAllowed(e, branchMeta, vars);
          });
          if (!anyPossible && preds.every((e) => completed.has(e.source) || skipped.has(e.source))) {
            skipped.add(id);
            await upsertNodeRun(execution.id, nodeMap.get(id), 1, {
              status: NODE_STATUS.SKIPPED,
              finishedAt: new Date(),
            });
            emit(execution.id, STREAM_EVENTS.NODE_SKIPPED, { nodeKey: id });
          }
        }
        const still = [...nodeMap.keys()].filter((id) => !completed.has(id) && !skipped.has(id));
        if (!still.length) break;
        // If still stuck with no ready, break to avoid infinite loop
        const stillReady = still.filter((id) => {
          const preds = incoming.get(id) || [];
          return preds.every((e) => completed.has(e.source) || skipped.has(e.source));
        });
        if (!stillReady.length) break;
        continue;
      }

      await persistStatus(execution.id, EXECUTION_STATUS.RUNNING, {
        currentNodeKeys: filteredReady,
        variables: vars.toPersistence(),
      });

      const results = await pool.runAll(
        filteredReady.map((nodeId) => async () => {
          const node = nodeMap.get(nodeId);
          const nodeStarted = Date.now();
          try {
            const { result, attempt } = await runNodeWithRetry(node, ctxBase, options.retryPolicy);
            if (result.awaitingApproval) {
              return { nodeId, approval: result.approval, result, attempt };
            }
            if (result.waiting) {
              return { nodeId, waiting: result.waitPayload, result, attempt };
            }

            const outputs = result.outputs || {};
            vars.setNodeOutput(nodeId, outputs);
            if (result.branch != null) {
              vars.layers.nodes[nodeId] = {
                ...vars.layers.nodes[nodeId],
                __branch: result.branch,
              };
            }

            const latencyMs = Date.now() - nodeStarted;
            await upsertNodeRun(execution.id, node, attempt, {
              status: NODE_STATUS.COMPLETED,
              outputs,
              logs: result.logs || [],
              toolCalls: result.toolCalls || [],
              agentActivity: result.agentActivity || {},
              tokensUsed: result.tokensUsed || 0,
              latencyMs,
              finishedAt: new Date(),
            });

            if (outputs && (node.type === "llm" || node.type === "custom_script" || result.artifact)) {
              await createArtifact(execution.id, {
                nodeKey: nodeId,
                name: `${node.label || nodeId}-output`,
                type: "json",
                data: outputs,
              });
            }

            emit(execution.id, STREAM_EVENTS.NODE_COMPLETED, {
              nodeKey: nodeId,
              type: node.type,
              outputs,
              latencyMs,
              branch: result.branch,
            });

            completed.add(nodeId);

            // Skip non-matching branch targets
            const succ = outgoing.get(nodeId) || [];
            for (const e of succ) {
              if (!edgeAllowed(e, result.branch, vars)) {
                // Don't skip target yet — it may have other valid preds
              }
            }

            // Loop body: if loopContinue, remove loop node from completed so it can run again? 
            // Actually for loop we keep completed and use branch "body" vs "done"
            if (result.loopContinue) {
              completed.delete(nodeId);
            }

            if (result.terminal || node.type === "end") {
              terminalHit = true;
            }

            if (settings.checkpointEveryNode) {
              await saveCheckpoint(execution.id, vars, completed, nodeId);
            }

            await recordMetric(execution.workflowId, execution.id, "node.latency_ms", latencyMs, "ms", {
              nodeKey: nodeId,
              type: node.type,
            });

            return { nodeId, result, attempt };
          } catch (err) {
            return { nodeId, error: err };
          }
        }),
      );

      for (const r of results) {
        if (r.approval) {
          approvalState = r.approval;
          await persistStatus(execution.id, EXECUTION_STATUS.AWAITING_APPROVAL, {
            approvalPending: r.approval,
            variables: vars.toPersistence(),
            checkpoint: { completedKeys: [...completed], variables: vars.toPersistence() },
          });
          emit(execution.id, STREAM_EVENTS.APPROVAL_REQUIRED, r.approval);
          return { status: EXECUTION_STATUS.AWAITING_APPROVAL, approval: r.approval };
        }
        if (r.waiting) {
          waitingState = r.waiting;
          await persistStatus(execution.id, EXECUTION_STATUS.WAITING, {
            variables: vars.toPersistence(),
            checkpoint: { completedKeys: [...completed], variables: vars.toPersistence() },
          });
          emit(execution.id, STREAM_EVENTS.NODE_WAITING, { nodeKey: r.nodeId, waiting: r.waiting });
          return { status: EXECUTION_STATUS.WAITING, waiting: r.waiting };
        }
        if (r.error) {
          const msg = r.error.message || String(r.error);
          await persistStatus(execution.id, EXECUTION_STATUS.FAILED, {
            error: msg,
            errorNodeKey: r.nodeId,
            finishedAt: new Date(),
            durationMs: Date.now() - startedAt,
            outputs: vars.layers.outputs,
            variables: vars.toPersistence(),
          });
          emit(execution.id, STREAM_EVENTS.EXECUTION_FAILED, { error: msg, nodeKey: r.nodeId });
          await recordMetric(execution.workflowId, execution.id, "execution.failed", 1);
          return { status: EXECUTION_STATUS.FAILED, error: msg };
        }
      }
    }

    const durationMs = Date.now() - startedAt;
    const outputs = vars.layers.outputs;
    await persistStatus(execution.id, EXECUTION_STATUS.COMPLETED, {
      outputs,
      variables: vars.toPersistence(),
      finishedAt: new Date(),
      durationMs,
      currentNodeKeys: [],
      metrics: {
        durationMs,
        nodesCompleted: completed.size,
        nodesSkipped: skipped.size,
      },
    });
    await prisma.workflow.update({
      where: { id: execution.workflowId },
      data: { lastRunAt: new Date(), runCount: { increment: 1 } },
    }).catch(() => null);
    await recordMetric(execution.workflowId, execution.id, "execution.duration_ms", durationMs, "ms");
    emit(execution.id, STREAM_EVENTS.EXECUTION_COMPLETED, { outputs, durationMs });
    return { status: EXECUTION_STATUS.COMPLETED, outputs, durationMs };
  } catch (err) {
    const code = err.code;
    const status =
      code === "CANCELLED"
        ? EXECUTION_STATUS.CANCELLED
        : code === "TIMEOUT"
          ? EXECUTION_STATUS.TIMED_OUT
          : EXECUTION_STATUS.FAILED;
    await persistStatus(execution.id, status, {
      error: err.message,
      finishedAt: new Date(),
      durationMs: Date.now() - startedAt,
      variables: vars.toPersistence(),
      outputs: vars.layers.outputs,
    });
    emit(
      execution.id,
      status === EXECUTION_STATUS.CANCELLED
        ? STREAM_EVENTS.EXECUTION_CANCELLED
        : STREAM_EVENTS.EXECUTION_FAILED,
      { error: err.message },
    );
    return { status, error: err.message };
  } finally {
    concurrency.release(execution.id);
    active.delete(execution.id);
  }
}

async function enqueueExecution(executionId) {
  queue.push(executionId);
  emit(executionId, STREAM_EVENTS.EXECUTION_QUEUED, {});
  pumpQueue();
}

async function pumpQueue() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const executionId = queue[0];
      const execution = await prisma.workflowExecution.findUnique({
        where: { id: executionId },
        include: { workflow: true },
      });
      if (!execution) {
        queue.shift();
        continue;
      }
      if (isTerminal(execution.status) && execution.status !== EXECUTION_STATUS.QUEUED) {
        queue.shift();
        continue;
      }
      const gate = concurrency.acquire(executionId, execution.userId);
      if (!gate.ok) {
        // wait briefly and retry later
        await sleep(500);
        if (queue[0] === executionId) {
          // rotate to avoid head-of-line blocking
          queue.push(queue.shift());
        }
        continue;
      }
      queue.shift();
      // fire and forget
      executeDefinition({
        ...execution,
        secrets: execution.workflow?.secrets || {},
        workflowSettings: execution.workflow?.settings || {},
      }).catch((err) => {
        console.error("[workflow] execution error", executionId, err.message);
      });
    }
  } finally {
    pumping = false;
    if (queue.length) setImmediate(pumpQueue);
  }
}

async function startExecution({
  workflowId,
  userId,
  inputs = {},
  triggerType = "manual",
  triggerData = {},
  projectId = null,
  conversationId = null,
  version = null,
}) {
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, userId },
  });
  if (!workflow) {
    throw Object.assign(new Error("Workflow not found"), { status: 404 });
  }
  if (!workflow.enabled && triggerType !== "manual") {
    throw Object.assign(new Error("Workflow disabled"), { status: 400 });
  }

  const definition = workflow.definition || { nodes: [], edges: [] };
  const validation = validateDefinition(definition);
  if (!validation.ok) {
    throw Object.assign(new Error("Workflow definition invalid"), {
      status: 400,
      errors: validation.errors,
    });
  }

  const execution = await prisma.workflowExecution.create({
    data: {
      workflowId,
      userId,
      version: version || workflow.version,
      status: EXECUTION_STATUS.QUEUED,
      triggerType,
      triggerData,
      definition: validation.definition,
      inputs,
      variables: {
        workflow: workflow.variables || {},
        inputs,
        outputs: {},
        nodes: {},
      },
      projectId: projectId || workflow.projectId || null,
      conversationId,
      priority: 0,
    },
  });

  await enqueueExecution(execution.id);
  return execution;
}

async function pauseExecution(executionId, userId) {
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId, userId },
  });
  if (!execution) throw Object.assign(new Error("Execution not found"), { status: 404 });
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { pauseRequested: true },
  });
  const handle = active.get(executionId);
  if (handle) handle.pause = true;
  return { ok: true, status: EXECUTION_STATUS.PAUSED };
}

async function resumeExecution(executionId, userId, extras = {}) {
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId, userId },
    include: { workflow: true },
  });
  if (!execution) throw Object.assign(new Error("Execution not found"), { status: 404 });

  if (
    ![
      EXECUTION_STATUS.PAUSED,
      EXECUTION_STATUS.WAITING,
      EXECUTION_STATUS.AWAITING_APPROVAL,
      EXECUTION_STATUS.FAILED,
      EXECUTION_STATUS.TIMED_OUT,
    ].includes(execution.status)
  ) {
    throw Object.assign(new Error(`Cannot resume from ${execution.status}`), { status: 400 });
  }

  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: EXECUTION_STATUS.QUEUED,
      pauseRequested: false,
      cancelRequested: false,
      approvalPending: extras.approvalDecision ? null : execution.approvalPending,
      error: null,
    },
  });

  const completedKeys = execution.checkpoint?.completedKeys || [];
  // For approval resume: mark approval node based on decision
  if (extras.approvalDecision && execution.approvalPending?.nodeKey) {
    // Re-run from approval node — remove it from completed if present
    const idx = completedKeys.indexOf(execution.approvalPending.nodeKey);
    // keep predecessors completed
  }

  queue.push(executionId);
  // Direct resume path with checkpoint
  const gate = concurrency.acquire(executionId, userId);
  if (gate.ok) {
    executeDefinition(
      {
        ...execution,
        status: EXECUTION_STATUS.QUEUED,
        secrets: execution.workflow?.secrets || {},
        workflowSettings: execution.workflow?.settings || {},
      },
      {
        completedKeys,
        approvalDecision: extras.approvalDecision || null,
        projectId: extras.projectId,
        conversationId: extras.conversationId,
      },
    ).catch((err) => console.error("[workflow] resume error", err.message));
  } else {
    pumpQueue();
  }

  emit(executionId, STREAM_EVENTS.EXECUTION_RESUMED, {});
  return { ok: true };
}

async function cancelExecution(executionId, userId) {
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId, userId },
  });
  if (!execution) throw Object.assign(new Error("Execution not found"), { status: 404 });
  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: { cancelRequested: true },
  });
  const handle = active.get(executionId);
  if (handle) handle.abort.abort();
  if (!handle && !isTerminal(execution.status)) {
    await persistStatus(executionId, EXECUTION_STATUS.CANCELLED, {
      finishedAt: new Date(),
      error: "Cancelled",
    });
  }
  emit(executionId, STREAM_EVENTS.EXECUTION_CANCELLED, {});
  return { ok: true };
}

async function retryExecution(executionId, userId) {
  const execution = await prisma.workflowExecution.findFirst({
    where: { id: executionId, userId },
    include: { workflow: true },
  });
  if (!execution) throw Object.assign(new Error("Execution not found"), { status: 404 });

  // Resume from last checkpoint — re-run failed node
  const completedKeys = (execution.checkpoint?.completedKeys || []).filter(
    (k) => k !== execution.errorNodeKey,
  );

  await prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status: EXECUTION_STATUS.QUEUED,
      error: null,
      errorNodeKey: null,
      cancelRequested: false,
      pauseRequested: false,
      finishedAt: null,
    },
  });

  const gate = concurrency.acquire(executionId, userId);
  if (gate.ok) {
    executeDefinition(
      {
        ...execution,
        secrets: execution.workflow?.secrets || {},
        workflowSettings: execution.workflow?.settings || {},
      },
      { completedKeys },
    ).catch((err) => console.error("[workflow] retry error", err.message));
  } else {
    await enqueueExecution(executionId);
  }
  return { ok: true };
}

function getActive(executionId) {
  return active.get(executionId) || null;
}

function getQueueStats() {
  return {
    queued: queue.length,
    concurrency: concurrency.stats(),
    active: [...active.keys()],
  };
}

module.exports = {
  startExecution,
  pauseExecution,
  resumeExecution,
  cancelExecution,
  retryExecution,
  enqueueExecution,
  executeDefinition,
  subscribe,
  emit,
  getActive,
  getQueueStats,
  saveCheckpoint,
  createArtifact,
  concurrency,
  assertTransition,
  canTransition,
  isTerminal,
};
