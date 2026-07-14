const prisma = require("../database/prisma");

class SessionRepository {
  async create(data) {
    return prisma.session.create({
      data,
    });
  }

  async findManyByUserId(userId) {
    return prisma.session.findMany({
      where: { userId },
      orderBy: { lastActive: "desc" },
    });
  }

  async findByIdAndUserId(id, userId) {
    return prisma.session.findFirst({
      where: { id, userId },
    });
  }

  async deleteByIdAndUserId(id, userId) {
    return prisma.session.deleteMany({
      where: { id, userId },
    });
  }

  async deleteAllExceptCurrent(userId, currentSessionId) {
    return prisma.session.deleteMany({
      where: {
        userId,
        NOT: { id: currentSessionId },
      },
    });
  }

  async deleteAllByUserId(userId) {
    return prisma.session.deleteMany({
      where: { userId },
    });
  }

  async updateActivity(id) {
    return prisma.session.update({
      where: { id },
      data: { lastActive: new Date() },
    });
  }
}

module.exports = new SessionRepository();
