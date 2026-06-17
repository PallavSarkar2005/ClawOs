let currentProvider = "openrouter";

const models = {
  openrouter: [
    "deepseek/deepseek-r1",
    "meta-llama/llama-3.3-70b-instruct",
    "qwen/qwen3-32b",
  ],

  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],

  ollama: ["llama3", "mistral"],
};

// ==========================
// GET MODELS
// ==========================

function getModels(req, res) {
  res.json({
    currentProvider,
    models,
  });
}

// ==========================
// SET PROVIDER
// ==========================

function setProvider(req, res) {
  const { provider } = req.body;

  if (!models[provider]) {
    return res.status(400).json({
      success: false,
      message: "Invalid provider",
    });
  }

  currentProvider = provider;

  res.json({
    success: true,
    provider,
  });
}

// ==========================
// GET CURRENT PROVIDER
// ==========================

function getCurrentProvider() {
  return currentProvider;
}

module.exports = {
  getModels,
  setProvider,
  getCurrentProvider,
};
