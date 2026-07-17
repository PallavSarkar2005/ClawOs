const prisma = require("../../database/prisma");
const vectorStore = require("../vector/store");
const embeddingService = require("../../memory/services/embedding.service");
const { resolveConfig } = require("../../memory/services/embedding.service");
const scoringService = require("../../memory/services/scoring.service");
const memoryRepository = require("../../memory/repositories/memory.repository");
const { cosineSimilarity, keywordScore, contentHash } = require("../../memory/utils");
const { distanceToSimilarity, indexForCount } = require("../vector/format");
const { recordRetrieval } = require("../../observability/bridge/knowledge");

function dedupeByContent(items, keyFn = (i) => i.content) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = contentHash(String(keyFn(item) || "").slice(0, 500));
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mmrSelect(candidates, queryVec, { lambda = 0.7, topK = 8, vectors = new Map() } = {}) {
  const selected = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const c = remaining[i];
      const rel = c.semanticScore ?? 0;
      let maxSim = 0;
      const cVec = vectors.get(c.id);
      for (const s of selected) {
        const sVec = vectors.get(s.id);
        if (cVec && sVec) {
          const sim = cosineSimilarity(cVec, sVec);
          if (sim > maxSim) maxSim = sim;
        }
      }
      const score = lambda * rel - (1 - lambda) * maxSim;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
    selected.push(remaining.splice(bestIdx, 1)[0]);
  }
  return selected;
}

