const { contextEngine } = require("../../context");

/**
 * ContextBuilder — Phase 4 facade over Context Engine for memory API compatibility.
 */
class ContextBuilder {
  async build(userId, prompt, options = {}) {
    const result = await contextEngine.build(userId, prompt, {
      tokenBudget: options.tokenBudget || 3500,
      conversationId: options.conversationId || null,
      projectId: options.projectId || null,
      workflowId: options.workflowId || null,
      documentId: options.documentId || null,
      agentType: options.agentType || "coordinator",
      topK: options.topK || 12,
      persist: options.persist !== false,
      compressLevel: options.compressLevel,
    });

    return {
      context: result.text,
      sections: (result.sections || []).map((s) => ({
        label: s.label,
        text: s.text,
        tokens: s.tokens,
        score: s.score,
        reason: s.reason,
      })),
      citations: result.citations || [],
      tokenEstimate: result.usedTokens,
      tokenBudget: result.budget,
      retrievalCount: result.observability?.retrievedCount || 0,
      allocation: result.allocation,
      dropped: result.dropped,
      sessionId: result.sessionId,
      compressionRatio: result.compressionRatio,
      reasoningPath: result.reasoningPath,
      observability: result.observability,
    };
  }
}

module.exports = new ContextBuilder();
