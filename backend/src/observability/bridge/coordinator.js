const { engine, TRACE_KIND, SPAN_KIND, TIMELINE_EVENTS, TRACE_STATUS } = require("../engine");
const { STREAM_EVENTS } = require("../../runtime/constants");

/**
 * Bridge Coordinator Runtime events into the Observability Engine.
 */
function attachCoordinator(coordinator) {
  if (!coordinator || coordinator.__obsAttached) return;
  coordinator.__obsAttached = true;

  coordinator.on("event", (payload) => {
    try {
      handleEvent(payload);
    } catch (err) {
      if (process.env.OBS_DEBUG) console.warn("[obs] coordinator bridge:", err.message);
    }
  });
}

function beginExecution(input, executionId) {
  const handle = engine.startExecutionTrace({
    kind: TRACE_KIND.EXECUTION,
    name: "coordinator.run",
    userId: input.userId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    agentExecutionId: executionId,
    attributes: {
      intent: String(input.message || "").slice(0, 200),
    },
  });
  engine.recordUserAction(handle.traceId, {
    label: "user_message",
    message: String(input.message || "").slice(0, 500),
  });
  engine.timeline(handle.traceId, TIMELINE_EVENTS.COORDINATOR, {
    label: "execution_started",
    executionId,
  });
  return handle;
}

function handleEvent(payload) {
  const executionId = payload.executionId;
  if (!executionId) return;
  let handle = engine.resolveTraceForAgent(executionId);
  if (!handle && payload.event === STREAM_EVENTS.EXECUTION_STARTED) {
    handle = engine.startExecutionTrace({
      kind: TRACE_KIND.EXECUTION,
      name: "coordinator.run",
      agentExecutionId: executionId,
      attributes: {},
    });
  }
  if (!handle) return;
  const { traceId } = handle;
  const event = payload.event;

  switch (event) {
    case STREAM_EVENTS.EXECUTION_STARTED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: "started",
        message: payload.message,
      });
      break;

    case STREAM_EVENTS.STATE_CHANGED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: `state:${payload.from}->${payload.to}`,
        agent: payload.agent,
      });
      break;

    case STREAM_EVENTS.CONTEXT_BUILT: {
      engine.timeline(traceId, TIMELINE_EVENTS.CONTEXT_RETRIEVAL, {
        label: "context_built",
        agent: payload.agent,
        tokens: payload.tokens || payload.observability?.usedTokens,
        sessionId: payload.sessionId || payload.observability?.sessionId,
      });
      break;
    }

    case STREAM_EVENTS.MEMORY_READ:
      engine.timeline(traceId, TIMELINE_EVENTS.MEMORY, {
        label: "memory_read",
        count: payload.count,
        tokens: payload.tokens,
      });
      break;

    case STREAM_EVENTS.AGENT_STARTED: {
      const span = engine.startSpan(traceId, {
        name: `agent.${payload.agent || "unknown"}`,
        kind: SPAN_KIND.AGENT,
        attributes: { stepId: payload.stepId, agent: payload.agent },
      });
      if (span) {
        handle._agentSpans = handle._agentSpans || new Map();
        handle._agentSpans.set(payload.stepId || payload.agent, span.spanId);
      }
      engine.recordAgent(traceId, {
        spanId: span?.spanId,
        agentExecutionId: executionId,
        agentStepId: payload.stepId,
        agentType: payload.agent || "coordinator",
        orderIndex: payload.orderIndex || 0,
        status: "running",
        inputSummary: payload.description || payload.task || payload.message,
        userId: handle.userId,
      });
      break;
    }

    case STREAM_EVENTS.AGENT_REASONING:
      engine.timeline(traceId, TIMELINE_EVENTS.AGENT, {
        label: `reasoning:${payload.agent}`,
        text: String(payload.text || "").slice(0, 500),
      });
      break;

    case STREAM_EVENTS.AGENT_COMPLETED: {
      const spanId = handle._agentSpans?.get(payload.stepId || payload.agent);
      if (spanId) {
        engine.endSpan(traceId, spanId, {
          status: TRACE_STATUS.OK,
          attributes: { tokens: payload.tokens },
        });
      }
      engine.recordAgent(traceId, {
        spanId,
        agentExecutionId: executionId,
        agentStepId: payload.stepId,
        agentType: payload.agent || "coordinator",
        orderIndex: payload.orderIndex || 0,
        status: "ok",
        durationMs: payload.durationMs,
        promptTokens: payload.promptTokens || 0,
        completionTokens: payload.completionTokens || 0,
        outputSummary: String(payload.output || payload.content || "").slice(0, 2000),
        reasoning: Array.isArray(payload.reasoning)
          ? payload.reasoning.join("\n")
          : payload.reasoning,
        userId: handle.userId,
      });
      break;
    }

    case STREAM_EVENTS.AGENT_FAILED: {
      const spanId = handle._agentSpans?.get(payload.stepId || payload.agent);
      if (spanId) {
        engine.endSpan(traceId, spanId, {
          status: TRACE_STATUS.ERROR,
          error: payload.error || payload.message,
        });
      }
      engine.recordAgent(traceId, {
        spanId,
        agentExecutionId: executionId,
        agentStepId: payload.stepId,
        agentType: payload.agent || "coordinator",
        status: "error",
        error: payload.error || payload.message,
        retries: payload.retries || 0,
        userId: handle.userId,
      });
      engine.tracer.incrementRetries(traceId);
      break;
    }

    case STREAM_EVENTS.TOOL_STARTED:
    case STREAM_EVENTS.TOOL_COMPLETED:
    case STREAM_EVENTS.TOOL_FAILED:
      // Tool platform bridge also records; keep timeline marker
      engine.timeline(traceId, TIMELINE_EVENTS.TOOL_CALL, {
        label: payload.tool || payload.name || "tool",
        status: event.replace("tool_", ""),
      });
      break;

    case STREAM_EVENTS.FINAL_RESPONSE:
      engine.timeline(traceId, TIMELINE_EVENTS.RESPONSE, {
        label: "final_response",
        chars: String(payload.content || "").length,
      });
      break;

    case STREAM_EVENTS.METRICS:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: "metrics",
        tokens: payload.totalTokens,
        cost: payload.estimatedCost,
      });
      break;

    case STREAM_EVENTS.EXECUTION_COMPLETED:
      engine.endExecutionTrace(traceId, {
        status: TRACE_STATUS.OK,
        extras: { tokens: payload.tokens },
      });
      break;

    case STREAM_EVENTS.EXECUTION_FAILED:
      engine.endExecutionTrace(traceId, {
        status: TRACE_STATUS.ERROR,
        error: payload.error || payload.message,
      });
      break;

    case STREAM_EVENTS.EXECUTION_CANCELLED:
      engine.endExecutionTrace(traceId, {
        status: TRACE_STATUS.CANCELLED,
        error: "cancelled",
      });
      break;

    case STREAM_EVENTS.ERROR:
      engine.timeline(traceId, TIMELINE_EVENTS.ERROR, {
        label: "error",
        message: payload.message,
        code: payload.code,
      });
      break;

    default:
      break;
  }
}

module.exports = { attachCoordinator, beginExecution, handleEvent };
