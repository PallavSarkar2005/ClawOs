const knowledgeRetrieval = require("../retrieval/engine");
const prisma = require("../../database/prisma");
const citationEngine = require("../../memory/services/citation.engine");

const QUERY_PATTERNS = [
  { pattern: /bugs?\s+fixed\s+last\s+month/i, filters: { sourceType: "memory", tags: ["bug", "fix"], timeRange: "30d" } },
  { pattern: /react\s+login/i, filters: { keywords: ["react", "login", "auth"] } },
  { pattern: /authentication/i, filters: { keywords: ["authentication", "auth", "login", "jwt"] } },
  { pattern: /previous\s+implementations?/i, filters: { sourceType: "execution" } },
];

function parseNaturalQuery(query) {
  const parsed = { original: query, filters: {}, expanded: query };

  for (const { pattern, filters } of QUERY_PATTERNS) {
    if (pattern.test(query)) {
      parsed.filters = { ...parsed.filters, ...filters };
      break;
    }
  }

  if (/last\s+month/i.test(query)) {
    parsed.filters.timeRange = "30d";
    parsed.filters.since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  }
  if (/last\s+week/i.test(query)) {
    parsed.filters.timeRange = "7d";
    parsed.filters.since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  return parsed;
}

class KnowledgeSearchEngine {
  async search(userId, query, opts = {}) {
    const start = Date.now();
    const parsed = parseNaturalQuery(query);
    const mode = opts.mode || "hybrid";

    const searchOpts = {
      ...opts,
      topK: opts.topK || 15,
      persist: true,
    };

    if (parsed.filters.keywords?.length) {
      searchOpts.queryExpansion = parsed.filters.keywords.join(" ");
    }

    const effectiveQuery = parsed.filters.keywords?.length
      ? `${query} ${parsed.filters.keywords.join(" ")}`
      : query;

    let result;
    switch (mode) {
      case "semantic":
        result = await knowledgeRetrieval.semanticSearch(userId, effectiveQuery, searchOpts);
        break;
      case "keyword":
        result = { results: await knowledgeRetrieval.keywordSearch(userId, effectiveQuery, searchOpts) };
        break;
      default:
        result = await knowledgeRetrieval.hybridSearch(userId, effectiveQuery, searchOpts);
    }

    let results = result.results || [];

    if (parsed.filters.since) {
      results = results.filter((r) => {
        const d = r.createdAt || r.updatedAt;
        return d && new Date(d) >= parsed.filters.since;
      });
    }

    if (parsed.filters.sourceType) {
      results = results.filter(
        (r) => r.sourceType === parsed.filters.sourceType || r.type === parsed.filters.sourceType,
      );
    }

    const citations = citationEngine.fromRetrievalResults(results);

    if (result.retrievalId) {
      for (const c of citations) {
        await prisma.citation.create({
          data: {
            retrievalId: result.retrievalId,
            sourceType: c.source || c.type || "unknown",
            sourceId: c.memoryId || c.chunkId || c.documentId,
            content: c.snippet || "",
            confidence: c.confidence || 0,
            similarity: c.confidence || 0,
            page: c.page,
            chunkIndex: c.chunk,
            documentName: c.document,
            metadata: { jump: c.jump },
          },
        });
      }
    }

    return {
      query,
      parsed,
      mode,
      count: results.length,
      latencyMs: result.latencyMs || Date.now() - start,
      indexUsed: result.indexUsed,
      embeddingModel: result.embeddingModel,
      retrievalId: result.retrievalId,
      results,
      citations,
    };
  }

  async history(userId, { take = 50 } = {}) {
    return prisma.searchHistory.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(take, 200),
    });
  }
}

module.exports = new KnowledgeSearchEngine();
