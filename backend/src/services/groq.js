const OpenAI = require("openai");

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "missing-groq-key",
  baseURL: "https://api.groq.com/openai/v1",
});

module.exports = groq;
