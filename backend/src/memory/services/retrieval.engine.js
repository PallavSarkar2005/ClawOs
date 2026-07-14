const embeddingService = require("./embedding.service");
const scoringService = require("./scoring.service");
const memoryRepository = require("../repositories/memory.repository");
const documentRepository = require("../repositories/document.repository");
const { cosineSimilarity, keywordScore, contentHash } = require("../utils");

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

/** Maximal Marginal Relevance */
function mmrSelect(candidates, queryVec, { lambda = 0.7, topK = 8 } = {}) {
  const selected = [];
  const remaining = [...candidates];

  while (selected.length < topK && remaining.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const c = remaining[i];
      const rel = c.semanticScore ?? cosineSimilarity(queryVec, c.embedding || []);
      let maxSim = 0;
      for (const s of selected) {
        const sim = cosineSimilarity(c.embedding || [], s.embedding || []);
        if (sim > maxSim) maxSim = sim;
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

class RetrievalEngine {
  async semanticSearch(userId, query, opts = {}) {
    const {
      topK = 10,
      threshold = 0.15,
      scope,
      projectId,
      documentIds,
      includeMemories = true,
      includeChunks = true,
    } = opts;

    const queryEmbedding = await embeddingService.embedOne(query, { userId });
    const results = [];

    if (includeMemories) {
      const memories = await memoryRepository.findForEmbedding(userId, {
        scope,
        projectId,
        limit: opts.memoryLimit || 400,
      });
      for (const m of memories) {
        const emb = Array.isArray(m.embedding) ? m.embedding : null;
        if (!emb) continue;
        const semanticScore = cosineSimilarity(queryEmbedding, emb);
        if (semanticScore < threshold) continue;
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
          embedding: emb,
          semanticScore,
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
      const chunks = await documentRepository.findChunksForSearch(userId, {
        documentIds,
        limit: opts.chunkLimit || 1500,
      });
      for (const c of chunks) {
        const emb = Array.isArray(c.embedding) ? c.embedding : null;
        if (!emb) continue;
        const semanticScore = cosineSimilarity(queryEmbedding, emb);
        if (semanticScore < threshold) continue;
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
          embedding: emb,
          semanticScore,
          keywordScore: keywordScore(c.content, query),
          documentId: c.documentId,
          documentName: c.document?.name,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          lineStart: c.lineStart,
          lineEnd: c.lineEnd,
          tokenCount: c.tokenCount,
        });
      }
    }

    return { results, queryEmbedding };
  }

  async keywordSearch(userId, query, opts = {}) {
    const { topK = 20, scope, projectId } = opts;
    const memResult = await memoryRepository.list(userId, {
      q: query,
      scope,
      projectId,
      take: topK,
    });

    const docs = await documentRepository.list(userId, { q: query, take: topK });
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
      ...docs.items.map((d) => ({
        type: "document",
        id: d.id,
        content: `${d.name}`,
        scope: "DOCUMENT",
        keywordScore: keywordScore(d.name, query),
        semanticScore: 0,
        documentId: d.id,
        documentName: d.name,
        metadata: d.metadata,
      })),
    ];

    return results.sort((a, b) => b.keywordScore - a.keywordScore).slice(0, topK);
  }

  async hybridSearch(userId, query, opts = {}) {
    const {
      topK = 10,
      threshold = 0.12,
      alpha = 0.65,
      useMmr = true,
      mmrLambda = 0.7,
    } = opts;

    const { results, queryEmbedding } = await this.semanticSearch(userId, query, {
      ...opts,
      topK: Math.max(topK * 4, 40),
      threshold,
    });

    const keywordHits = await this.keywordSearch(userId, query, { ...opts, topK: topK * 3 });
    const keywordMap = new Map(keywordHits.map((h) => [`${h.type}:${h.id}`, h.keywordScore]));

    let fused = results.map((r) => {
      const kw = Math.max(r.keywordScore || 0, keywordMap.get(`${r.type}:${r.id}`) || 0);
      const hybridScore = alpha * (r.semanticScore || 0) + (1 - alpha) * kw;
      return { ...r, keywordScore: kw, hybridScore };
    });

    // add pure keyword hits missing from semantic
    for (const h of keywordHits) {
      const key = `${h.type}:${h.id}`;
      if (!fused.find((f) => `${f.type}:${f.id}` === key) && h.keywordScore > 0.2) {
        fused.push({ ...h, hybridScore: (1 - alpha) * h.keywordScore });
      }
    }

    fused = dedupeByContent(fused);
    fused.sort((a, b) => b.hybridScore - a.hybridScore);

    const ranked = scoringService.rank(fused, (item) => item.hybridScore);

    let selected = ranked;
    if (useMmr) {
      selected = mmrSelect(ranked, queryEmbedding, { lambda: mmrLambda, topK });
    } else {
      selected = ranked.slice(0, topK);
    }

    const ids = selected.filter((s) => s.type === "memory").map((s) => s.id);
    if (ids.length) await memoryRepository.touch(ids);

    return {
      query,
      count: selected.length,
      results: selected.map((s) => ({
        ...s,
        embedding: undefined,
        confidence: s.scoring?.confidence ?? s.confidence ?? s.hybridScore,
      })),
    };
  }
}

module.exports = new RetrievalEngine();
module.exports.mmrSelect = mmrSelect;
module.exports.dedupeByContent = dedupeByContent;
