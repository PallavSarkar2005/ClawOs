const prisma = require("../database/prisma");

async function executeTool(toolName, args, userId) {
  try {
    switch (toolName) {
      case "search_memory": {
        const memories = await prisma.memory.findMany({
          where: {
            userId,
          },
          take: 10,
        });

        return memories.map((m) => m.content).join("\n");
      }

      case "search_documents": {
        const docs = await prisma.document.findMany({
          where: {
            userId,
          },
          take: 5,
        });

        return docs.map((d) => d.content).join("\n\n");
      }

      default:
        return "Tool not found";
    }
  } catch (error) {
    console.error(error);

    return "Tool execution failed";
  }
}

module.exports = executeTool;
