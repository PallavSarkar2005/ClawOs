const prisma = require("../database/prisma");

async function getSkills(req, res) {
  try {
    const skills = await prisma.skill.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(skills);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

async function createSkill(req, res) {
  try {
    const {
      name,
      description,
      prompt,
    } = req.body;

    const skill = await prisma.skill.create({
      data: {
        name,
        description: description || "",
        prompt,
        userId: req.user.id,
      },
    });

    res.status(201).json(skill);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

async function deleteSkill(req, res) {
  try {
    const existing = await prisma.skill.findFirst({
      where: {
        id: req.params.id,
        userId: req.user.id,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "Skill not found" });
    }

    await prisma.skill.delete({
      where: {
        id: existing.id,
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
  getSkills,
  createSkill,
  deleteSkill,
};
