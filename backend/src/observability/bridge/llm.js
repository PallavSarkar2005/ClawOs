const { engine, SPAN_KIND, TRACE_STATUS, TIMELINE_EVENTS } = require("../engine");

/**
 * Wrap LLM chat() to capture prompt traces, latency, streaming, tokens, cost.
 */
function wrapChat(originalChat) {
  return async function observedChat(args = {}) {
    const ctx = args.obsContext || {};
    const handle =
      (ctx.executionId && engine.resolveTraceForAgent(ctx.executionId)) ||
      (ctx.workflowExecutionId && engine.resolveTraceForWorkflow(ctx.workflowExecutionId)) ||
      (ctx.traceId && engine.tracer.get(ctx.traceId)) ||
      null;

    const messages = args.messages || [];
    const systemPrompt = messages
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n");
    const userPrompt = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n");

    let span = null;
    let firstTokenAt = null;
    const startedAt = Date.now();

    if (handle) {
      span = engine.startSpan(handle.traceId, {
        name: "llm.chat",
        kind: SPAN_KIND.LLM,
        attributes: { streaming: typeof args.onToken === "function" },
      });
      engine.timeline(handle.traceId, TIMELINE_EVENTS.LLM, {
        label: "llm_request",
      });
    }

    const userOnToken = args.onToken;
    const wrappedOnToken = userOnToken
      ? (token) => {
          if (firstTokenAt == null) {
            firstTokenAt = Date.now();
            if (handle) {
              engine.timeline(handle.traceId, TIMELINE_EVENTS.STREAMING, {
                label: "first_token",
                streamingLatencyMs: firstTokenAt - startedAt,
              });
            }
          }
          return userOnToken(token);
        }
      : undefined;

    try {
      const result = await originalChat({
        ...args,
        onToken: wrappedOnToken,
      });
      const latencyMs = Date.now() - startedAt;
      const streamingLatencyMs = firstTokenAt ? firstTokenAt - startedAt : null;
      const usage = result.usage || {};

      if (handle) {
        engine.recordPrompt(handle.traceId, {
          spanId: span?.spanId,
          originalPrompt: userPrompt,
          systemPrompt,
          contextInjected: ctx.contextInjected,
          repositoryContext: ctx.repositoryContext,
          retrievedMemories: ctx.retrievedMemories || [],
          retrievedDocuments: ctx.retrievedDocuments || [],
          retrievedCode: ctx.retrievedCode || [],
          response: result.content,
          model: result.model,
          provider: result.provider,
          temperature: args.temperature ?? args.settings?.temperature,
          promptTokens: usage.prompt_tokens || 0,
          completionTokens: usage.completion_tokens || 0,
          totalTokens: usage.total_tokens || 0,
          latencyMs,
          streamingLatencyMs,
          status: "ok",
          userId: handle.userId,
          metadata: { finish_reason: result.finish_reason },
        });
        if (span) {
          engine.endSpan(handle.traceId, span.spanId, {
            status: TRACE_STATUS.OK,
            attributes: {
              model: result.model,
              provider: result.provider,
              tokens: usage.total_tokens,
            },
          });
        }
      }

      return result;
    } catch (error) {
      if (handle) {
        engine.recordPrompt(handle.traceId, {
          spanId: span?.spanId,
          originalPrompt: userPrompt,
          systemPrompt,
          status: "error",
          error: error.message,
          latencyMs: Date.now() - startedAt,
          userId: handle.userId,
        });
        if (span) {
          engine.endSpan(handle.traceId, span.spanId, {
            status: TRACE_STATUS.ERROR,
            error: error.message,
          });
        }
      }
      throw error;
    }
  };
}

module.exports = { wrapChat };
