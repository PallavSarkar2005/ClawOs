const prisma = require("../database/prisma");
const AI_CONFIG = require("../config/ai.config");
const { AGENT_PROFILES } = require("./constants");
const { allocateBudget, fitToAllocation, estimateTokens } = require("./budget");
const { rankItems } = require("./ranking");
const { compressItems, compressConversation } = require("./compression");
const cache = require("./cache");
const { retrieveAll } = require("./sources");
const persistence = require("./persistence");
const { buildObservability, citationsFromItems } = require("./observability");
const { recordContextBuild } = require("../observability/bridge/context");

function slotForSource(source) {
  if (source === "conversation" || source === "conversation_summary") return "conversation";
  if (source === "skills" || source === "workflows" || source === "settings") return "system";
  if (source === "prior_agents" || source === "tool_outputs") return "tools";
  return "retrieved";
}

function priorityForItem(item, agentType) {
  const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.coordinator;
  const sw = profile.sources?.[item.source] ?? 0.5;
  return (item.score || 0) * 10 + sw * 3 + (item.pinned ? 2 : 0);
}

/**
 * Production Context Engine
 * Retrieval → Ranking → Compression → Token Budget → Packed prompt
 */
class ContextEngine {
  /**
   * Build optimal context for an agent request.
   */
  async build(userId, query, options = {}) {
    const started = Date.now();
    const agentType = options.agentType || "coordinator";
    const reasoningPath = [];

    // Resolve model limit from user settings when available
    let model = options.model || AI_CONFIG.openrouter?.model || "default";
    let settingsMaxTokens = null;
    try {
      const settings = await prisma.setting.findUnique({ where: { userId } });
      if (settings?.defaultModel) model = settings.defaultModel;
      if (settings?.maxTokens) settingsMaxTokens = settings.maxTokens;
    } catch {
      // ignore
    }

    const budget = allocateBudget({
      model,
      modelLimit: options.modelLimit,
      tokenBudget: options.tokenBudget,
      maxPack: options.maxPack || Math.min(8000, (settingsMaxTokens || 4096) * 2),
      split: options.split,
    });
    reasoningPath.push({
      step: "budget",
      detail: `modelLimit=${budget.modelLimit} packBudget=${budget.packBudget}`,
    });

    // Cache key for retrieval layer (not final pack — agent options vary)
    const cacheKey = [
      "ctx",
      userId,
      options.conversationId,
      options.projectId,
      options.documentId,
      agentType,
      String(query || "").slice(0, 120),
    ];
    let retrieval = options.skipCache ? null : cache.get(cacheKey);
    if (!retrieval) {
      reasoningPath.push({ step: "retrieve", detail: "parallel multi-source retrieval" });
      retrieval = await retrieveAll(userId, query, {
        conversationId: options.conversationId,
        projectId: options.projectId,
        documentId: options.documentId,
        agentType,
        skillPrompt: options.skillPrompt,
        skillId: options.skillId,
        workflowPrompt: options.workflowPrompt,
        workflowId: options.workflowId,
        webContext: options.webContext,
        priorOutputs: options.priorOutputs,
        topK: options.topK || 16,
        messageLimit: options.messageLimit,
        fileLimit: options.fileLimit,
      });
      cache.set(cacheKey, retrieval, options.cacheTtlMs || 45_000);
    } else {
      reasoningPath.push({ step: "retrieve", detail: "cache hit" });
    }

    // Ranking
    reasoningPath.push({
      step: "rank",
      detail: `scoring ${retrieval.items.length} items for agent=${agentType}`,
    });
    const ranked = rankItems(retrieval.items, {
      agentType,
      projectId: options.projectId,
    });

    // Compression (progressive)
    const compressLevel = options.compressLevel ?? (ranked.length > 40 ? 4 : ranked.length > 20 ? 3 : 2);
    reasoningPath.push({ step: "compress", detail: `level=${compressLevel}` });
    const compressed = compressItems(ranked, {
      level: compressLevel,
      itemMaxTokens: options.itemMaxTokens || 420,
    });

    // Select top items within retrieved+conversation budget with agent focus
    const selectBudget =
      (budget.allocation.retrieved || 0) +
      (budget.allocation.conversation || 0) +
      (budget.allocation.tools || 0) +
      (budget.allocation.system || 0);

    const selected = [];
    const notSelected = [];
    let running = 0;
    for (const item of compressed.items) {
      const tok = item.tokenCount || estimateTokens(item.content);
      if (running + tok > selectBudget * 1.15 && selected.length >= 6) {
        notSelected.push({
          ...item,
          selected: false,
          dropReason: "below_rank_cutoff",
        });
        continue;
      }
      selected.push({ ...item, selected: true, tokenCount: tok });
      running += tok;
    }

    // Build sections for packing
    const sections = selected.map((item) => ({
      label: `${item.source}/${item.type}`,
      source: item.source,
      type: item.type,
      text: item.content,
      slot: slotForSource(item.source),
      priority: priorityForItem(item, agentType),
      score: item.score,
      reason: item.reason,
      sourceId: item.sourceId,
      metadata: item.metadata,
    }));

    const packed = fitToAllocation(sections, budget.allocation, budget.packBudget);
    reasoningPath.push({
      step: "pack",
      detail: `packed=${packed.sections.length} used=${packed.usedTokens} dropped=${packed.dropped.length}`,
    });

    // Agent focus header
    const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.coordinator;
    const focusHeader = `CONTEXT FOCUS (${agentType}): ${profile.focus}`;

    const text = [
      focusHeader,
      ...packed.sections.map(
        (s) =>
          `===== ${s.label} [score=${(s.score || 0).toFixed(3)} | ${s.tokens} tok] =====\n` +
          `reason: ${s.reason || "ranked"}\n${s.text}`,
      ),
    ].join("\n\n");

    const citations = citationsFromItems(
      packed.sections.map((s) => ({
        source: s.source,
        type: s.type,
        sourceId: s.sourceId,
        content: s.text,
        score: s.score,
        reason: s.reason,
        tokenCount: s.tokens,
        metadata: s.metadata,
        factors: selected.find((x) => x.sourceId === s.sourceId)?.factors,
      })),
    );

    const dropped = [
      ...notSelected.map((d) => ({
        label: `${d.source}/${d.type}`,
        source: d.source,
        reason: d.dropReason || "not_selected",
        score: d.score,
        tokens: d.tokenCount,
      })),
      ...packed.dropped,
    ];

    const scores = ranked.slice(0, 100).map((r) => ({
      itemKey: `${r.source}:${r.sourceId || r.type}`,
      sourceId: r.sourceId,
      similarity: r.factors?.similarity,
      recency: r.factors?.recency,
      importance: r.factors?.importance,
      frequency: r.factors?.frequency,
      confidence: r.factors?.confidence,
      agentRelevance: r.factors?.agentRelevance,
      projectRelevance: r.factors?.projectRelevance,
      pinned: r.factors?.pinned,
      collectionWeight: r.factors?.collectionWeight,
      executionSuccess: r.factors?.executionSuccess,
      finalScore: r.score,
      factors: r.factors,
      score: r.score,
    }));

    const durationMs = Date.now() - started;
    const observability = buildObservability({
      items: ranked,
      selected,
      dropped,
      allocation: budget.allocation,
      usedTokens: packed.usedTokens,
      packBudget: budget.packBudget,
      compression: compressed,
      ranking: ranked,
      graph: retrieval.graph,
      reasoningPath,
      durationMs,
      counts: retrieval.counts,
    });

    // Persist asynchronously-safe (await to return sessionId)
    let session = null;
    if (options.persist !== false) {
      session = await persistence.persistSession({
        userId,
        conversationId: options.conversationId,
        projectId: options.projectId,
        agentExecutionId: options.agentExecutionId,
        agentType,
        query,
        modelLimit: budget.modelLimit,
        tokenBudget: budget.packBudget,
        usedTokens: packed.usedTokens,
        compressionRatio: compressed.ratio,
        allocation: budget.allocation,
        dropped,
        reasoningPath,
        graph: retrieval.graph,
        durationMs,
        items: [
          ...selected,
          ...notSelected.slice(0, 50).map((i) => ({ ...i, selected: false })),
        ],
        scores,
        compressionHistory: compressed.history,
        metrics: [
          { key: "retrieved_count", value: ranked.length },
          { key: "selected_count", value: selected.length },
          { key: "used_tokens", value: packed.usedTokens },
          { key: "compression_ratio", value: compressed.ratio },
          { key: "duration_ms", value: durationMs },
        ],
        summary: (() => {
          const sumItem = selected.find((i) => i.source === "conversation_summary");
          if (!sumItem) return null;
          return {
            kind: "conversation",
            summary: sumItem.content,
            originalTokens: sumItem.metadata?.originalTokens || 0,
            summaryTokens: sumItem.tokenCount,
            sourceIds: [sumItem.sourceId],
          };
        })(),
      });
      if (session) observability.sessionId = session.id;
    }

    const result = {
      text,
      sections: packed.sections,
      usedTokens: packed.usedTokens,
      budget: budget.packBudget,
      allocation: budget.allocation,
      modelLimit: budget.modelLimit,
      citations,
      dropped,
      compressionRatio: compressed.ratio,
      reasoningPath,
      observability,
      sessionId: session?.id || null,
      graph: retrieval.graph,
      agentType,
      durationMs,
    };
    try {
      recordContextBuild(result, {
        userId,
        query,
        executionId: options.agentExecutionId,
        projectId: options.projectId,
        conversationId: options.conversationId,
        traceId: options.traceId,
      });
    } catch {
      /* never block context build */
    }
    return result;
  }

