const prisma = require("../database/prisma");

async function searchMemories(userId, message) {
  const memories = await prisma.memory.findMany({
    where: {
      userId,
    },
    take: 50,
  });

  const words = message.toLowerCase().split(" ");

  const relevant = memories.filter((memory) =>
    words.some((word) => memory.content.toLowerCase().includes(word)),
  );

  return relevant
    .slice(0, 10)
    .map((m) => m.content)
    .join("\n");
}

module.exports = searchMemories;
