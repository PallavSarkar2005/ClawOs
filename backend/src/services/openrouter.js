const OpenAI = require("openai");

const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY || "missing-openrouter-key",
  baseURL: "https://openrouter.ai/api/v1",
});

module.exports = openrouter;