  /** Preview without side-effect heavy persistence (still can persist if asked). */
  async preview(userId, query, options = {}) {
    return this.build(userId, query, { ...options, persist: options.persist !== false });
  }

  async inspect(sessionId, userId) {
    return persistence.getSession(sessionId, userId);
  }

  async replay(sessionId, userId) {
    return persistence.replaySession(sessionId, userId);
  }

  async list(userId, opts) {
    return persistence.listSessions(userId, opts);
  }

  async rank(userId, query, options = {}) {
    const retrieval = await retrieveAll(userId, query, options);
    return rankItems(retrieval.items, {
      agentType: options.agentType || "coordinator",
      projectId: options.projectId,
    });
  }

  async compress(payload = {}) {
    if (Array.isArray(payload.items)) {
      return compressItems(payload.items, payload);
    }
    if (payload.messages) {
      return compressConversation(payload.messages, payload.maxTokens || 500);
    }
    if (payload.text) {
      const { summarizeText } = require("./compression");
      return summarizeText(payload.text, payload.maxTokens || 500);
    }
    return { items: [], ratio: 1, history: [] };
  }

  allocate(options = {}) {
    return allocateBudget(options);
  }

  invalidateCache(scope) {
    cache.invalidate(scope || {});
  }

  cacheStats() {
    return cache.stats();
  }
}

module.exports = new ContextEngine();
module.exports.ContextEngine = ContextEngine;
