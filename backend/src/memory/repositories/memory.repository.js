const prisma = require("../../database/prisma");

class MemoryRepository {
  async findById(id, ownerId) {
    return prisma.memory.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
  }

  async list(ownerId, { scope, pinned, tags, projectId, agentType, q, skip = 0, take = 50, orderBy = "updatedAt" } = {}) {
    const where = { ownerId, deletedAt: null };
    if (scope) where.scope = scope;
    if (pinned !== undefined) where.pinned = pinned === true || pinned === "true";
    if (projectId) where.projectId = projectId;
    if (agentType) where.agentType = agentType;
    if (tags?.length) where.tags = { hasSome: Array.isArray(tags) ? tags : [tags] };
    if (q) {
      where.OR = [
        { content: { contains: q, mode: "insensitive" } },
        { source: { contains: q, mode: "insensitive" } },
        { tags: { has: q } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.memory.findMany({
        where,
        orderBy: { [orderBy]: "desc" },
        skip: Number(skip) || 0,
        take: Math.min(Number(take) || 50, 200),
      }),
      prisma.memory.count({ where }),
    ]);

    return { items, total, skip: Number(skip) || 0, take: Math.min(Number(take) || 50, 200) };
  }

  async create(data) {
    return prisma.memory.create({ data });
  }

  async update(id, ownerId, data) {
    const existing = await this.findById(id, ownerId);
    if (!existing) return null;
    return prisma.memory.update({ where: { id }, data });
  }

  async softDelete(id, ownerId) {
    const existing = await this.findById(id, ownerId);
    if (!existing) return null;
    return prisma.memory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async softDeleteAll(ownerId) {
    return prisma.memory.updateMany({
      where: { ownerId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async touch(ids) {
    if (!ids?.length) return;
    await prisma.memory.updateMany({
      where: { id: { in: ids } },
      data: {
        lastAccessed: new Date(),
        frequency: { increment: 1 },
      },
    });
  }

  async findForEmbedding(ownerId, { scope, projectId, conversationId, limit = 500 } = {}) {
    const where = { ownerId, deletedAt: null };
    if (scope) where.scope = scope;
    if (projectId) where.projectId = projectId;
    if (conversationId) where.conversationId = conversationId;
    return prisma.memory.findMany({
      where,
      take: limit,
      orderBy: [{ pinned: "desc" }, { importance: "desc" }, { updatedAt: "desc" }],
    });
  }

  async createVersion(memoryId, content, version, metadata = {}) {
    return prisma.memoryVersion.create({
      data: { memoryId, content, version, metadata },
    });
  }

  async stats(ownerId) {
    const base = { ownerId, deletedAt: null };
    const [total, pinned, byScope, allEmbeddedCheck, recent] = await Promise.all([
      prisma.memory.count({ where: base }),
      prisma.memory.count({ where: { ...base, pinned: true } }),
      prisma.memory.groupBy({
        by: ["scope"],
        where: base,
        _count: { _all: true },
      }),
      prisma.memory.findMany({
        where: base,
        select: { id: true, embedding: true },
        take: 5000,
      }),
      prisma.memory.findMany({
        where: base,
        orderBy: { lastAccessed: "desc" },
        take: 10,
        select: { id: true, content: true, scope: true, lastAccessed: true, importance: true },
      }),
    ]);

    const indexed = allEmbeddedCheck.filter((m) => Array.isArray(m.embedding) && m.embedding.length > 0).length;

    return {
      total,
      pinned,
      embedded: indexed,
      byScope: Object.fromEntries(byScope.map((s) => [s.scope, s._count._all])),
      recent,
    };
  }
}

module.exports = new MemoryRepository();
