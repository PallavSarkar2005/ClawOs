const prisma = require("../database/prisma");

// ======================
// GET MEMORIES
// ======================

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

// ======================
// CREATE MEMORY
// ======================

async function createMemory(req, res) {
  try {
    const { content } = req.body;

    const memory = await prisma.memory.create({
      data: {
        content,
        userId: req.user.id,
      },
    });

    res.status(201).json(memory);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

// ======================
// DELETE MEMORY
// ======================

async function deleteMemory(req, res) {
  try {
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
  createMemory,
  deleteMemory,
};
