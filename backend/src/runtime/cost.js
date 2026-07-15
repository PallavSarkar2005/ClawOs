const { COST_PER_1K } = require("./constants");

function estimateCost(promptTokens = 0, completionTokens = 0, rates = COST_PER_1K) {
  return (
    (promptTokens / 1000) * (rates.prompt || 0) +
    (completionTokens / 1000) * (rates.completion || 0)
  );
}

module.exports = { estimateCost };
