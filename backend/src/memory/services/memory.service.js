const memoryRepository = require("../repositories/memory.repository");
const relationshipRepository = require("../repositories/relationship.repository");
const embeddingService = require("./embedding.service");
const scoringService = require("./scoring.service");
const embeddingSync = require("../../knowledge/embeddings/sync");
const graphEngine = require("../../knowledge/graph/engine");
const prisma = require("../../database/prisma");
const { MEMORY_SCOPES, contentHash, estimateTokens, clamp } = require("../utils");

class MemoryService {
  async list(ownerId, filters) {
    return memoryRepository.list(ownerId, filters);
  }

  async get(ownerId, id) {
    const memory = await memoryRepository.findById(id, ownerId);
    if (!memory) return null;
    const scoring = scoringService.score(memory, 0);
    const edges = await relationshipRepository.list(ownerId, { memoryId: id });
    return { ...memory, scoring, edges };
  }

  async create(ownerId, payload) {
    const content = String(payload.content || "").trim();
    if (!content) throw Object.assign(new Error("content is required"), { status: 400 });

    const scope = String(payload.scope || MEMORY_SCOPES.USER).toUpperCase();
    if (!Object.values(MEMORY_SCOPES).includes(scope)) {
      throw Object.assign(new Error(`Invalid scope: ${scope}`), { status: 400 });
    }

    const hash = contentHash(content);
    const embedding = await embeddingService.embedOne(content, { userId: ownerId });
    const importance = clamp(Number(payload.importance ?? 0.5), 0, 1);

    const memory = await memoryRepository.create({
      content,
      ownerId,
      scope,
      importance,
      pinned: !!payload.pinned,
      confidence: clamp(Number(payload.confidence ?? 1), 0, 1),
      source: payload.source || "manual",
      tags: Array.isArray(payload.tags) ? payload.tags : String(payload.tags || "").split(",").map((t) => t.trim()).filter(Boolean),
      metadata: {
        ...(payload.metadata || {}),
        tokenCount: estimateTokens(content),
      },
      embedding,
      embeddingModel: "auto",
      embeddingDim: embedding.length,
      contentHash: hash,
      score: importance,
      projectId: payload.projectId || null,
      conversationId: payload.conversationId || null,
      agentType: payload.agentType || null,
      workflowId: payload.workflowId || null,
      documentId: payload.documentId || null,
      workspaceId: payload.workspaceId || null,
      collectionId: payload.collectionId || null,
    });

    await memoryRepository.createVersion(memory.id, content, 1, { source: "create" });

    if (payload.relateTo?.id) {
      await relationshipRepository.create(
        ownerId,
        memory.id,
        payload.relateTo.id,
        payload.relateTo.type || "related",
        payload.relateTo.weight || 1,
      );
    }

    await prisma.memoryAccessLog.create({
      data: { ownerId, memoryId: memory.id, action: "create", metadata: { scope } },
    });

    await embeddingSync.syncMemoryEmbedding(memory.id, content, ownerId, memory).catch(() => null);
    await graphEngine.syncFromMemory(ownerId, memory).catch(() => null);

    return memory;
  }

  async update(ownerId, id, payload) {
    const existing = await memoryRepository.findById(id, ownerId);
    if (!existing) return null;

    const data = {};
    if (payload.content !== undefined) {
      data.content = String(payload.content);
      data.contentHash = contentHash(data.content);
      data.version = existing.version + 1;
      const { embedding, skipped } = await embeddingService.embedIfChanged(
        data.content,
        existing.contentHash,
        existing.embedding,
        data.contentHash,
        { userId: ownerId },
      );
      if (!skipped) {
        data.embedding = embedding;
        data.embeddingDim = embedding.length;
        data.embeddingModel = "auto";
      }
      await memoryRepository.createVersion(id, data.content, data.version, { source: "update" });
    }
    if (payload.importance !== undefined) data.importance = clamp(Number(payload.importance), 0, 1);
    if (payload.pinned !== undefined) data.pinned = !!payload.pinned;
    if (payload.confidence !== undefined) data.confidence = clamp(Number(payload.confidence), 0, 1);
    if (payload.tags !== undefined) {
      data.tags = Array.isArray(payload.tags)
        ? payload.tags
        : String(payload.tags).split(",").map((t) => t.trim()).filter(Boolean);
    }
    if (payload.metadata !== undefined) data.metadata = payload.metadata;
    if (payload.scope !== undefined) data.scope = String(payload.scope).toUpperCase();
    if (payload.source !== undefined) data.source = payload.source;
    if (payload.collectionId !== undefined) data.collectionId = payload.collectionId;
    if (payload.agentType !== undefined) data.agentType = payload.agentType;

    // recompute score
    const merged = { ...existing, ...data };
    const scoring = scoringService.score(merged, 0);
    data.score = scoring.score;
    data.decay = scoring.decay;

    const updated = await memoryRepository.update(id, ownerId, data);
    await prisma.memoryAccessLog.create({
      data: { ownerId, memoryId: id, action: "update" },
    });
    if (updated) {
      await embeddingSync.syncMemoryEmbedding(id, updated.content, ownerId, existing).catch(() => null);
      await graphEngine.syncFromMemory(ownerId, updated).catch(() => null);
    }
    return updated;
  }

  async pin(ownerId, id, pinned = true) {
    return this.update(ownerId, id, { pinned });
  }

  async remove(ownerId, id) {
    const result = await memoryRepository.softDelete(id, ownerId);
    if (result) {
      await prisma.memoryAccessLog.create({
        data: { ownerId, memoryId: id, action: "delete" },
      });
    }
    return result;
  }

  async removeAll(ownerId) {
    return memoryRepository.softDeleteAll(ownerId);
  }

  async reembed(ownerId, id) {
    const memory = await memoryRepository.findById(id, ownerId);
    if (!memory) return null;
    const embedding = await embeddingService.embedOne(memory.content, { userId: ownerId });
    const result = await memoryRepository.update(id, ownerId, {
      embedding,
      embeddingDim: embedding.length,
      embeddingModel: "auto",
      contentHash: contentHash(memory.content),
    });
    await embeddingSync.syncMemoryEmbedding(id, memory.content, ownerId, result).catch(() => null);
    return result;
  }

  async stats(ownerId) {
    return memoryRepository.stats(ownerId);
  }

  async history(ownerId, { skip = 0, take = 50 } = {}) {
    return prisma.memoryAccessLog.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      skip: Number(skip) || 0,
      take: Math.min(Number(take) || 50, 200),
      include: {
        memory: { select: { id: true, content: true, scope: true } },
      },
    });
  }

  async rememberAgent(ownerId, agentType, content, extra = {}) {
    return this.create(ownerId, {
      content,
      scope: MEMORY_SCOPES.AGENT,
      agentType,
      source: `agent:${agentType}`,
      importance: extra.importance ?? 0.6,
      tags: ["agent", agentType, ...(extra.tags || [])],
      projectId: extra.projectId,
      conversationId: extra.conversationId,
      metadata: extra.metadata || {},
    });
  }

  async applyDecayPass(ownerId) {
    const { items } = await memoryRepository.list(ownerId, { take: 200 });
    let updated = 0;
    for (const m of items) {
      if (m.pinned) continue;
      const scoring = scoringService.score(m, 0);
      if (Math.abs((m.decay || 0) - scoring.decay) > 0.01 || Math.abs((m.score || 0) - scoring.score) > 0.01) {
        await memoryRepository.update(m.id, ownerId, { decay: scoring.decay, score: scoring.score });
        updated += 1;
      }
    }
    return { updated };
  }
}

module.exports = new MemoryService();
