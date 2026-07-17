const { getTraceDetail } = require("./search");

/**
 * Unified execution timeline from persisted specialty traces + timeline events.
 */
async function buildTimeline(traceId, userId) {
  const detail = await getTraceDetail(traceId, userId);
  if (!detail) return null;

  const events = [];

  if (Array.isArray(detail.timeline)) {
    for (const ev of detail.timeline) {
      events.push({
        source: "timeline",
        type: ev.type,
        at: ev.at,
        label: ev.label || ev.type,
        data: ev,
      });
    }
  }

  for (const p of detail.promptTraces) {
    events.push({
      source: "prompt",
      type: "llm",
      at: p.createdAt,
      label: `${p.provider || "llm"}/${p.model || "model"}`,
      data: {
        promptTokens: p.promptTokens,
        completionTokens: p.completionTokens,
        latencyMs: p.latencyMs,
        status: p.status,
      },
    });
  }

  for (const a of detail.agentTraces) {
    events.push({
      source: "agent",
      type: "agent",
      at: a.createdAt,
      label: a.agentType,
      data: {
        status: a.status,
        durationMs: a.durationMs,
        orderIndex: a.orderIndex,
        retries: a.retries,
      },
    });
  }

  for (const t of detail.toolTraces) {
    events.push({
      source: "tool",
      type: "tool_call",
      at: t.createdAt,
      label: t.toolName,
      data: {
        status: t.status,
        durationMs: t.durationMs,
        category: t.category,
        retries: t.retries,
      },
    });
  }

  for (const c of detail.contextTraces) {
    events.push({
      source: "context",
      type: "context_retrieval",
      at: c.createdAt,
      label: "context",
      data: {
        usedTokens: c.usedTokens,
        durationMs: c.durationMs,
        sessionId: c.contextSessionId,
      },
    });
  }

  for (const k of detail.knowledgeTraces) {
    events.push({
      source: "knowledge",
      type: "knowledge_retrieval",
      at: k.createdAt,
      label: "knowledge",
      data: {
        resultCount: k.resultCount,
        searchLatencyMs: k.searchLatencyMs,
        embeddingModel: k.embeddingModel,
      },
    });
  }

  for (const r of detail.repositoryTraces) {
    events.push({
      source: "repository",
      type: "workspace_analysis",
      at: r.createdAt,
      label: r.stage || "repository",
      data: {
        filesProcessed: r.filesProcessed,
        symbolsIndexed: r.symbolsIndexed,
        durationMs: r.durationMs,
        status: r.status,
      },
    });
  }

  for (const w of detail.workflowTraces) {
    const tl = Array.isArray(w.executionTimeline) ? w.executionTimeline : [];
    for (const nodeEv of tl) {
      events.push({
        source: "workflow",
        type: "workflow",
        at: nodeEv.at || w.createdAt,
        label: nodeEv.nodeKey || nodeEv.event || "workflow",
        data: nodeEv,
      });
    }
  }

  for (const s of detail.spans) {
    events.push({
      source: "span",
      type: s.kind,
      at: s.startTime,
      label: s.name,
      data: {
        spanId: s.spanId,
        status: s.status,
        durationMs: s.durationMs,
        endTime: s.endTime,
      },
    });
  }

  events.sort((a, b) => new Date(a.at) - new Date(b.at));

  return {
    traceId: detail.traceId,
    status: detail.status,
    durationMs: detail.durationMs,
    startTime: detail.startTime,
    endTime: detail.endTime,
    events,
    counts: {
      total: events.length,
      agents: detail.agentTraces.length,
      tools: detail.toolTraces.length,
      prompts: detail.promptTraces.length,
      context: detail.contextTraces.length,
      knowledge: detail.knowledgeTraces.length,
      repository: detail.repositoryTraces.length,
      spans: detail.spans.length,
    },
  };
}

module.exports = { buildTimeline };
