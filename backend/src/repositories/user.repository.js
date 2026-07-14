const prisma = require("../database/prisma");

class UserRepository {
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async findByEmail(email) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username) {
    return prisma.user.findUnique({
      where: { username },
    });
  }

  async findByResetToken(token) {
    return prisma.user.findUnique({
      where: { passwordResetToken: token },
    });
  }

  async findByVerificationToken(token) {
    return prisma.user.findUnique({
      where: { emailVerificationToken: token },
    });
  }

  async create(data) {
    return prisma.user.create({
      data,
    });
  }

  async update(id, data) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id) {
    return prisma.user.delete({
      where: { id },
    });
  }
}

module.exports = new UserRepository();
