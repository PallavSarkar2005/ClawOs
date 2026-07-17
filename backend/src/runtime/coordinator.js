const EventEmitter = require("events");
const {
  EXECUTION_STATES,
  STREAM_EVENTS,
  AGENT_TYPES,
  STEP_STATUS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_STEP_TIMEOUT_MS,
} = require("./constants");
const { stateForAgent, isTerminal } = require("./state-machine");
const persistence = require("./persistence");
const contextManager = require("./context-manager");
const { createPlan } = require("./planner");
const { withTimeout } = require("./retry.engine");
const { citationEngine } = require("../memory");

const researchAgent = require("./agents/research.agent");
const architectAgent = require("./agents/architect.agent");
const coderAgent = require("./agents/coder.agent");
const testerAgent = require("./agents/tester.agent");
const reviewerAgent = require("./agents/reviewer.agent");
const { attachCoordinator, beginExecution } = require("../observability/bridge/coordinator");

const AGENTS = {
  [AGENT_TYPES.RESEARCH]: researchAgent,
  [AGENT_TYPES.ARCHITECT]: architectAgent,
  [AGENT_TYPES.CODER]: coderAgent,
  [AGENT_TYPES.TESTER]: testerAgent,
  [AGENT_TYPES.REVIEWER]: reviewerAgent,
};

/** In-memory active executions for cancel/resume */
const active = new Map();

function topologicalWaves(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const remaining = new Set(tasks.map((t) => t.id));
  const done = new Set();
  const waves = [];

  while (remaining.size) {
    const wave = [];
    for (const id of remaining) {
      const task = byId.get(id);
      const deps = task.dependencies || [];
      if (deps.every((d) => done.has(d) || !byId.has(d))) {
        wave.push(task);
      }
    }
    if (!wave.length) {
      // Cycle fallback — schedule remaining sequentially
      const next = byId.get([...remaining][0]);
      waves.push([next]);
      remaining.delete(next.id);
      done.add(next.id);
      continue;
    }
    for (const t of wave) {
      remaining.delete(t.id);
      done.add(t.id);
    }
    waves.push(wave);
  }
  return waves;
}

