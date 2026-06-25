const prisma = require("../database/prisma");

// ======================================
// GET SETTINGS
// ======================================

async function getSettings(req, res) {
  try {
    let settings = await prisma.setting.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (!settings) {
      settings = await prisma.setting.create({
        data: {
          userId: req.user.id,
        },
      });
    }

    res.json(settings);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

// ======================================
// UPDATE SETTINGS
// ======================================

async function updateSettings(req, res) {
  try {
    const {
      defaultProvider,
      autoMemorySave,
      autoSkillRouting,
      webSearchDefault,
      temperature,
      maxContext,
    } = req.body;

    const settings = await prisma.setting.upsert({
      where: {
        userId: req.user.id,
      },

      update: {
        defaultProvider,
        autoMemorySave,
        autoSkillRouting,
        webSearchDefault,
        temperature,
        maxContext,
      },

      create: {
        userId: req.user.id,
        defaultProvider,
        autoMemorySave,
        autoSkillRouting,
        webSearchDefault,
        temperature,
        maxContext,
      },
    });

    res.json(settings);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

module.exports = {
  getSettings,
  updateSettings,
};
