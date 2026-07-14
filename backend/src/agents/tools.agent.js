const prisma = require("../database/prisma");
const { retrievalEngine } = require("../memory");

async function executeTool(toolName, args, userId) {
  try {
    switch (toolName) {
      case "search_memory": {
        const result = await retrievalEngine.hybridSearch(userId, args?.query || "", {
          topK: 10,
          includeChunks: false,
        });
        return (result.results || []).map((m) => m.content).join("\n");
      }

      case "search_documents": {
        const result = await retrievalEngine.hybridSearch(userId, args?.query || "document", {
          topK: 8,
          includeMemories: false,
          includeChunks: true,
        });
        if (result.results?.length) {
          return result.results.map((r) => r.content).join("\n\n");
        }
        const docs = await prisma.document.findMany({
          where: { userId, deletedAt: null },
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
