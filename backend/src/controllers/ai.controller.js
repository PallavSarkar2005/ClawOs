const models = {
  openrouter: [
    "deepseek/deepseek-r1",
    "meta-llama/llama-3.3-70b-instruct",
    "qwen/qwen3-32b",
  ],
  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
  ollama: ["llama3", "mistral"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"],
};

function getModels(req, res) {
  res.json({
    models,
    providers: Object.keys(models),
  });
}

function setProvider(req, res) {
  const { provider } = req.body;
  if (!models[provider]) {
    return res.status(400).json({
      success: false,
      message: "Invalid provider",
    });
  }
  res.json({ success: true, provider });
}

module.exports = {
  getModels,
  setProvider,
  getCurrentProvider: () => "openrouter",
};
