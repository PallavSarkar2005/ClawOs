const prisma = require("../database/prisma");

class ProjectRepository {
  async findAllByUserId(userId) {
    return prisma.project.findMany({
      where: { userId },
      include: {
        files: { orderBy: [{ isFolder: "desc" }, { name: "asc" }] },
        _count: { select: { files: true, logs: true, diffs: true } },
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });
  }

  async findById(id, userId) {
    return prisma.project.findFirst({
      where: { id, userId },
      include: {
        files: { orderBy: [{ isFolder: "desc" }, { name: "asc" }] },
        logs: { orderBy: { createdAt: "desc" }, take: 200 },
        executions: { orderBy: { createdAt: "desc" }, take: 10 },
        diffs: { where: { status: "pending" }, orderBy: { createdAt: "desc" } },
      },
    });
  }

  async create(userId, data) {
    const count = await prisma.project.count({ where: { userId } });
    return prisma.project.create({
      data: {
        name: data.name,
        description: data.description || null,
        framework: data.framework || "react",
        status: data.status || "idle",
        sortOrder: count,
        userId,
      },
    });
  }

  async update(id, userId, data) {
    return prisma.project.updateMany({
      where: { id, userId },
      data,
    }).then(async () => this.findById(id, userId));
  }

  async reorder(userId, orderedIds) {
    const updates = orderedIds.map((id, index) =>
      prisma.project.updateMany({
        where: { id, userId },
        data: { sortOrder: index },
      })
    );
    await prisma.$transaction(updates);
    return this.findAllByUserId(userId);
  }

  async delete(id, userId) {
    return prisma.project.deleteMany({
      where: { id, userId },
    });
  }

  async createFile(projectId, data) {
    return prisma.projectFile.create({
      data: {
        name: data.name,
        path: data.path || `/${data.name}`,
        content: data.content ?? "",
        isFolder: Boolean(data.isFolder),
        parentId: data.parentId || null,
        projectId,
      },
    });
  }

  async updateFile(fileId, data) {
    return prisma.projectFile.update({
      where: { id: fileId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async findFileById(fileId) {
    return prisma.projectFile.findUnique({ where: { id: fileId } });
  }

  async deleteFile(fileId) {
    return prisma.projectFile.delete({
      where: { id: fileId },
    });
  }

  async createLog(projectId, { level = "info", source = "system", message }) {
    return prisma.projectLog.create({
      data: { projectId, level, source, message },
    });
  }

  async getLogs(projectId, take = 200) {
    return prisma.projectLog.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async createExecution(projectId, data) {
    return prisma.aiExecution.create({
      data: {
        projectId,
        status: data.status || "running",
        currentStage: data.currentStage || null,
        stages: data.stages || [],
        summary: data.summary || null,
      },
    });
  }

  async updateExecution(id, data) {
    return prisma.aiExecution.update({
      where: { id },
      data,
    });
  }

  async getExecutions(projectId) {
    return prisma.aiExecution.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async createDiff(projectId, data) {
    return prisma.projectDiff.create({
      data: {
        projectId,
        fileId: data.fileId || null,
        filePath: data.filePath,
        before: data.before || "",
        after: data.after || "",
        status: "pending",
        reason: data.reason || null,
      },
    });
  }

  async getDiffs(projectId, status) {
    return prisma.projectDiff.findMany({
      where: {
        projectId,
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async updateDiff(id, data) {
    return prisma.projectDiff.update({
      where: { id },
      data,
    });
  }

  async findDiffById(id) {
    return prisma.projectDiff.findUnique({ where: { id } });
  }
}

module.exports = new ProjectRepository();
