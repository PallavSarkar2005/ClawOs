const prisma = require("../database/prisma");
const fs = require("fs");
const path = require("path");

async function exportAccountData(req, res) {
  try {
    const userId = req.user.id;

    const [user, settings, conversations, memories, skills, workflows, documents, projects, integrations] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            name: true,
            email: true,
            username: true,
            avatar: true,
            emailVerified: true,
            role: true,
            createdAt: true,
            updatedAt: true,
            lastLogin: true,
            lastPasswordChange: true,
          },
        }),
        prisma.setting.findUnique({ where: { userId } }),
        prisma.conversation.findMany({
          where: { userId },
          include: { messages: { orderBy: { createdAt: "asc" } } },
        }),
        prisma.memory.findMany({ where: { ownerId: userId, deletedAt: null }, orderBy: { createdAt: "desc" } }),
        prisma.skill.findMany({ where: { userId } }),
        prisma.workflow.findMany({ where: { userId } }),
        prisma.document.findMany({
          where: { userId },
          select: { id: true, name: true, createdAt: true, content: true },
        }),
        prisma.project.findMany({
          where: { userId },
          select: {
            id: true,
            name: true,
            description: true,
            framework: true,
            status: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.integration.findMany({
          where: { userId },
          select: { provider: true, status: true, keyHint: true, createdAt: true, lastTestedAt: true },
        }),
      ]);

    res.json({
      exportedAt: new Date().toISOString(),
      user,
      settings,
      conversations,
      memories,
      skills,
      workflows,
      documents,
      projects,
      integrations,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to export account data" });
  }
}

async function downloadConversations(req, res) {
  try {
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      exportedAt: new Date().toISOString(),
      conversations,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to download conversations" });
  }
}

async function exportMemories(req, res) {
  try {
    const memories = await prisma.memory.findMany({
      where: { ownerId: req.user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    res.json({
      exportedAt: new Date().toISOString(),
      memories,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to export memories" });
  }
}

async function deleteAllMemories(req, res) {
  try {
    const result = await prisma.memory.updateMany({
      where: { ownerId: req.user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete memories" });
  }
}

async function deleteAllConversations(req, res) {
  try {
    const result = await prisma.conversation.deleteMany({ where: { userId: req.user.id } });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete conversations" });
  }
}

async function deleteAllDocuments(req, res) {
  try {
    const docs = await prisma.document.findMany({
      where: { userId: req.user.id },
      select: { id: true, path: true },
    });

    for (const doc of docs) {
      if (doc.path && fs.existsSync(doc.path)) {
        try {
          fs.unlinkSync(doc.path);
        } catch (_) {
          /* ignore */
        }
      }
    }

    const result = await prisma.document.deleteMany({ where: { userId: req.user.id } });
    res.json({ success: true, deleted: result.count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to delete documents" });
  }
}

async function clearCache(req, res) {
  try {
    const cacheDir = path.join(__dirname, "../../uploads/cache", req.user.id);
    if (fs.existsSync(cacheDir)) {
      fs.rmSync(cacheDir, { recursive: true, force: true });
    }
    res.json({ success: true, message: "Cache cleared" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to clear cache" });
  }
}

module.exports = {
  exportAccountData,
  downloadConversations,
  exportMemories,
  deleteAllMemories,
  deleteAllConversations,
  deleteAllDocuments,
  clearCache,
};
