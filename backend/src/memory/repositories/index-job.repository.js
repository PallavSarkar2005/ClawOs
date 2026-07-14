const prisma = require("../../database/prisma");
const { INDEX_JOB_STATUS } = require("../utils");

class IndexJobRepository {
  async create(data) {
    return prisma.indexJob.create({ data });
  }

  async findById(id, userId) {
    return prisma.indexJob.findFirst({ where: { id, userId } });
  }

  async list(userId, { status, skip = 0, take = 50 } = {}) {
    const where = { userId };
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      prisma.indexJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: Number(skip) || 0,
        take: Math.min(Number(take) || 50, 100),
        include: {
          document: { select: { id: true, name: true, status: true, indexProgress: true } },
        },
      }),
      prisma.indexJob.count({ where }),
    ]);
    return { items, total };
  }

  async claimNext() {
    const job = await prisma.indexJob.findFirst({
      where: {
        OR: [
          { status: INDEX_JOB_STATUS.QUEUED },
          { status: INDEX_JOB_STATUS.RETRYING },
        ],
      },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return null;

    return prisma.indexJob.update({
      where: { id: job.id },
      data: {
        status: INDEX_JOB_STATUS.RUNNING,
        startedAt: job.startedAt || new Date(),
        stage: "claimed",
      },
    });
  }

  async update(id, data) {
    return prisma.indexJob.update({ where: { id }, data });
  }

  async complete(id, result = {}) {
    return prisma.indexJob.update({
      where: { id },
      data: {
        status: INDEX_JOB_STATUS.COMPLETED,
        progress: 100,
        stage: "done",
        result,
        finishedAt: new Date(),
        error: null,
      },
    });
  }

  async fail(id, error, retries, maxRetries) {
    const canRetry = retries < maxRetries;
    return prisma.indexJob.update({
      where: { id },
      data: {
        status: canRetry ? INDEX_JOB_STATUS.RETRYING : INDEX_JOB_STATUS.FAILED,
        error: String(error).slice(0, 2000),
        retries: { increment: 1 },
        finishedAt: canRetry ? null : new Date(),
        stage: canRetry ? "retry" : "failed",
      },
    });
  }

  async progress(id, progress, stage) {
    return prisma.indexJob.update({
      where: { id },
      data: { progress, stage },
    });
  }
}

module.exports = new IndexJobRepository();
