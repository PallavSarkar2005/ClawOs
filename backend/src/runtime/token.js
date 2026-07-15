function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 4);
}

function estimateMessagesTokens(messages = []) {
  return messages.reduce((sum, m) => {
    return sum + estimateTokens(m.content) + estimateTokens(m.role) + 4;
  }, 0);
}

function truncateToBudget(text, budget) {
  const tokens = estimateTokens(text);
  if (tokens <= budget) return { text, tokens };
  const chars = Math.max(40, budget * 4);
  return { text: `${String(text).slice(0, chars)}…`, tokens: budget };
}

function packSections(sections, totalBudget) {
  const packed = [];
  let used = 0;
  for (const section of sections) {
    if (used >= totalBudget) break;
    const remaining = totalBudget - used;
    const result = truncateToBudget(section.text || "", Math.min(section.budget || remaining, remaining));
    if (!result.text) continue;
    packed.push({
      label: section.label,
      text: result.text,
      tokens: result.tokens,
    });
    used += result.tokens;
  }
  return { sections: packed, usedTokens: used };
}

module.exports = {
  estimateTokens,
  estimateMessagesTokens,
  truncateToBudget,
  packSections,
};
