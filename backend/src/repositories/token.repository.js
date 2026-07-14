const prisma = require("../database/prisma");

class TokenRepository {
  async create(data) {
    return prisma.refreshToken.create({
      data,
    });
  }

  async findByToken(token) {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async revoke(token) {
    return prisma.refreshToken.update({
      where: { token },
      data: { revoked: true },
    });
  }

  async revokeAllByUserId(userId) {
    return prisma.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });
  }

  async deleteExpiredTokens() {
    return prisma.refreshToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { revoked: true },
        ],
      },
    });
  }
}

module.exports = new TokenRepository();