function crossEncoderRerank(candidates, query) {
  const qWords = new Set(
    String(query || "")
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 2),
  );
  return candidates
    .map((c) => {
      const content = String(c.content || "").toLowerCase();
      let overlap = 0;
      for (const w of qWords) {
        if (content.includes(w)) overlap += 1;
      }
      const lexical = qWords.size ? overlap / qWords.size : 0;
      const rerank = 0.75 * (c.semanticScore || 0) + 0.25 * lexical + (c.pinned ? 0.05 : 0);
      return { ...c, rerankScore: rerank };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}

class KnowledgeRetrievalEngine {
  async semanticSearch(userId, query, opts = {}) {
    const start = Date.now();
    const {
      topK = 10,
      threshold = 0.15,
      scope,
      projectId,
      documentIds,
      includeMemories = true,
      includeChunks = true,
      metric = "cosine",
      agentType,
      workspaceId,
      collectionId,
      pinned,
    } = opts;

    const queryEmbedding = await embeddingService.embedOne(query, { userId });
    const results = [];
    let indexUsed = "hnsw";

    const counts = await vectorStore.countVectors(userId);
    indexUsed = indexForCount(counts.total, metric);

    if (includeMemories) {
      const memories = await vectorStore.searchMemories(userId, queryEmbedding, {
        topK: opts.memoryLimit || topK * 5,
        threshold,
        scope,
        projectId,
        pinned,
        metric,
      });

      for (const m of memories) {
        if (agentType && m.agentType && m.agentType !== agentType) continue;
        results.push({
          type: "memory",
          id: m.id,
          content: m.content,
          scope: m.scope,
          metadata: m.metadata,
          tags: m.tags,
          importance: m.importance,
          pinned: m.pinned,
          source: m.source,
          semanticScore: m.semanticScore,
          distance: m.distance,
          keywordScore: keywordScore(m.content, query),
          documentId: m.documentId,
          projectId: m.projectId,
          agentType: m.agentType,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          lastAccessed: m.lastAccessed,
          frequency: m.frequency,
          confidence: m.confidence,
          decay: m.decay,
        });
      }
    }

    if (includeChunks) {
      const chunks = await vectorStore.searchChunks(userId, queryEmbedding, {
        topK: opts.chunkLimit || topK * 5,
        threshold,
        documentIds,
        metric,
      });

      for (const c of chunks) {
        results.push({
          type: "chunk",
          id: c.id,
          content: c.content,
          scope: "DOCUMENT",
          metadata: {
            ...(c.metadata || {}),
            heading: c.heading,
            chunkIndex: c.chunkIndex,
            chunkType: c.chunkType,
          },
          semanticScore: c.semanticScore,
          distance: c.distance,
          keywordScore: keywordScore(c.content, query),
          documentId: c.documentId,
          documentName: c.documentName,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          lineStart: c.lineStart,
          lineEnd: c.lineEnd,
          tokenCount: c.tokenCount,
        });
      }
    }

    return {
      results,
      queryEmbedding,
      latencyMs: Date.now() - start,
      indexUsed,
      metric,
    };
  }

  async keywordSearch(userId, query, opts = {}) {
    const { topK = 20, scope, projectId } = opts;
    const memResult = await memoryRepository.list(userId, {
      q: query,
      scope,
      projectId,
      take: topK,
    });

    const nodes = await prisma.knowledgeNode.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
        OR: [
          { content: { contains: query, mode: "insensitive" } },
          { tags: { has: query } },
        ],
      },
      take: topK,
    });

    const results = [
      ...memResult.items.map((m) => ({
        type: "memory",
        id: m.id,
        content: m.content,
        scope: m.scope,
        keywordScore: keywordScore(m.content, query),
        semanticScore: 0,
        metadata: m.metadata,
        tags: m.tags,
        importance: m.importance,
        pinned: m.pinned,
        source: m.source,
        frequency: m.frequency,
        confidence: m.confidence,
        decay: m.decay,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
        lastAccessed: m.lastAccessed,
      })),
      ...nodes.map((n) => ({
        type: "knowledge",
        id: n.id,
        content: n.content,
        scope: n.scope,
        keywordScore: keywordScore(n.content, query),
        semanticScore: 0,
        sourceType: n.sourceType,
        metadata: n.metadata,
        tags: n.tags,
        importance: n.importance,
        pinned: n.pinned,
      })),
    ];

    return results.sort((a, b) => b.keywordScore - a.keywordScore).slice(0, topK);
  }

  async hybridSearch(userId, query, opts = {}) {
    const start = Date.now();
    const {
      topK = 10,
      threshold = 0.12,
      alpha = 0.65,
      useMmr = true,
      mmrLambda = 0.7,
      rerank = true,
      persist = true,
    } = opts;

    const semantic = await this.semanticSearch(userId, query, {
      ...opts,
      topK: Math.max(topK * 4, 40),
      threshold,
    });

    const keywordHits = await this.keywordSearch(userId, query, { ...opts, topK: topK * 3 });
    const keywordMap = new Map(keywordHits.map((h) => [`${h.type}:${h.id}`, h.keywordScore]));

    let fused = semantic.results.map((r) => {
      const kw = Math.max(r.keywordScore || 0, keywordMap.get(`${r.type}:${r.id}`) || 0);
      const hybridScore = alpha * (r.semanticScore || 0) + (1 - alpha) * kw;
      return { ...r, keywordScore: kw, hybridScore };
    });

    for (const h of keywordHits) {
      const key = `${h.type}:${h.id}`;
      if (!fused.find((f) => `${f.type}:${f.id}` === key) && h.keywordScore > 0.2) {
        fused.push({ ...h, hybridScore: (1 - alpha) * h.keywordScore });
      }
    }

    fused = dedupeByContent(fused);
    fused.sort((a, b) => b.hybridScore - a.hybridScore);

    let ranked = scoringService.rank(fused, (item) => item.hybridScore);

    if (rerank) {
      ranked = crossEncoderRerank(ranked, query);
      ranked = ranked.map((r, i) => ({ ...r, hybridScore: r.rerankScore ?? r.hybridScore, rank: i + 1 }));
    }

    let selected = ranked;
    if (useMmr) {
      const vecMap = new Map();
      vecMap.set("query", semantic.queryEmbedding);
      selected = mmrSelect(ranked, semantic.queryEmbedding, { lambda: mmrLambda, topK, vectors: vecMap });
    } else {
      selected = ranked.slice(0, topK);
    }

    const ids = selected.filter((s) => s.type === "memory").map((s) => s.id);
    if (ids.length) await memoryRepository.touch(ids);

    const latencyMs = Date.now() - start;
    const cfg = await resolveConfig(userId);

    let retrievalId = null;
    if (persist) {
      const retrieval = await prisma.retrieval.create({
        data: {
          ownerId: userId,
          query,
          mode: "hybrid",
          topK,
          threshold,
          resultCount: selected.length,
          latencyMs,
          indexUsed: semantic.indexUsed,
          embeddingModel: cfg.model,
          distanceMetric: semantic.metric || "cosine",
          filters: {
            scope: opts.scope,
            projectId: opts.projectId,
            documentIds: opts.documentIds,
            agentType: opts.agentType,
          },
          results: selected.map((s) => ({
            type: s.type,
            id: s.id,
            score: s.hybridScore,
            semanticScore: s.semanticScore,
            keywordScore: s.keywordScore,
          })),
        },
      });
      retrievalId = retrieval.id;

      await prisma.searchHistory.create({
        data: {
          ownerId: userId,
          query,
          mode: "hybrid",
          resultCount: selected.length,
          latencyMs,
          filters: { scope: opts.scope, projectId: opts.projectId },
        },
      });
    }

    const out = {
      query,
      count: selected.length,
      latencyMs,
      indexUsed: semantic.indexUsed,
      embeddingModel: cfg.model,
      retrievalId,
      results: selected.map((s) => ({
        ...s,
        confidence: s.scoring?.confidence ?? s.confidence ?? s.hybridScore,
        similarity: s.semanticScore,
      })),
    };
    try {
      recordRetrieval(out, {
        userId,
        query,
        projectId: opts.projectId,
        executionId: opts.executionId || opts.agentExecutionId,
        traceId: opts.traceId,
        topK,
        mode: "hybrid",
        embeddingModel: cfg.model,
        latencyMs,
      });
    } catch {
      /* ignore */
    }
    return out;
  }
}

module.exports = new KnowledgeRetrievalEngine();
module.exports.mmrSelect = mmrSelect;
module.exports.dedupeByContent = dedupeByContent;
module.exports.crossEncoderRerank = crossEncoderRerank;
