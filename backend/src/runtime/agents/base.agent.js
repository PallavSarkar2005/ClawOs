const { chat } = require("../llm.client");
const { getToolSchemas, executeTool } = require("../tools");
const persistence = require("../persistence");
const { STREAM_EVENTS, DEFAULT_STEP_TIMEOUT_MS } = require("../constants");
const { withTimeout, withRetry } = require("../retry.engine");
const { estimateCost } = require("../cost");
const { memoryService } = require("../../memory");

class BaseAgent {
  constructor({ type, systemPrompt, tools = [], maxToolRounds = 6 }) {
    this.type = type;
    this.systemPrompt = systemPrompt;
    this.tools = tools;
    this.maxToolRounds = maxToolRounds;
    this.state = {};
    this.metrics = { promptTokens: 0, completionTokens: 0, toolCalls: 0 };
  }

  getToolSchemas() {
    if (!this.tools.length) return null;
    return getToolSchemas(this.tools);
  }

  async remember(ctx, content, tags = []) {
    if (!ctx.userId || !content) return null;
    try {
      const mem = await memoryService.create(ctx.userId, {
        content: String(content).slice(0, 8000),
        scope: "AGENT",
        conversationId: ctx.conversationId || null,
        projectId: ctx.projectId || null,
        agentType: this.type,
        source: `agent:${this.type}`,
        importance: 0.65,
        tags: ["agent", this.type, ...tags],
      });
      ctx.emit?.(STREAM_EVENTS.MEMORY_WRITE, {
        agent: this.type,
        memoryId: mem.id,
      });
      return mem;
    } catch (error) {
      ctx.emit?.(STREAM_EVENTS.LOG, {
        level: "warn",
        agent: this.type,
        message: `Memory write failed: ${error.message}`,
      });
      return null;
    }
  }

  async run(task, ctx) {
    const step = ctx.step;
    const startedAt = new Date();
    ctx.emit?.(STREAM_EVENTS.AGENT_STARTED, {
      agent: this.type,
      stepId: step?.id,
      taskId: task.id,
      description: task.description,
    });

    const messages = [
      { role: "system", content: this.systemPrompt },
      {
        role: "user",
        content: this.buildUserPrompt(task, ctx),
      },
    ];

    let rounds = 0;
    let finalContent = "";
    let reasoning = [];

    const result = await withRetry(
      async () =>
        withTimeout(
          this.runLoop(messages, ctx, {
            onReasoning: (r) => {
              reasoning.push(r);
              ctx.emit?.(STREAM_EVENTS.AGENT_REASONING, {
                agent: this.type,
                stepId: step?.id,
                text: r,
              });
            },
            onToken: (token) => {
              ctx.emit?.(STREAM_EVENTS.AGENT_TOKEN, {
                agent: this.type,
                stepId: step?.id,
                token,
              });
            },
            getFinal: () => finalContent,
            setFinal: (v) => {
              finalContent = v;
            },
            getRounds: () => rounds,
            bumpRounds: () => {
              rounds += 1;
            },
          }),
          ctx.stepTimeoutMs || DEFAULT_STEP_TIMEOUT_MS,
          `${this.type} agent`,
        ),
      {
        maxRetries: step?.maxRetries ?? ctx.maxRetries ?? 2,
        signal: ctx.signal,
        onRetry: async (error, attempt) => {
          ctx.emit?.(STREAM_EVENTS.LOG, {
            level: "warn",
            agent: this.type,
            message: `Retry ${attempt + 1}: ${error.message}`,
          });
          await persistence.addLog(ctx.executionId, {
            stepId: step?.id,
            level: "warn",
            agentType: this.type,
            event: "retry",
            message: error.message,
            data: { attempt },
          });
        },
      },
    );

    finalContent = result.content || finalContent;
    await this.remember(ctx, finalContent.slice(0, 2000), ["output"]);

    const output = {
      agent: this.type,
      content: finalContent,
      reasoning: reasoning.join("\n"),
      usage: result.usage,
      toolCalls: result.toolCallCount || 0,
      metrics: { ...this.metrics },
    };

    ctx.emit?.(STREAM_EVENTS.AGENT_COMPLETED, {
      agent: this.type,
      stepId: step?.id,
      taskId: task.id,
      output: finalContent.slice(0, 4000),
      tokens: result.usage?.total_tokens || 0,
      durationMs: Date.now() - startedAt.getTime(),
    });

    return output;
  }

  buildUserPrompt(task, ctx) {
    const parts = [
      `Task ID: ${task.id}`,
      `Description: ${task.description}`,
      task.expectedOutputs?.length
        ? `Expected outputs: ${task.expectedOutputs.join(", ")}`
        : null,
      task.requiredTools?.length
        ? `Preferred tools: ${task.requiredTools.join(", ")}`
        : null,
      "",
      "CONTEXT:",
      ctx.contextText || "(no extra context)",
      "",
      "USER REQUEST:",
      ctx.userMessage || "",
    ];
    return parts.filter(Boolean).join("\n");
  }

