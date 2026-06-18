const prisma = require("../database/prisma");

async function routeSkill(userId, message) {
  const skills = await prisma.skill.findMany({
    where: {
      userId,
      enabled: true,
    },
  });

  if (skills.length === 0) {
    return null;
  }

  const text = message.toLowerCase();

  for (const skill of skills) {
    const name = skill.name.toLowerCase();

    if (
      text.includes(name) ||
      text.includes("react") && name.includes("react") ||
      text.includes("dsa") && name.includes("dsa") ||
      text.includes("resume") && name.includes("resume")
    ) {
      return skill;
    }
  }

  return null;
}

module.exports = routeSkill;