const { contextBuilder } = require("../memory");
const prisma = require("../database/prisma");
const { packSections, estimateTokens, truncateToBudget } = require("./token");
const { DEFAULT_TOKEN_BUDGET } = require("./constants");

/**
 * Context Manager — rank, compress, and fit context into a token budget.
 * Coordinator never sends raw history; agents receive packed context.
 */
class ContextManager {
  async build(userId, prompt, options = {}) {
    const tokenBudget = options.tokenBudget || DEFAULT_TOKEN_BUDGET;
    const agentType = options.agentType || null;

    const built = await contextBuilder.build(userId, prompt, {
      tokenBudget: Math.floor(tokenBudget * 0.7),
      conversationId: options.conversationId || null,
      projectId: options.projectId || null,
      documentId: options.documentId || null,
      agentType,
      topK: options.topK || 12,
    });

    const sections = [];

    if (options.skillPrompt) {
      sections.push({
        label: "SKILL",
        text: options.skillPrompt,
        budget: Math.floor(tokenBudget * 0.08),
      });
    }
    if (options.workflowPrompt) {
      sections.push({
        label: "WORKFLOW",
        text: options.workflowPrompt,
        budget: Math.floor(tokenBudget * 0.08),
      });
    }
    if (options.webContext) {
      sections.push({
        label: "WEB",
        text: options.webContext,
        budget: Math.floor(tokenBudget * 0.12),
      });
    }
    if (options.priorOutputs?.length) {
      const text = options.priorOutputs
        .map((o) => `[${o.agent}]\n${o.output}`)
        .join("\n\n---\n\n");
      sections.push({
        label: "PRIOR_AGENT_OUTPUTS",
        text,
        budget: Math.floor(tokenBudget * 0.25),
      });
    }
    if (built.context) {
      sections.push({
        label: "MEMORY_AND_PROJECT",
        text: built.context,
        budget: Math.floor(tokenBudget * 0.45),
      });
    }

    if (options.conversationId && !built.context?.includes("CONVERSATION")) {
      const msgs = await prisma.message.findMany({
        where: { conversationId: options.conversationId },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      const convo = msgs
        .reverse()
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");
      sections.push({
        label: "RECENT_MESSAGES",
        text: convo,
        budget: Math.floor(tokenBudget * 0.15),
      });
    }

    const packed = packSections(sections, tokenBudget);
    const text = packed.sections
      .map((s) => `===== ${s.label} (${s.tokens} tok) =====\n${s.text}`)
      .join("\n\n");

    return {
      text,
      sections: packed.sections,
      usedTokens: packed.usedTokens,
      citations: built.citations || [],
      budget: tokenBudget,
    };
  }

  compress(text, budget) {
    return truncateToBudget(text, budget);
  }

  size(text) {
    return estimateTokens(text);
  }
}

module.exports = new ContextManager();
