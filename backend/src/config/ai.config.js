const AI_CONFIG = {
  provider: "openrouter",

  openrouter: {
    model: "meta-llama/llama-3.3-70b-instruct",
  },

  groq: {
    model: "llama-3.3-70b-versatile",
  },

  ollama: {
    model: "llama3",
    baseUrl: "http://localhost:11434",
  },
};

module.exports = AI_CONFIG;