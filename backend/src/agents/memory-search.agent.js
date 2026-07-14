const { retrievalEngine } = require("../memory");

async function searchMemories(userId, message) {
  try {
    const result = await retrievalEngine.hybridSearch(userId, message, {
      topK: 10,
      includeChunks: false,
      includeMemories: true,
      useMmr: true,
    });
    return (result.results || []).map((m) => m.content).join("\n");
  } catch (err) {
    console.error("[memory-search]", err.message);
    return "";
  }
}

module.exports = searchMemories;
