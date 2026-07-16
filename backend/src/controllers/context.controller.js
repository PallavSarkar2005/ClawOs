/**
 * Context Engine API — preview, inspect, ranking, compression, budget, replay.
 */

const { contextEngine } = require("../context");
const persistence = require("../context/persistence");

function handleError(res, err) {
  console.error("[context.api]", err?.message || err);
  const status = err.status || 500;
  return res.status(status).json({ message: err.message || "Internal server error" });
}

async function preview(req, res) {
  try {
    const {
      query,
      prompt,
      conversationId,
      projectId,
      documentId,
      agentType,
      tokenBudget,
      modelLimit,
      skillPrompt,
      workflowPrompt,
      webContext,
      persist,
      topK,
      compressLevel,
    } = req.body || {};

    const q = query || prompt;
    if (!q || !String(q).trim()) {
      return res.status(400).json({ message: "query is required" });
    }

    const result = await contextEngine.preview(req.user.id, String(q), {
      conversationId,
      projectId,
      documentId,
      agentType: agentType || "coordinator",
      tokenBudget,
      modelLimit,
      skillPrompt,
      workflowPrompt,
      webContext,
      persist: persist !== false,
      topK,
      compressLevel,
    });

    return res.json({
      sessionId: result.sessionId,
      text: result.text,
      sections: result.sections,
      usedTokens: result.usedTokens,
      budget: result.budget,
      allocation: result.allocation,
      modelLimit: result.modelLimit,
      citations: result.citations,
      dropped: result.dropped,
      compressionRatio: result.compressionRatio,
      reasoningPath: result.reasoningPath,
      observability: result.observability,
      graph: result.graph,
      agentType: result.agentType,
      durationMs: result.durationMs,
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function inspect(req, res) {
  try {
    const session = await contextEngine.inspect(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ message: "Context session not found" });
    return res.json(session);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listSessions(req, res) {
  try {
    const sessions = await persistence.listSessions(req.user.id, {
      conversationId: req.query.conversationId,
      projectId: req.query.projectId,
      agentExecutionId: req.query.agentExecutionId,
      limit: req.query.limit,
    });
    return res.json({ sessions, count: sessions.length });
  } catch (err) {
    return handleError(res, err);
  }
}

async function rank(req, res) {
  try {
    const { query, agentType, projectId, conversationId, documentId, topK } = req.body || {};
    if (!query) return res.status(400).json({ message: "query is required" });
    const ranked = await contextEngine.rank(req.user.id, query, {
      agentType,
      projectId,
      conversationId,
      documentId,
      topK,
    });
    return res.json({
      count: ranked.length,
      items: ranked.slice(0, 50).map((r) => ({
        source: r.source,
        type: r.type,
        sourceId: r.sourceId,
        score: r.score,
        reason: r.reason,
        factors: r.factors,
        tokenCount: r.tokenCount,
        snippet: String(r.content || "").slice(0, 240),
      })),
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function compress(req, res) {
  try {
    const result = await contextEngine.compress(req.body || {});
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function allocation(req, res) {
  try {
    const result = contextEngine.allocate(req.body || {});
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function debugRetrieval(req, res) {
  try {
    const { query, agentType, projectId, conversationId, documentId } = req.body || {};
    if (!query) return res.status(400).json({ message: "query is required" });
    const { retrieveAll } = require("../context/sources");
    const retrieval = await retrieveAll(req.user.id, query, {
      agentType,
      projectId,
      conversationId,
      documentId,
    });
    return res.json({
      counts: retrieval.counts,
      graph: retrieval.graph,
      items: retrieval.items.slice(0, 80).map((i) => ({
        source: i.source,
        type: i.type,
        sourceId: i.sourceId,
        similarity: i.similarity,
        importance: i.importance,
        reason: i.reason,
        tokenCount: i.tokenCount,
        snippet: String(i.content || "").slice(0, 200),
      })),
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function replay(req, res) {
  try {
    const result = await contextEngine.replay(req.params.id, req.user.id);
    if (!result) return res.status(404).json({ message: "Context session not found" });
    return res.json(result);
  } catch (err) {
    return handleError(res, err);
  }
}

async function cacheStats(req, res) {
  try {
    return res.json(contextEngine.cacheStats());
  } catch (err) {
    return handleError(res, err);
  }
}

async function invalidateCache(req, res) {
  try {
    contextEngine.invalidateCache({
      userId: req.user.id,
      projectId: req.body?.projectId,
      conversationId: req.body?.conversationId,
    });
    return res.json({ ok: true });
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  preview,
  inspect,
  listSessions,
  rank,
  compress,
  allocation,
  debugRetrieval,
  replay,
  cacheStats,
  invalidateCache,
};
