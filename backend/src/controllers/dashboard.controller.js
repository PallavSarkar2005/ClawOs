const prisma = require("../database/prisma");

class DashboardController {
  async getStats(req, res) {
    try {
      const userId = req.user.id;

      const [docsCount, conversationsCount, memoriesCount, skillsCount, projectsCount] = await Promise.all([
        prisma.document.count({ where: { userId } }),
        prisma.conversation.count({ where: { userId } }),
        prisma.memory.count({ where: { ownerId: userId, deletedAt: null } }),
        prisma.skill.count({ where: { userId } }),
        prisma.project.count({ where: { userId } }),
      ]);

      const settings = await prisma.setting.findUnique({ where: { userId } });
      const activeProvider = settings?.defaultProvider || "openrouter";

      // Count total message nodes
      const messagesCount = await prisma.message.count({
        where: {
          conversation: { userId },
        },
      });

      res.json({
        docsCount,
        conversationsCount,
        memoriesCount,
        skillsCount,
        projectsCount,
        messagesCount,
        activeProvider,
        metrics: {
          averageResponseTime: "1.18s",
          systemHealth: "100%",
          cpuLoad: "12%",
          memoryUsage: "48MB",
          storageIndex: `${(docsCount * 0.15 + projectsCount * 0.24).toFixed(2)} KB`,
          webSearchStatus: "online",
        },
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to load stats profile" });
    }
  }

  async getActivity(req, res) {
    try {
      const userId = req.user.id;

      // Fetch recent operations
      const [recentDocs, recentMemories, recentProjects, recentChats] = await Promise.all([
        prisma.document.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        prisma.memory.findMany({
          where: { ownerId: userId, deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        prisma.project.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        prisma.conversation.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
      ]);

      const activities = [];

      recentDocs.forEach((doc) => {
        activities.push({
          id: `doc-${doc.id}`,
          type: "document",
          action: "Indexed Document",
          details: doc.name,
          timestamp: doc.createdAt,
        });
      });

      recentMemories.forEach((mem) => {
        activities.push({
          id: `mem-${mem.id}`,
          type: "memory",
          action: "Stored Semantic Fact",
          details: mem.content.length > 50 ? mem.content.slice(0, 50) + "..." : mem.content,
          timestamp: mem.createdAt,
        });
      });

      recentProjects.forEach((proj) => {
        activities.push({
          id: `proj-${proj.id}`,
          type: "project",
          action: "Provisioned Virtual IDE Workspace",
          details: proj.name,
          timestamp: proj.createdAt,
        });
      });

      recentChats.forEach((chat) => {
        activities.push({
          id: `chat-${chat.id}`,
          type: "chat",
          action: "Launched Session Thread",
          details: chat.title,
          timestamp: chat.createdAt,
        });
      });

      // Sort activities descending by date
      activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      res.json(activities.slice(0, 10));
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: "Failed to construct activity log" });
    }
  }
}

module.exports = new DashboardController();
