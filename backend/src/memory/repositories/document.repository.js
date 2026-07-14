const prisma = require("../../database/prisma");

class DocumentRepository {
  async findById(id, userId) {
    return prisma.document.findFirst({
      where: { id, userId, deletedAt: null },
      include: { chunks: { where: { deletedAt: null }, orderBy: { chunkIndex: "asc" } },
      },
    });
  }

  async findMeta(id, userId) {
    return prisma.document.findFirst({
      where: { id, userId, deletedAt: null },
    });
  }

  async list(userId, { status, q, skip = 0, take = 50 } = {}) {
    const where = { userId, deletedAt: null };
    if (status) where.status = status;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.document.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: Number(skip) || 0,
        take: Math.min(Number(take) || 50, 100),
        select: {
          id: true,
          name: true,
          mimeType: true,
          fileType: true,
          fileSize: true,
          status: true,
          indexProgress: true,
          indexError: true,
          pageCount: true,
          tokenCount: true,
          chunkCount: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          projectId: true,
        },
      }),
      prisma.document.count({ where }),
    ]);

    return { items, total };
  }

  async create(data) {
    return prisma.document.create({ data });
  }

  async update(id, data) {
    return prisma.document.update({ where: { id }, data });
  }

  async softDelete(id, userId) {
    const doc = await this.findMeta(id, userId);
    if (!doc) return null;
    await prisma.documentChunk.updateMany({
      where: { documentId: id },
      data: { deletedAt: new Date() },
    });
    return prisma.document.update({
      where: { id },
      data: { deletedAt: new Date(), status: "deleted" },
    });
  }

  async replaceChunks(documentId, chunks) {
    await prisma.documentChunk.deleteMany({ where: { documentId } });
    if (!chunks.length) return [];
    await prisma.documentChunk.createMany({ data: chunks });
    return prisma.documentChunk.findMany({
      where: { documentId, deletedAt: null },
      orderBy: { chunkIndex: "asc" },
    });
  }

  async getChunks(documentId, userId) {
    const doc = await this.findMeta(documentId, userId);
    if (!doc) return null;
    return prisma.documentChunk.findMany({
      where: { documentId, deletedAt: null },
      orderBy: { chunkIndex: "asc" },
    });
  }

  async updateChunk(id, data) {
    return prisma.documentChunk.update({ where: { id }, data });
  }

  async findChunksForSearch(userId, { documentIds, limit = 2000 } = {}) {
    const chunks = await prisma.documentChunk.findMany({
      where: {
        deletedAt: null,
        document: {
          userId,
          deletedAt: null,
          ...(documentIds?.length ? { id: { in: documentIds } } : {}),
        },
      },
      take: limit * 2,
      include: {
        document: {
          select: { id: true, name: true, fileType: true, metadata: true },
        },
      },
    });
    return chunks
      .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
      .slice(0, limit);
  }
}

module.exports = new DocumentRepository();
