const prisma = require("../../database/prisma");

class CollectionRepository {
  async list(ownerId) {
    return prisma.memoryCollection.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { memories: true, items: true } } },
    });
  }

  async findById(id, ownerId) {
    return prisma.memoryCollection.findFirst({
      where: { id, ownerId },
      include: {
        memories: { where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 100 },
        items: true,
      },
    });
  }

  async create(data) {
    return prisma.memoryCollection.create({ data });
  }

  async update(id, ownerId, data) {
    const col = await prisma.memoryCollection.findFirst({ where: { id, ownerId } });
    if (!col) return null;
    return prisma.memoryCollection.update({ where: { id }, data });
  }

  async remove(id, ownerId) {
    const col = await prisma.memoryCollection.findFirst({ where: { id, ownerId } });
    if (!col) return null;
    await prisma.memory.updateMany({ where: { collectionId: id }, data: { collectionId: null } });
    await prisma.memoryCollectionItem.deleteMany({ where: { collectionId: id } });
    return prisma.memoryCollection.delete({ where: { id } });
  }

  async addMemory(collectionId, memoryId, ownerId) {
    const col = await prisma.memoryCollection.findFirst({ where: { id: collectionId, ownerId } });
    if (!col) return null;
    const memory = await prisma.memory.findFirst({ where: { id: memoryId, ownerId, deletedAt: null } });
    if (!memory) return null;
    await prisma.memory.update({ where: { id: memoryId }, data: { collectionId } });
    return prisma.memoryCollectionItem.upsert({
      where: { collectionId_memoryId: { collectionId, memoryId } },
      create: { collectionId, memoryId },
      update: {},
    });
  }

  async removeMemory(collectionId, memoryId, ownerId) {
    const col = await prisma.memoryCollection.findFirst({ where: { id: collectionId, ownerId } });
    if (!col) return null;
    await prisma.memory.updateMany({
      where: { id: memoryId, collectionId, ownerId },
      data: { collectionId: null },
    });
    await prisma.memoryCollectionItem.deleteMany({ where: { collectionId, memoryId } });
    return { success: true };
  }
}

module.exports = new CollectionRepository();
