const researchAgent = require("./research.agent");
const writerAgent = require("./writer.agent");

async function runChain(userMessage) {
  const research = await researchAgent(userMessage);

  const finalAnswer = await writerAgent(research);

  return finalAnswer;
}

module.exports = runChain;
