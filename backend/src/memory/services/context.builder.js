const prisma = require("../../database/prisma");
const retrievalEngine = require("./retrieval.engine");
const scoringService = require("./scoring.service");
const { estimateTokens, MEMORY_SCOPES } = require("../utils");

function truncateToBudget(text, budget) {
  const tokens = estimateTokens(text);
  if (tokens <= budget) return { text, tokens };
  const chars = Math.max(40, budget * 4);
  return { text: `${text.slice(0, chars)}…`, tokens: budget };
}

class ContextBuilder {
  /**
   * Collect, rank, compress memories/docs/agent state into an optimal context block.
   */
  async build(userId, prompt, options = {}) {
    const {
      tokenBudget = 3500,
      conversationId = null,
      projectId = null,
      workflowId = null,
      documentId = null,
      agentType = null,
      includeConversation = true,
      includeDocuments = true,
      includeProject = true,
      includeAgent = true,
      includeWorkspace = true,
      topK = 12,
    } = options;

    const budgets = {
      conversation: Math.floor(tokenBudget * 0.2),
      documents: Math.floor(tokenBudget * 0.35),
      project: Math.floor(tokenBudget * 0.15),
      agent: Math.floor(tokenBudget * 0.15),
      user: Math.floor(tokenBudget * 0.1),
      workspace: Math.floor(tokenBudget * 0.05),
    };

    const sections = [];
    const citations = [];
    let usedTokens = 0;

    const retrieval = await retrievalEngine.hybridSearch(userId, prompt, {
      topK,
      projectId,
      documentIds: documentId ? [documentId] : undefined,
      includeMemories: true,
      includeChunks: includeDocuments,
    });

    const byScope = (scope) =>
      retrieval.results.filter((r) => r.scope === scope || (scope === "DOCUMENT" && r.type === "chunk"));

    // Conversation memory + recent messages
    if (includeConversation && conversationId) {
      const msgs = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: "desc" },
        take: 12,
      });
      const convMemories = byScope(MEMORY_SCOPES.CONVERSATION);
      const lines = [
        ...msgs.reverse().map((m) => `${m.role}: ${m.content}`),
        ...convMemories.map((m) => `[memory] ${m.content}`),
      ];
      const packed = truncateToBudget(lines.join("\n"), budgets.conversation);
      if (packed.text) {
        sections.push({ label: "CONVERSATION", text: packed.text, tokens: packed.tokens });
        usedTokens += packed.tokens;
      }
    }

    // Documents / chunks
    if (includeDocuments) {
      const docs = byScope(MEMORY_SCOPES.DOCUMENT);
      const lines = [];
      for (const d of docs) {
        const citeIdx = citations.length + 1;
        citations.push({
          index: citeIdx,
          type: d.type,
          sourceId: d.id,
          documentId: d.documentId,
          document: d.documentName || d.metadata?.name,
          chunk: d.metadata?.chunkIndex,
          page: d.pageStart ?? d.metadata?.pageStart,
          line: d.lineStart ?? d.metadata?.lineStart,
          confidence: d.hybridScore || d.semanticScore || 0,
          snippet: d.content.slice(0, 200),
        });
        lines.push(`[#${citeIdx}] ${d.content}`);
      }
      const packed = truncateToBudget(lines.join("\n\n"), budgets.documents);
      if (packed.text) {
        sections.push({ label: "DOCUMENTS", text: packed.text, tokens: packed.tokens });
        usedTokens += packed.tokens;
      }
    }

    // Project memory + files
    if (includeProject && projectId) {
      const projectMems = retrieval.results.filter(
        (r) => r.projectId === projectId || r.scope === MEMORY_SCOPES.PROJECT,
      );
      let fileSnippets = [];
      try {
        const files = await prisma.projectFile.findMany({
          where: { projectId, isFolder: false },
          take: 20,
          orderBy: { updatedAt: "desc" },
        });
        fileSnippets = files.map((f) => `FILE ${f.path}:\n${f.content.slice(0, 800)}`);
      } catch {
        // project files optional
      }
      const packed = truncateToBudget(
        [...projectMems.map((m) => m.content), ...fileSnippets].join("\n\n"),
        budgets.project,
      );
      if (packed.text) {
        sections.push({ label: "PROJECT", text: packed.text, tokens: packed.tokens });
        usedTokens += packed.tokens;
      }
    }

    // Agent memories
    if (includeAgent) {
      const agentMems = retrieval.results.filter(
        (r) => r.scope === MEMORY_SCOPES.AGENT && (!agentType || r.agentType === agentType || r.agentType === "coordinator"),
      );
      const packed = truncateToBudget(
        agentMems.map((m) => `[${m.agentType || "agent"}] ${m.content}`).join("\n"),
        budgets.agent,
      );
      if (packed.text) {
        sections.push({ label: "AGENT_MEMORY", text: packed.text, tokens: packed.tokens });
        usedTokens += packed.tokens;
      }
    }

    // User + workspace
    const userMems = byScope(MEMORY_SCOPES.USER)
      .concat(retrieval.results.filter((r) => r.pinned))
      .slice(0, 15);
    const rankedUser = scoringService.rank(userMems, (m) => m.hybridScore || 0);
    const userPacked = truncateToBudget(
      rankedUser.map((m) => m.content).join("\n"),
      budgets.user,
    );
    if (userPacked.text) {
      sections.push({ label: "USER_MEMORY", text: userPacked.text, tokens: userPacked.tokens });
      usedTokens += userPacked.tokens;
    }

    if (includeWorkspace) {
      const ws = retrieval.results.filter((r) => r.scope === MEMORY_SCOPES.WORKSPACE);
      const packed = truncateToBudget(ws.map((m) => m.content).join("\n"), budgets.workspace);
      if (packed.text) {
        sections.push({ label: "WORKSPACE", text: packed.text, tokens: packed.tokens });
        usedTokens += packed.tokens;
      }
    }

    // Previous executions
    if (projectId) {
      try {
        const execs = await prisma.aiExecution.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 3,
        });
        if (execs.length) {
          const text = execs
            .map((e) => `Execution ${e.status}: ${e.summary || e.currentStage || ""}`)
            .join("\n");
          const packed = truncateToBudget(text, 200);
          sections.push({ label: "PREVIOUS_EXECUTIONS", text: packed.text, tokens: packed.tokens });
          usedTokens += packed.tokens;
        }
      } catch {
        // optional
      }
    }

    if (workflowId) {
      const wf = retrieval.results.filter((r) => r.scope === MEMORY_SCOPES.WORKFLOW);
      const packed = truncateToBudget(wf.map((m) => m.content).join("\n"), 250);
      if (packed.text) {
        sections.push({ label: "WORKFLOW_MEMORY", text: packed.text, tokens: packed.tokens });
        usedTokens += packed.tokens;
      }
    }

    const contextText = sections.map((s) => `### ${s.label}\n${s.text}`).join("\n\n");

    return {
      context: contextText,
      sections,
      citations,
      tokenEstimate: usedTokens,
      tokenBudget,
      retrievalCount: retrieval.count,
    };
  }
}

module.exports = new ContextBuilder();
