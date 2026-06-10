const openai = require("../services/openai");

async function coordinatorAgent(userMessage) {
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: userMessage,
  });

  return response.output_text;
}

module.exports = coordinatorAgent;