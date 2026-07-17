/**
 * Tool Executor — validate, authorize, timeout, retry, cache, parallel, cancel.
 * Every call produces a full execution record.
 */

const { randomUUID } = require("crypto");
const { registry } = require("./registry");
const { toolCache } = require("./cache");
const { checkPermissions } = require("./permissions");
const { validateAgainstSchema } = require("../sdk/define-tool");
const {
  repairArguments,
  suggestAlternatives,
  shouldSelfCorrect,
} = require("./self-correct");
const obs = require("./observability");
const toolsBridge = require("../../observability/bridge/tools");

const active = new Map(); // executionId → { abortController, toolId }

function parseArgs(rawArgs) {
  if (rawArgs == null) return {};
  if (typeof rawArgs === "string") {
    try {
      return JSON.parse(rawArgs || "{}");
    } catch {
      const err = new Error("Invalid tool arguments JSON");
      err.code = "BAD_ARGS";
      throw err;
    }
  }
  return { ...rawArgs };
}

async function withTimeout(promise, ms, label, signal) {
  if (!ms || ms <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`${label} timed out after ${ms}ms`), { code: "TIMEOUT" }));
    }, ms);
  });
  const abortPromise = signal
    ? new Promise((_, reject) => {
        if (signal.aborted) {
          reject(Object.assign(new Error("Cancelled"), { code: "CANCELLED" }));
          return;
        }
        signal.addEventListener(
          "abort",
          () => reject(Object.assign(new Error("Cancelled"), { code: "CANCELLED" })),
          { once: true },
        );
      })
    : null;
  try {
    return await Promise.race([promise, timeout, abortPromise].filter(Boolean));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Execute a single tool by id/alias with full production pipeline.
 */
async function executeTool(nameOrId, rawArgs, ctx = {}) {
  const startedAt = Date.now();
  const executionId = ctx.toolExecutionId || randomUUID();
  const abortController = new AbortController();
  if (ctx.signal) {
    if (ctx.signal.aborted) abortController.abort();
    else ctx.signal.addEventListener("abort", () => abortController.abort(), { once: true });
  }
  active.set(executionId, { abortController, toolId: nameOrId });

  const emit = (event, data) => {
    try {
      ctx.emit?.(event, { executionId, tool: nameOrId, ...data });
    } catch {
      /* ignore */
    }
  };

  let tool = registry.get(nameOrId);
  let args;
  let retries = 0;
  let cached = false;
  let validatedArgs = {};
  let lastError = null;
  let result = null;

  try {
    args = parseArgs(rawArgs);
  } catch (error) {
    active.delete(executionId);
    return {
      ok: false,
      error: error.message,
      code: error.code || "BAD_ARGS",
      executionId,
      durationMs: Date.now() - startedAt,
      retries: 0,
    };
  }

  if (!tool || tool.enabled === false) {
    // Self-correct: try alternatives for unknown tool
    const alts = suggestAlternatives(nameOrId);
    for (const alt of alts) {
      if (registry.get(alt)) {
        emit("tool_self_correct", { from: nameOrId, to: alt, reason: "unknown_tool" });
        return executeTool(alt, args, { ...ctx, toolExecutionId: randomUUID() });
      }
    }
    active.delete(executionId);
    return {
      ok: false,
      error: `Unknown tool: ${nameOrId}`,
      code: "UNKNOWN_TOOL",
      executionId,
      durationMs: Date.now() - startedAt,
      retries: 0,
    };
  }

  emit("tool_started", {
    toolId: tool.id,
    name: tool.name,
    category: tool.category,
    arguments: args,
  });

  await obs.recordExecutionStart({
    id: executionId,
    toolId: tool.id,
    toolVersion: tool.version,
    userId: ctx.userId,
    executionId: ctx.executionId,
    stepId: ctx.stepId,
    agentType: ctx.agentType,
    inputs: args,
    validatedArgs: args,
  });
  const obsHandle = toolsBridge.onToolStart(
    {
      id: executionId,
      toolId: tool.id,
      toolName: tool.name,
      category: tool.category,
      inputs: args,
      validatedArgs: args,
      userId: ctx.userId,
      agentType: ctx.agentType,
    },
    ctx,
  );
  ctx.__obsHandle = obsHandle;
  await obs.recordLog(executionId, {
    toolId: tool.id,
    level: "info",
    message: "Tool execution started",
    data: { args },
  });

  try {
    await checkPermissions(tool, ctx);
  } catch (error) {
    result = {
      ok: false,
      error: error.message,
      code: error.code || "PERMISSION_DENIED",
    };
    await finalize(executionId, tool, ctx, result, startedAt, 0, false, args);
    active.delete(executionId);
    emit("tool_failed", { result, error: error.message });
    return { ...result, executionId, durationMs: Date.now() - startedAt, retries: 0, validatedArgs: args };
  }

  // Validate
  const schemaErrors = validateAgainstSchema(tool.schema, args);
  if (tool.validator) {
    try {
      const custom = tool.validator(args, ctx);
      if (custom && custom.error) schemaErrors.push(custom.error);
      if (Array.isArray(custom)) schemaErrors.push(...custom);
    } catch (e) {
      schemaErrors.push(e.message);
    }
  }

  if (schemaErrors.length) {
    const repaired = repairArguments(tool, args, schemaErrors[0]);
    const again = validateAgainstSchema(tool.schema, repaired);
    if (!again.length) {
      args = repaired;
      emit("tool_self_correct", { reason: "repaired_args", from: rawArgs, to: args });
    } else {
      result = {
        ok: false,
        error: schemaErrors.join("; "),
        code: "VALIDATION_ERROR",
        details: schemaErrors,
      };
      await finalize(executionId, tool, ctx, result, startedAt, 0, false, args);
      active.delete(executionId);
      emit("tool_failed", { result });
      return {
        ...result,
        executionId,
        durationMs: Date.now() - startedAt,
        retries: 0,
        validatedArgs: args,
      };
    }
  }

  validatedArgs = args;

  // Cache hit
  if (tool.cacheable && !ctx.skipCache) {
    const hit = toolCache.get(tool.id, args, ctx);
    if (hit !== undefined) {
      cached = true;
      result = { ...hit, cached: true };
      await finalize(executionId, tool, ctx, result, startedAt, 0, true, validatedArgs);
      active.delete(executionId);
      emit("tool_completed", { result, cached: true });
      return {
        ...result,
        executionId,
        durationMs: Date.now() - startedAt,
        retries: 0,
        validatedArgs,
        cached: true,
      };
    }
  }

  const maxRetries = ctx.maxRetries ?? tool.retries ?? 1;
  const runCtx = {
    ...ctx,
    signal: abortController.signal,
    toolId: tool.id,
    emit: ctx.emit,
  };

  while (retries <= maxRetries) {
    if (abortController.signal.aborted || ctx.cancelRequested?.()) {
      result = { ok: false, error: "Cancelled", code: "CANCELLED" };
      break;
    }

    try {
      const raw = await withTimeout(
        Promise.resolve(tool.executor(validatedArgs, runCtx)),
        ctx.timeout ?? tool.timeout,
        tool.id,
        abortController.signal,
      );
      result = normalizeResult(raw);

      if (result.ok) break;

      lastError = result.error;
      if (!shouldSelfCorrect(result) || retries >= maxRetries) break;

      // Repair + retry
      const repaired = repairArguments(tool, validatedArgs, result.error);
      validatedArgs = repaired;
      retries += 1;
      emit("tool_retry", { attempt: retries, error: result.error });
      await obs.recordLog(executionId, {
        toolId: tool.id,
        level: "warn",
        message: `Retry ${retries}: ${result.error}`,
        data: { validatedArgs },
      });
    } catch (error) {
      lastError = error.message;
      result = {
        ok: false,
        error: error.message,
        code: error.code || "TOOL_ERROR",
      };
      if (!shouldSelfCorrect(result, error) || retries >= maxRetries) break;
      validatedArgs = repairArguments(tool, validatedArgs, error);
      retries += 1;
      emit("tool_retry", { attempt: retries, error: error.message });
    }
  }

  // Alternative tool on persistent failure
  if (result && !result.ok && shouldSelfCorrect(result) && !ctx._triedAlternatives) {
    const alts = suggestAlternatives(tool.id).filter((id) => registry.get(id));
    for (const alt of alts) {
      emit("tool_self_correct", { from: tool.id, to: alt, reason: "alternative" });
      const altResult = await executeTool(alt, validatedArgs, {
        ...ctx,
        _triedAlternatives: true,
        toolExecutionId: randomUUID(),
      });
      if (altResult.ok) {
        result = {
          ...altResult,
          selfCorrected: true,
          originalTool: tool.id,
          alternativeTool: alt,
        };
        break;
      }
    }
  }

  if (result?.ok && tool.cacheable) {
    toolCache.set(tool.id, validatedArgs, ctx, result, tool.cacheTtlMs);
    // Invalidate write caches for filesystem mutations
    if (tool.category === "filesystem" && /write|edit|delete|rename|batch/i.test(tool.id)) {
      toolCache.invalidate("filesystem.");
    }
  }

  await finalize(executionId, tool, ctx, result, startedAt, retries, cached, validatedArgs);
  active.delete(executionId);

  const durationMs = Date.now() - startedAt;
  if (result?.ok) emit("tool_completed", { result, durationMs, retries });
  else emit("tool_failed", { result, durationMs, retries, error: result?.error || lastError });

  return {
    ...result,
    executionId,
    durationMs,
    retries,
    validatedArgs,
    status: result?.ok ? "completed" : "failed",
    timestamps: { startedAt: new Date(startedAt).toISOString(), finishedAt: new Date().toISOString() },
  };
}

function normalizeResult(raw) {
  if (raw == null) return { ok: true };
  if (typeof raw === "object" && "ok" in raw) return raw;
  return { ok: true, data: raw };
}

async function finalize(executionId, tool, ctx, result, startedAt, retries, cached, validatedArgs) {
  const durationMs = Date.now() - startedAt;
  await obs.recordExecutionFinish(executionId, {
    status: result?.ok ? "completed" : "failed",
    output: result,
    error: result?.ok ? null : result?.error,
    errorCode: result?.code || null,
    durationMs,
    retries,
    cached,
  });
  toolsBridge.onToolFinish(
    ctx.__obsHandle,
    {
      status: result?.ok ? "ok" : "error",
      output: result,
      error: result?.ok ? null : result?.error,
      durationMs,
      retries,
      cached,
      inputs: validatedArgs,
      toolName: tool.name || tool.id,
    },
    {
      toolExecutionId: executionId,
      toolName: tool.name || tool.id,
      category: tool.category,
      agentType: ctx.agentType,
      userId: ctx.userId,
      arguments: validatedArgs,
    },
  );
  await obs.recordMetric(tool.id, "latency_ms", durationMs, "ms", {
    ok: Boolean(result?.ok),
    retries,
  });
  await obs.recordUsage(tool.id, ctx.userId, durationMs, Boolean(result?.ok));
  await obs.recordLog(executionId, {
    toolId: tool.id,
    level: result?.ok ? "info" : "error",
    message: result?.ok ? "Tool execution completed" : `Tool failed: ${result?.error}`,
    data: { durationMs, retries, validatedArgs },
  });
}

/**
 * Execute multiple tools in parallel.
 */
async function executeParallel(calls, ctx = {}) {
  const list = Array.isArray(calls) ? calls : [];
  const results = await Promise.all(
    list.map((c) =>
      executeTool(c.tool || c.name || c.id, c.arguments || c.args || {}, {
        ...ctx,
        toolExecutionId: c.executionId,
      }),
    ),
  );
  return results;
}

function cancelExecution(executionId) {
  const entry = active.get(executionId);
  if (!entry) return false;
  entry.abortController.abort();
  active.delete(executionId);
  return true;
}

function cancelAll() {
  for (const [id, entry] of active) {
    entry.abortController.abort();
    active.delete(id);
  }
}

function getActiveExecutions() {
  return [...active.entries()].map(([id, v]) => ({ executionId: id, toolId: v.toolId }));
}

module.exports = {
  executeTool,
  executeParallel,
  cancelExecution,
  cancelAll,
  getActiveExecutions,
  parseArgs,
};
