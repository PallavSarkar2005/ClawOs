const prisma = require("../../database/prisma");

class RelationshipRepository {
  async create(ownerId, fromId, toId, type, weight = 1, metadata = {}) {
    const [from, to] = await Promise.all([
      prisma.memory.findFirst({ where: { id: fromId, ownerId, deletedAt: null } }),
      prisma.memory.findFirst({ where: { id: toId, ownerId, deletedAt: null } }),
    ]);
    if (!from || !to) return null;

    return prisma.memoryEdge.upsert({
      where: { fromId_toId_type: { fromId, toId, type } },
      create: { fromId, toId, type, weight, metadata, ownerId },
      update: { weight, metadata },
    });
  }

  async list(ownerId, { memoryId, type } = {}) {
    const where = { ownerId };
    if (type) where.type = type;
    if (memoryId) {
      where.OR = [{ fromId: memoryId }, { toId: memoryId }];
    }
    return prisma.memoryEdge.findMany({
      where,
      include: {
        from: { select: { id: true, content: true, scope: true, tags: true } },
        to: { select: { id: true, content: true, scope: true, tags: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }

  async traverse(ownerId, startId, { depth = 2, type } = {}) {
    const visited = new Set();
    const nodes = [];
    const edges = [];
    let frontier = [startId];

    for (let d = 0; d < depth; d += 1) {
      const next = [];
      for (const id of frontier) {
        if (visited.has(id)) continue;
        visited.add(id);
        const where = {
          ownerId,
          OR: [{ fromId: id }, { toId: id }],
        };
        if (type) where.type = type;
        const batch = await prisma.memoryEdge.findMany({
          where,
          include: {
            from: { select: { id: true, content: true, scope: true, importance: true, tags: true } },
            to: { select: { id: true, content: true, scope: true, importance: true, tags: true } },
          },
        });
        for (const e of batch) {
          edges.push(e);
          if (!visited.has(e.fromId)) next.push(e.fromId);
          if (!visited.has(e.toId)) next.push(e.toId);
          nodes.push(e.from, e.to);
        }
      }
      frontier = next;
    }

    const uniqueNodes = [...new Map(nodes.map((n) => [n.id, n])).values()];
    return { nodes: uniqueNodes, edges, depth };
  }

  async remove(id, ownerId) {
    const edge = await prisma.memoryEdge.findFirst({ where: { id, ownerId } });
    if (!edge) return null;
    return prisma.memoryEdge.delete({ where: { id } });
  }
}

module.exports = new RelationshipRepository();