function extractFinalAnswer(text) {
  if (!text) return "";
  const match = text.match(/##\s*Final Answer\s*([\s\S]*?)(?=\n##\s|$)/i);
  if (match) return match[1].trim();
  return text.trim();
}

class Coordinator extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
  }

  getActive(executionId) {
    return active.get(executionId) || null;
  }

  async cancel(executionId, userId) {
    const row = await persistence.requestCancel(executionId, userId);
    if (!row) return null;
    const handle = active.get(executionId);
    if (handle) {
      handle.cancelRequested = true;
      handle.abortController.abort();
    }
    return row;
  }

  async run(input) {
    const abortController = new AbortController();
    const execution = await persistence.createExecution({
      userId: input.userId,
      conversationId: input.conversationId,
      projectId: input.projectId,
      messageId: input.messageId,
      intent: input.message?.slice(0, 200),
      maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    const handle = {
      executionId: execution.id,
      cancelRequested: false,
      abortController,
      outputs: new Map(),
      steps: new Map(),
    };
    active.set(execution.id, handle);
    beginExecution(input, execution.id);

    const externalEmit = typeof input.onEvent === "function" ? input.onEvent : null;

    const emit = (event, data = {}) => {
      const payload = {
        event,
        executionId: execution.id,
        ts: new Date().toISOString(),
        ...data,
      };
      this.emit(execution.id, payload);
      this.emit("event", payload);
      try {
        externalEmit?.(payload);
      } catch {
        /* ignore client emit errors */
      }
      persistence
        .addLog(execution.id, {
          level: data.level || "info",
          agentType: data.agent || null,
          stepId: data.stepId || null,
          event,
          message: data.message || event,
          data,
        })
        .catch(() => {});
    };

    try {
      emit(STREAM_EVENTS.EXECUTION_STARTED, {
        status: EXECUTION_STATES.QUEUED,
        message: input.message?.slice(0, 200),
      });

      await persistence.transitionState(
        execution.id,
        EXECUTION_STATES.QUEUED,
        EXECUTION_STATES.PLANNING,
        "start planning",
      );
      emit(STREAM_EVENTS.STATE_CHANGED, {
        from: EXECUTION_STATES.QUEUED,
        to: EXECUTION_STATES.PLANNING,
      });

      const ctx = {
        userId: input.userId,
        conversationId: input.conversationId,
        projectId: input.projectId,
        documentId: input.documentId,
        userMessage: input.message,
        skillPrompt: input.skillPrompt || "",
        workflowPrompt: input.workflowPrompt || "",
        webContext: input.webContext || "",
        settings: input.settings || {},
        executionId: execution.id,
        signal: abortController.signal,
        cancelRequested: () => handle.cancelRequested,
        maxRetries: input.maxRetries ?? DEFAULT_MAX_RETRIES,
        stepTimeoutMs: input.stepTimeoutMs || DEFAULT_STEP_TIMEOUT_MS,
        emit,
      };

      const plan = await withTimeout(
        createPlan(ctx),
        90_000,
        "planning",
      );

      if (handle.cancelRequested) {
        return this.#finishCancelled(execution.id, emit);
      }

      await persistence.setPlan(
        execution.id,
        plan,
        plan.tasks.map((t) => ({ id: t.id, agent: t.agent, deps: t.dependencies })),
      );

      // Persist steps
      for (const task of plan.tasks) {
        const step = await persistence.createStep(execution.id, task);
        handle.steps.set(task.id, step);
      }

      const waves = topologicalWaves(plan.tasks);
      for (const wave of waves) {
        if (handle.cancelRequested) {
          return this.#finishCancelled(execution.id, emit);
        }

        await Promise.all(
          wave.map((task) => this.#runTask(task, plan, handle, ctx, input, emit)),
        );
      }

      const final = this.#mergeOutputs(plan, handle.outputs);
      const annotated = citationEngine.annotateAnswer
        ? citationEngine.annotateAnswer(final, input.citations || [])
        : { answer: final, citations: [] };

      await persistence.transitionState(
        execution.id,
        null,
        EXECUTION_STATES.COMPLETED,
        "all tasks complete",
      ).catch(async () => {
        // Force complete if transition validation fails due to concurrent state
        await persistence.completeExecution(execution.id, {
          status: EXECUTION_STATES.COMPLETED,
          finalOutput: annotated.answer,
          plan,
          agentTree: plan.tasks.map((t) => ({ id: t.id, agent: t.agent })),
        });
      });

      const completed = await persistence.completeExecution(execution.id, {
        status: EXECUTION_STATES.COMPLETED,
        finalOutput: annotated.answer,
        plan,
        agentTree: plan.tasks.map((t) => ({ id: t.id, agent: t.agent })),
        contextSize: contextManager.size(annotated.answer),
      });

      emit(STREAM_EVENTS.FINAL_RESPONSE, {
        content: annotated.answer,
        citations: annotated.citations || [],
      });
      emit(STREAM_EVENTS.EXECUTION_COMPLETED, {
        status: EXECUTION_STATES.COMPLETED,
        tokens: completed.totalTokens,
        cost: completed.estimatedCost,
      });
      emit(STREAM_EVENTS.METRICS, {
        promptTokens: completed.promptTokens,
        completionTokens: completed.completionTokens,
        totalTokens: completed.totalTokens,
        estimatedCost: completed.estimatedCost,
      });

      return {
        executionId: execution.id,
        status: EXECUTION_STATES.COMPLETED,
        reply: annotated.answer,
        citations: annotated.citations || [],
        plan,
        metrics: {
          promptTokens: completed.promptTokens,
          completionTokens: completed.completionTokens,
          totalTokens: completed.totalTokens,
          estimatedCost: completed.estimatedCost,
        },
      };
    } catch (error) {
      if (error.code === "CANCELLED" || handle.cancelRequested) {
        return this.#finishCancelled(execution.id, emit);
      }

      emit(STREAM_EVENTS.ERROR, { message: error.message, code: error.code });
      await persistence.completeExecution(execution.id, {
        status: EXECUTION_STATES.FAILED,
        error: error.message,
        finalOutput: null,
      });
      try {
        await persistence.transitionState(
          execution.id,
          null,
          EXECUTION_STATES.FAILED,
          error.message,
        );
      } catch {
        /* ignore */
      }
      emit(STREAM_EVENTS.EXECUTION_FAILED, {
        status: EXECUTION_STATES.FAILED,
        error: error.message,
      });

      return {
        executionId: execution.id,
        status: EXECUTION_STATES.FAILED,
        reply: `Agent runtime failed: ${error.message}`,
        error: error.message,
        citations: [],
      };
    } finally {
      active.delete(execution.id);
    }
  }

  async #runTask(task, plan, handle, ctx, input, emit) {
    const agent = AGENTS[task.agent];
    if (!agent) {
      emit(STREAM_EVENTS.LOG, {
        level: "warn",
        message: `Unknown agent ${task.agent}, skipping`,
      });
      return;
    }

    const step = handle.steps.get(task.id);
    const targetState = stateForAgent(task.agent);

    if (targetState) {
      try {
        const current = await persistence.getExecution(ctx.executionId);
        if (current && !isTerminal(current.status)) {
          await persistence.transitionState(
            ctx.executionId,
            current.status,
            targetState,
            `running ${task.agent}`,
          );
          emit(STREAM_EVENTS.STATE_CHANGED, {
            from: current.status,
            to: targetState,
            agent: task.agent,
          });
        }
      } catch {
        /* soft-fail transition for parallel agents */
      }
    }

    await persistence.startStep(step.id);

    const priorOutputs = [...handle.outputs.entries()].map(([id, out]) => {
      const t = plan.tasks.find((x) => x.id === id);
      return { agent: t?.agent || id, output: out.content };
    });

    const context = await contextManager.build(ctx.userId, ctx.userMessage, {
      conversationId: ctx.conversationId,
      projectId: ctx.projectId,
      documentId: ctx.documentId,
      skillPrompt: ctx.skillPrompt,
      workflowPrompt: ctx.workflowPrompt,
      webContext: ctx.webContext,
      priorOutputs,
      agentType: task.agent,
      agentExecutionId: handle.executionId,
      tokenBudget: 5500,
    });

    emit(STREAM_EVENTS.CONTEXT_BUILT, {
      agent: task.agent,
      tokens: context.usedTokens,
      stepId: step.id,
      sessionId: context.sessionId,
      allocation: context.allocation,
      compressionRatio: context.compressionRatio,
      dropped: (context.dropped || []).length,
      citations: (context.citations || []).slice(0, 20),
      reasoningPath: context.reasoningPath,
      observability: context.observability,
      sections: (context.sections || []).map((s) => ({
        label: s.label,
        tokens: s.tokens,
        score: s.score,
        reason: s.reason,
      })),
    });
    emit(STREAM_EVENTS.MEMORY_READ, {
      agent: task.agent,
      tokens: context.usedTokens,
      sessionId: context.sessionId,
    });

    const agentCtx = {
      ...ctx,
      step,
      contextText: context.text,
    };

    try {
      const output = await agent.run(task, agentCtx);
      handle.outputs.set(task.id, output);
      await persistence.updateStep(step.id, {
        status: STEP_STATUS.COMPLETED,
        output: output.content,
        reasoning: output.reasoning,
        prompt: task.description,
        promptTokens: output.usage?.prompt_tokens || 0,
        completionTokens: output.usage?.completion_tokens || 0,
        totalTokens: output.usage?.total_tokens || 0,
        estimatedCost: output.usage?.estimated_cost || 0,
        startedAt: step.startedAt,
      });
    } catch (error) {
      await persistence.updateStep(step.id, {
        status: STEP_STATUS.FAILED,
        error: error.message,
        startedAt: step.startedAt,
      });
      emit(STREAM_EVENTS.AGENT_FAILED, {
        agent: task.agent,
        stepId: step.id,
        error: error.message,
      });

      // Partial failure: for non-critical agents continue; reviewer/coder failures bubble
      if (task.agent === AGENT_TYPES.CODER || task.agent === AGENT_TYPES.REVIEWER) {
        throw error;
      }

      handle.outputs.set(task.id, {
        agent: task.agent,
        content: `(${task.agent} failed: ${error.message})`,
        usage: {},
      });
    }
  }

  #mergeOutputs(plan, outputs) {
    const reviewer = [...plan.tasks].reverse().find((t) => t.agent === AGENT_TYPES.REVIEWER);
    if (reviewer && outputs.has(reviewer.id)) {
      return extractFinalAnswer(outputs.get(reviewer.id).content);
    }

    const coder = [...plan.tasks].reverse().find((t) => t.agent === AGENT_TYPES.CODER);
    if (coder && outputs.has(coder.id)) {
      return outputs.get(coder.id).content;
    }

    const parts = plan.tasks
      .map((t) => outputs.get(t.id))
      .filter(Boolean)
      .map((o) => `### ${o.agent}\n${o.content}`);
    return parts.join("\n\n") || "No agent output produced.";
  }

  async #finishCancelled(executionId, emit) {
    await persistence.completeExecution(executionId, {
      status: EXECUTION_STATES.CANCELLED,
      error: "Cancelled by user",
    });
    try {
      await persistence.transitionState(
        executionId,
        null,
        EXECUTION_STATES.CANCELLED,
        "user cancel",
      );
    } catch {
      /* ignore */
    }
    emit(STREAM_EVENTS.EXECUTION_CANCELLED, {
      status: EXECUTION_STATES.CANCELLED,
    });
    return {
      executionId,
      status: EXECUTION_STATES.CANCELLED,
      reply: "Execution cancelled.",
      citations: [],
    };
  }

  /**
   * Resume a failed/cancelled execution from incomplete steps.
   */
  async resume(executionId, userId, inputExtras = {}) {
    const execution = await persistence.getExecution(executionId, userId);
    if (!execution) {
      throw Object.assign(new Error("Execution not found"), { code: "NOT_FOUND" });
    }
    if (execution.status === EXECUTION_STATES.COMPLETED) {
      return {
        executionId,
        status: execution.status,
        reply: execution.finalOutput,
      };
    }

    const plan = execution.plan || { tasks: [] };
    const incomplete = (execution.steps || []).filter(
      (s) => s.status !== STEP_STATUS.COMPLETED,
    );

    // Re-run from scratch with same message context if plan missing
    return this.run({
      userId,
      conversationId: execution.conversationId,
      projectId: execution.projectId,
      message: inputExtras.message || execution.intent || "Resume previous execution",
      ...inputExtras,
    });
  }
}

module.exports = new Coordinator();
attachCoordinator(module.exports);
