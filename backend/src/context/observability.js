/**
 * Context observability helpers — shape inspectable payloads for API/SSE/UI.
 */

function buildObservability({
  sessionId,
  items,
  selected,
  dropped,
  allocation,
  usedTokens,
  packBudget,
  compression,
  ranking,
  graph,
  reasoningPath,
  durationMs,
  counts,
}) {
  const bySource = {};
  for (const item of selected || []) {
    bySource[item.source] = (bySource[item.source] || 0) + 1;
  }

  return {
    sessionId,
    durationMs,
    tokenAllocation: allocation,
    usedTokens,
    packBudget,
    compressionRatio: compression?.ratio ?? 1,
    compressionHistory: compression?.history || [],
    retrievedCount: items?.length || 0,
    selectedCount: selected?.length || 0,
    droppedCount: dropped?.length || 0,
    bySource,
    sourceCounts: counts || {},
    ranking: {
      topScores: (ranking || []).slice(0, 15).map((r) => ({
        source: r.source,
        type: r.type,
        score: r.score,
        reason: r.reason,
        factors: r.factors,
      })),
    },
    retrieved: {
      memories: (selected || []).filter((i) =>
        ["semantic_memory", "long_term_memory", "short_term_memory", "pinned", "user_profile"].includes(
          i.source,
        ),
      ),
      files: (selected || []).filter((i) =>
        ["project_files", "repository", "git_history"].includes(i.source),
      ),
      documents: (selected || []).filter((i) => i.source === "documents"),
      executions: (selected || []).filter((i) =>
        ["execution_history", "tool_outputs", "prior_agents"].includes(i.source),
      ),
    },
    dropped: dropped || [],
    reasoningPath: reasoningPath || [],
    graph: graph || {},
  };
}

function citationsFromItems(items) {
  return (items || []).map((item, i) => ({
    index: i + 1,
    source: item.source,
    type: item.type,
    sourceId: item.sourceId,
    documentId: item.documentId || item.metadata?.documentId,
    document: item.metadata?.documentName || item.metadata?.path,
    score: item.score,
    reason: item.reason,
    tokenCount: item.tokenCount,
    timestamp: item.timestamp || item.createdAt || null,
    snippet: String(item.content || "").slice(0, 220),
    traceability: {
      factors: item.factors || {},
      selected: item.selected !== false,
    },
  }));
}

module.exports = {
  buildObservability,
  citationsFromItems,
};
