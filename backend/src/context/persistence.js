const prisma = require("../database/prisma");

async function persistSession(payload) {
  const {
    userId,
    conversationId,
    projectId,
    agentExecutionId,
    agentType,
    query,
    modelLimit,
    tokenBudget,
    usedTokens,
    compressionRatio,
    allocation,
    dropped,
    reasoningPath,
    graph,
    durationMs,
    items = [],
    scores = [],
    compressionHistory = [],
    metrics = [],
    summary = null,
  } = payload;

  try {
    const session = await prisma.contextSession.create({
      data: {
        userId,
        conversationId: conversationId || null,
        projectId: projectId || null,
        agentExecutionId: agentExecutionId || null,
        agentType: agentType || null,
        query: String(query || "").slice(0, 4000),
        modelLimit: modelLimit || 128000,
        tokenBudget: tokenBudget || 6000,
        usedTokens: usedTokens || 0,
        compressionRatio: compressionRatio ?? 1,
        allocation: allocation || {},
        dropped: dropped || [],
        reasoningPath: reasoningPath || [],
        graph: graph || {},
        status: "built",
        durationMs: durationMs || null,
        retrieved: {
          create: items.slice(0, 200).map((item) => ({
            source: item.source || "unknown",
            type: item.type || "unknown",
            sourceId: item.sourceId ? String(item.sourceId) : null,
            content: String(item.content || "").slice(0, 12000),
            score: item.score || 0,
            reason: item.reason || null,
            tokenCount: item.tokenCount || 0,
            selected: item.selected !== false,
            metadata: item.metadata || {},
            timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
          })),
        },
        scores: {
          create: scores.slice(0, 200).map((s) => ({
            itemKey: s.itemKey || s.sourceId || "item",
            similarity: s.similarity || 0,
            recency: s.recency || 0,
            importance: s.importance || 0,
            frequency: s.frequency || 0,
            confidence: s.confidence || 0,
            agentRelevance: s.agentRelevance || 0,
            projectRelevance: s.projectRelevance || 0,
            pinned: s.pinned || 0,
            collectionWeight: s.collectionWeight || 0,
            executionSuccess: s.executionSuccess || 0,
            finalScore: s.finalScore || s.score || 0,
            factors: s.factors || {},
          })),
        },
        compressions: {
          create: (compressionHistory || []).map((h) => ({
            method: h.method || "unknown",
            inputTokens: h.inputTokens || h.removed || 0,
            outputTokens: h.outputTokens || h.mergeCount || 0,
            ratio: h.ratio || 1,
            details: h,
          })),
        },
        metrics: {
          create: (metrics || []).map((m) => ({
            key: m.key,
            value: Number(m.value) || 0,
            unit: m.unit || null,
            metadata: m.metadata || {},
          })),
        },
      },
      include: {
        retrieved: { take: 50 },
        scores: { take: 50 },
        compressions: true,
        metrics: true,
      },
    });

    if (summary?.summary) {
      await prisma.contextSummary.create({
        data: {
          sessionId: session.id,
          userId,
          conversationId: conversationId || null,
          projectId: projectId || null,
          kind: summary.kind || "conversation",
          originalTokens: summary.originalTokens || 0,
          summaryTokens: summary.summaryTokens || 0,
          summary: summary.summary,
          sourceIds: summary.sourceIds || [],
          metadata: summary.metadata || {},
        },
      });
    }

    return session;
  } catch (err) {
    // Persistence must not break context building
    console.error("[context.persistence]", err.message);
    return null;
  }
}

async function getSession(id, userId) {
  return prisma.contextSession.findFirst({
    where: { id, ...(userId ? { userId } : {}) },
    include: {
      retrieved: { orderBy: { score: "desc" } },
      scores: { orderBy: { finalScore: "desc" } },
      summaries: true,
      compressions: true,
      metrics: true,
    },
  });
}

async function listSessions(userId, opts = {}) {
  return prisma.contextSession.findMany({
    where: {
      userId,
      ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      ...(opts.agentExecutionId ? { agentExecutionId: opts.agentExecutionId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(opts.limit) || 30, 100),
    include: {
      retrieved: { where: { selected: true }, take: 10, orderBy: { score: "desc" } },
      metrics: true,
    },
  });
}

async function replaySession(id, userId) {
  const session = await getSession(id, userId);
  if (!session) return null;

  const selected = session.retrieved.filter((r) => r.selected);
  const text = selected
    .map((r) => `===== ${r.source}/${r.type} (score=${r.score.toFixed(3)}, ${r.tokenCount} tok) =====\n${r.content}`)
    .join("\n\n");

  return {
    session,
    text,
    usedTokens: session.usedTokens,
    allocation: session.allocation,
    dropped: session.dropped,
    reasoningPath: session.reasoningPath,
    citations: selected.map((r, i) => ({
      index: i + 1,
      source: r.source,
      type: r.type,
      sourceId: r.sourceId,
      score: r.score,
      reason: r.reason,
      tokenCount: r.tokenCount,
      timestamp: r.timestamp,
    })),
  };
}

module.exports = {
  persistSession,
  getSession,
  listSessions,
  replaySession,
};
