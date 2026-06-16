const prisma = require("../database/prisma");

async function getMemories(req, res) {
  try {
    const memories = await prisma.memory.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(memories);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

async function deleteMemory(req, res) {
  try {
    const memory = await prisma.memory.findUnique({
      where: {
        id: req.params.id,
      },
    });

    if (!memory) {
      return res.status(404).json({
        message: "Memory not found",
      });
    }

    if (memory.userId !== req.user.id) {
      return res.status(403).json({
        message: "Unauthorized",
      });
    }

    await prisma.memory.delete({
      where: {
        id: req.params.id,
      },
    });

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

module.exports = {
  getMemories,
  deleteMemory,
};
