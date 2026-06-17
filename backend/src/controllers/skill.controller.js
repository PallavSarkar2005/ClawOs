const prisma = require("../database/prisma");

// ==============================
// GET ALL SKILLS
// ==============================

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

// ==============================
// CREATE SKILL
// ==============================

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
        description,
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

// ==============================
// DELETE SKILL
// ==============================

async function deleteSkill(req, res) {
  try {
    await prisma.skill.delete({
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
  getSkills,
  createSkill,
  deleteSkill,
};