const { contextEngine } = require("../context");
const { estimateTokens, truncateToBudget } = require("./token");
const { DEFAULT_TOKEN_BUDGET } = require("./constants");

/**
 * Context Manager — Phase 4 production facade used by coordinator & planner.
 * Delegates to the Context Engine (retrieval → ranking → compression → budget).
 */
class ContextManager {
  async build(userId, prompt, options = {}) {
    const result = await contextEngine.build(userId, prompt, {
      tokenBudget: options.tokenBudget || DEFAULT_TOKEN_BUDGET,
      agentType: options.agentType || null,
      conversationId: options.conversationId || null,
      projectId: options.projectId || null,
      documentId: options.documentId || null,
      skillPrompt: options.skillPrompt,
      skillId: options.skillId,
      workflowPrompt: options.workflowPrompt,
      workflowId: options.workflowId,
      webContext: options.webContext,
      priorOutputs: options.priorOutputs,
      agentExecutionId: options.agentExecutionId,
      topK: options.topK || 12,
      model: options.model,
      modelLimit: options.modelLimit,
      persist: options.persist !== false,
      compressLevel: options.compressLevel,
    });

    return {
      text: result.text,
      sections: result.sections,
      usedTokens: result.usedTokens,
      citations: result.citations || [],
      budget: result.budget,
      allocation: result.allocation,
      modelLimit: result.modelLimit,
      dropped: result.dropped,
      compressionRatio: result.compressionRatio,
      reasoningPath: result.reasoningPath,
      observability: result.observability,
      sessionId: result.sessionId,
      graph: result.graph,
      agentType: result.agentType,
      durationMs: result.durationMs,
    };
  }

  compress(text, budget) {
    return truncateToBudget(text, budget);
  }

  size(text) {
    return estimateTokens(text);
  }

  async preview(userId, prompt, options = {}) {
    return this.build(userId, prompt, options);
  }

  async inspect(sessionId, userId) {
    return contextEngine.inspect(sessionId, userId);
  }

  async replay(sessionId, userId) {
    return contextEngine.replay(sessionId, userId);
  }
}

module.exports = new ContextManager();
