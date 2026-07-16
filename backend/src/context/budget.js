const { MODEL_LIMITS, DEFAULT_BUDGET_SPLIT } = require("./constants");
const { estimateTokens } = require("../runtime/token");

function resolveModelLimit(model, override) {
  if (Number.isFinite(override) && override > 0) return Math.floor(override);
  if (model && MODEL_LIMITS[model]) return MODEL_LIMITS[model];
  return MODEL_LIMITS.default;
}

/**
 * Allocate token budgets so system + planner + tools + retrieved + conversation + response
 * never exceed the model context window.
 */
function allocateBudget(options = {}) {
  const modelLimit = resolveModelLimit(options.model, options.modelLimit);
  const safetyMargin = Math.floor(modelLimit * (options.safetyMargin ?? 0.05));
  const usable = Math.max(512, modelLimit - safetyMargin);

  const requested = Number(options.tokenBudget) || Math.min(usable, options.maxPack || 8000);
  const packBudget = Math.min(requested, usable);

  const split = { ...DEFAULT_BUDGET_SPLIT, ...(options.split || {}) };
  const sum = Object.values(split).reduce((a, b) => a + b, 0) || 1;
  const normalized = Object.fromEntries(
    Object.entries(split).map(([k, v]) => [k, v / sum]),
  );

  const allocation = {};
  let assigned = 0;
  const keys = Object.keys(normalized);
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (i === keys.length - 1) {
      allocation[key] = Math.max(64, packBudget - assigned);
    } else {
      allocation[key] = Math.max(64, Math.floor(packBudget * normalized[key]));
      assigned += allocation[key];
    }
  }

  return {
    model: options.model || "default",
    modelLimit,
    safetyMargin,
    usable,
    packBudget,
    allocation,
    neverExceed: modelLimit,
  };
}

function fitToAllocation(sections, allocation, packBudget) {
  const packed = [];
  const dropped = [];
  let used = 0;

  const ordered = [...sections].sort((a, b) => (b.priority || 0) - (a.priority || 0));

  for (const section of ordered) {
    const slot = section.slot || "retrieved";
    const slotBudget = allocation[slot] ?? allocation.retrieved ?? packBudget;
    const remaining = Math.min(slotBudget, packBudget - used);
    if (remaining <= 0) {
      dropped.push({
        label: section.label,
        source: section.source,
        reason: "token_budget_exhausted",
        tokens: estimateTokens(section.text),
      });
      continue;
    }

    const tokens = estimateTokens(section.text);
    let text = section.text || "";
    let usedTokens = tokens;
    if (tokens > remaining) {
      const chars = Math.max(40, remaining * 4);
      text = `${String(text).slice(0, chars)}…`;
      usedTokens = remaining;
      dropped.push({
        label: section.label,
        source: section.source,
        reason: "section_truncated",
        tokens: tokens - remaining,
      });
    }

    if (!text) continue;
    packed.push({
      ...section,
      text,
      tokens: usedTokens,
      slot,
    });
    used += usedTokens;
  }

  return { sections: packed, usedTokens: used, dropped };
}

module.exports = {
  resolveModelLimit,
  allocateBudget,
  fitToAllocation,
  estimateTokens,
};
