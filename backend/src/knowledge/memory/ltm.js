const prisma = require("../../database/prisma");
const scoringService = require("../../memory/services/scoring.service");
const memoryRepository = require("../../memory/repositories/memory.repository");
const graphEngine = require("../graph/engine");

const PROMOTION_THRESHOLD = 0.75;
const FORGET_THRESHOLD = 0.08;
const ARCHIVE_DAYS = 180;

class LongTermMemoryEngine {
  async scoreMemory(memory) {
    return scoringService.score(memory, 0);
  }

  async reinforce(ownerId, memoryId, { boost = 0.1 } = {}) {
    const memory = await memoryRepository.findById(memoryId, ownerId);
    if (!memory) return null;

    const importance = Math.min(1, (memory.importance || 0.5) + boost);
    const confidence = Math.min(1, (memory.confidence || 1) + boost * 0.5);

    return memoryRepository.update(memoryId, ownerId, {
      importance,
      confidence,
      frequency: { increment: 1 },
      lastAccessed: new Date(),
      decay: 0,
    });
  }

  async promote(ownerId, memoryId) {
    const memory = await memoryRepository.findById(memoryId, ownerId);
    if (!memory) return null;
    const scoring = await this.scoreMemory(memory);
    if (scoring.score < PROMOTION_THRESHOLD) return { promoted: false, reason: "below_threshold" };

    const updated = await memoryRepository.update(memoryId, ownerId, {
      importance: Math.min(1, memory.importance + 0.15),
      pinned: memory.importance > 0.85 ? true : memory.pinned,
    });

    await graphEngine.syncFromMemory(ownerId, updated);
    return { promoted: true, memory: updated };
  }

  async forget(ownerId, memoryId, { archive = true } = {}) {
    const memory = await memoryRepository.findById(memoryId, ownerId);
    if (!memory || memory.pinned) return { forgotten: false, reason: "pinned" };

    const scoring = await this.scoreMemory(memory);
    if (scoring.score > FORGET_THRESHOLD) return { forgotten: false, reason: "above_threshold" };

    if (archive) {
      await prisma.knowledgeNode.updateMany({
        where: { ownerId, sourceType: "memory", sourceId: memoryId },
        data: { archived: true },
      });
      return memoryRepository.update(memoryId, ownerId, { decay: 1, score: 0 });
    }

    return memoryRepository.softDelete(memoryId, ownerId);
  }

  async decayPass(ownerId) {
    const { items } = await memoryRepository.list(ownerId, { take: 500 });
    let updated = 0;
    let promoted = 0;
    let archived = 0;

    for (const m of items) {
      if (m.pinned) continue;
      const scoring = scoringService.score(m, 0);

      if (scoring.score >= PROMOTION_THRESHOLD && m.importance < 0.9) {
        await this.promote(ownerId, m.id);
        promoted += 1;
      }

      const daysSinceAccess = (Date.now() - new Date(m.lastAccessed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceAccess > ARCHIVE_DAYS && scoring.score < FORGET_THRESHOLD) {
        await this.forget(ownerId, m.id, { archive: true });
        archived += 1;
        continue;
      }

      if (Math.abs((m.decay || 0) - scoring.decay) > 0.01 || Math.abs((m.score || 0) - scoring.score) > 0.01) {
        await memoryRepository.update(m.id, ownerId, { decay: scoring.decay, score: scoring.score });
        updated += 1;
      }
    }

    return { updated, promoted, archived };
  }

  async listPinned(ownerId) {
    return memoryRepository.list(ownerId, { pinned: true, take: 100 });
  }

  async listArchived(ownerId) {
    const nodes = await prisma.knowledgeNode.findMany({
      where: { ownerId, archived: true, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return nodes;
  }
}

module.exports = new LongTermMemoryEngine();
