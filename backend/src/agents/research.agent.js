const coordinatorAgent = require("./coordinator.agent");

async function researchAgent(query) {
  const prompt = `
You are a research agent.

Research the topic thoroughly.

Topic:
${query}
`;

  return coordinatorAgent(prompt);
}

module.exports = researchAgent;
