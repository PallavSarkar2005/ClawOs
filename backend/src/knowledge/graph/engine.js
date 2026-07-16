const prisma = require("../../database/prisma");
const { contentHash, estimateTokens, clamp } = require("../../memory/utils");
const scoringService = require("../../memory/services/scoring.service");

const EDGE_TYPES = Object.freeze({
  REFERENCES: "references",
  IMPORTS: "imports",
  CALLS: "calls",
  DEPENDS_ON: "depends_on",
  MENTIONS: "mentions",
  RELATED: "related",
  PARENT: "parent",
  DERIVED_FROM: "derived_from",
});

const NODE_TYPES = Object.freeze({
  DOCUMENT: "document",
  FILE: "file",
  FUNCTION: "function",
  CLASS: "class",
  CONVERSATION: "conversation",
  MEMORY: "memory",
  AGENT: "agent",
  PROJECT: "project",
  EXECUTION: "execution",
  SKILL: "skill",
  WORKFLOW: "workflow",
  CHUNK: "chunk",
});

class KnowledgeGraphEngine {
  async upsertNode(ownerId, payload) {
    const hash = contentHash(payload.content);
    const existing = payload.sourceId
      ? await prisma.knowledgeNode.findFirst({
          where: { ownerId, sourceType: payload.sourceType, sourceId: payload.sourceId, deletedAt: null },
        })
      : null;

    const data = {
      content: payload.content,
      contentHash: hash,
      sourceType: payload.sourceType,
      sourceId: payload.sourceId || null,
      scope: payload.scope || "USER",
      importance: clamp(Number(payload.importance ?? 0.5), 0, 1),
      pinned: !!payload.pinned,
      confidence: clamp(Number(payload.confidence ?? 1), 0, 1),
      tags: payload.tags || [],
      metadata: payload.metadata || {},
      tokenCount: estimateTokens(payload.content),
      projectId: payload.projectId || null,
      conversationId: payload.conversationId || null,
      documentId: payload.documentId || null,
      agentType: payload.agentType || null,
      workspaceId: payload.workspaceId || null,
      collectionId: payload.collectionId || null,
      parentId: payload.parentId || null,
      embeddingId: payload.embeddingId || null,
    };

    if (existing) {
      return prisma.knowledgeNode.update({ where: { id: existing.id }, data });
    }

    return prisma.knowledgeNode.create({ data: { ...data, ownerId } });
  }

  async createEdge(ownerId, fromId, toId, type, weight = 1, metadata = {}) {
    return prisma.knowledgeEdge.upsert({
      where: { fromId_toId_type: { fromId, toId, type } },
      create: { fromId, toId, type, weight, metadata, ownerId },
      update: { weight, metadata },
    });
  }

  async traverse(ownerId, startId, { depth = 2, types } = {}) {
    const visited = new Set();
    const nodes = new Map();
    const edges = [];

    const walk = async (id, d) => {
      if (d > depth || visited.has(id)) return;
      visited.add(id);

      const node = await prisma.knowledgeNode.findFirst({
        where: { id, ownerId, deletedAt: null },
      });
      if (!node) return;
      nodes.set(id, node);

      const edgeWhere = { OR: [{ fromId: id }, { toId: id }], ownerId };
      if (types?.length) edgeWhere.type = { in: types };

      const nodeEdges = await prisma.knowledgeEdge.findMany({ where: edgeWhere });
      for (const e of nodeEdges) {
        edges.push(e);
        const next = e.fromId === id ? e.toId : e.fromId;
        await walk(next, d + 1);
      }
    };

    await walk(startId, 0);

    return {
      rootId: startId,
      depth,
      nodes: [...nodes.values()],
      edges: edges.filter(
        (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i,
      ),
      path: [...visited],
    };
  }

  async extractRelationships(content, { filePath, language } = {}) {
    const edges = [];
    const importRe = /(?:import|require|from)\s+['"]([^'"]+)['"]/g;
    const callRe = /\b([a-zA-Z_][\w]*)\s*\(/g;
    let m;
    while ((m = importRe.exec(content))) {
      edges.push({ type: EDGE_TYPES.IMPORTS, target: m[1] });
    }
    const calls = new Set();
    while ((m = callRe.exec(content))) {
      if (!["if", "for", "while", "switch", "catch", "function"].includes(m[1])) {
        calls.add(m[1]);
      }
    }
    for (const fn of calls) {
      edges.push({ type: EDGE_TYPES.CALLS, target: fn });
    }
    if (filePath) {
      edges.push({ type: EDGE_TYPES.REFERENCES, target: filePath });
    }
    return { edges, language, filePath };
  }

  async computeMetrics(ownerId) {
    const [nodeCount, edgeCount] = await Promise.all([
      prisma.knowledgeNode.count({ where: { ownerId, deletedAt: null } }),
      prisma.knowledgeEdge.count({ where: { ownerId } }),
    ]);

    const avgDegree = nodeCount > 0 ? (edgeCount * 2) / nodeCount : 0;
    const maxEdges = nodeCount * (nodeCount - 1);
    const density = maxEdges > 0 ? edgeCount / maxEdges : 0;

    const record = await prisma.graphMetrics.create({
      data: {
        ownerId,
        nodeCount,
        edgeCount,
        avgDegree,
        density,
        clusters: Math.max(1, Math.ceil(nodeCount / 10)),
      },
    });

    return record;
  }

  async syncFromMemory(ownerId, memory) {
    const node = await this.upsertNode(ownerId, {
      sourceType: NODE_TYPES.MEMORY,
      sourceId: memory.id,
      content: memory.content,
      scope: memory.scope,
      importance: memory.importance,
      pinned: memory.pinned,
      confidence: memory.confidence,
      tags: memory.tags,
      metadata: memory.metadata,
      projectId: memory.projectId,
      conversationId: memory.conversationId,
      documentId: memory.documentId,
      agentType: memory.agentType,
      workspaceId: memory.workspaceId,
      collectionId: memory.collectionId,
    });

    if (memory.documentId) {
      const docNode = await prisma.knowledgeNode.findFirst({
        where: { ownerId, sourceType: NODE_TYPES.DOCUMENT, sourceId: memory.documentId },
      });
      if (docNode) {
        await this.createEdge(ownerId, node.id, docNode.id, EDGE_TYPES.DERIVED_FROM);
      }
    }

    return node;
  }
}

module.exports = new KnowledgeGraphEngine();
module.exports.EDGE_TYPES = EDGE_TYPES;
module.exports.NODE_TYPES = NODE_TYPES;