  async runLoop(messages, ctx, ctl) {
    let toolCallCount = 0;
    let usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
    const toolSchemas = this.getToolSchemas();

    while (ctl.getRounds() <= this.maxToolRounds) {
      if (ctx.signal?.aborted || ctx.cancelRequested?.()) {
        throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
      }

      const response = await chat({
        messages,
        tools: toolSchemas,
        settings: ctx.settings || {},
        signal: ctx.signal,
        onToken: toolSchemas ? undefined : ctl.onToken,
      });

      usage.prompt_tokens += response.usage?.prompt_tokens || 0;
      usage.completion_tokens += response.usage?.completion_tokens || 0;
      usage.total_tokens += response.usage?.total_tokens || 0;
      this.metrics.promptTokens += response.usage?.prompt_tokens || 0;
      this.metrics.completionTokens += response.usage?.completion_tokens || 0;

      await persistence.accumulateUsage(ctx.executionId, response.usage || {});

          if (response.tool_calls?.length) {
        messages.push({
          role: "assistant",
          content: response.content || null,
          tool_calls: response.tool_calls,
        });

        // Parallel tool execution via Tool Engine
        const toolResults = await Promise.all(
          response.tool_calls.map(async (tc) => {
            toolCallCount += 1;
            this.metrics.toolCalls += 1;
            const name = tc.function?.name;
            const args = tc.function?.arguments || "{}";
            let parsedArgs;
            try {
              parsedArgs = JSON.parse(args);
            } catch {
              parsedArgs = { raw: args };
            }

            ctx.emit?.(STREAM_EVENTS.TOOL_STARTED, {
              agent: this.type,
              tool: name,
              arguments: parsedArgs,
              stepId: ctx.step?.id,
            });

            const toolRow = await persistence.createToolCall({
              executionId: ctx.executionId,
              stepId: ctx.step?.id,
              agentType: this.type,
              toolName: name,
              arguments: parsedArgs,
            });

            let toolResult;
            try {
              toolResult = await executeTool(name, args, {
                userId: ctx.userId,
                projectId: ctx.projectId,
                conversationId: ctx.conversationId,
                documentId: ctx.documentId,
                agentType: this.type,
                executionId: ctx.executionId,
                stepId: ctx.step?.id,
                allowedTools: this.tools,
                signal: ctx.signal,
                emit: (event, data) => {
                  if (event === "tool_progress") {
                    ctx.emit?.(STREAM_EVENTS.TOOL_STARTED, {
                      agent: this.type,
                      tool: name,
                      progress: data,
                      stepId: ctx.step?.id,
                    });
                  }
                  ctx.emit?.(STREAM_EVENTS.LOG, {
                    level: "info",
                    agent: this.type,
                    event,
                    message: data?.message || event,
                    data,
                  });
                },
              });
              await persistence.finishToolCall(toolRow.id, {
                result: toolResult,
                status: toolResult.ok ? "completed" : "failed",
                error: toolResult.ok ? null : toolResult.error,
              });
              ctx.emit?.(
                toolResult.ok ? STREAM_EVENTS.TOOL_COMPLETED : STREAM_EVENTS.TOOL_FAILED,
                {
                  agent: this.type,
                  tool: name,
                  result: toolResult,
                  executionId: toolResult.executionId,
                  durationMs: toolResult.durationMs,
                  retries: toolResult.retries,
                  stepId: ctx.step?.id,
                },
              );
            } catch (error) {
              toolResult = { ok: false, error: error.message };
              await persistence.finishToolCall(toolRow.id, {
                result: toolResult,
                status: "failed",
                error: error.message,
              });
              ctx.emit?.(STREAM_EVENTS.TOOL_FAILED, {
                agent: this.type,
                tool: name,
                error: error.message,
                stepId: ctx.step?.id,
              });
            }

            return { tc, toolResult };
          }),
        );

        for (const { tc, toolResult } of toolResults) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(toolResult),
          });
        }

        ctl.bumpRounds();
        continue;
      }

      const content = response.content || "";
      ctl.setFinal(content);
      if (content) ctl.onReasoning?.(content.slice(0, 500));
      usage.estimated_cost = estimateCost(usage.prompt_tokens, usage.completion_tokens);

      return {
        content,
        usage,
        toolCallCount,
      };
    }

    return {
      content: ctl.getFinal() || "Agent exceeded tool round limit.",
      usage,
      toolCallCount,
    };
  }
}

module.exports = BaseAgent;
