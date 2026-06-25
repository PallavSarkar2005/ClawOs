const coordinatorAgent = require("./coordinator.agent");

async function writerAgent(research) {
  const prompt = `
You are a writer agent.

Create a polished response using:

${research}
`;

  return coordinatorAgent(prompt);
}

module.exports = writerAgent;
