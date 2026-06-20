async function chooseTool(message) {
  const text = message.toLowerCase();

  if (text.includes("remember") || text.includes("memory")) {
    return "search_memory";
  }

  if (
    text.includes("document") ||
    text.includes("pdf") ||
    text.includes("resume")
  ) {
    return "search_documents";
  }

  return null;
}

module.exports = chooseTool;
