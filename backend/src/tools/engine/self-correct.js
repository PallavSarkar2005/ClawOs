/**
 * Self-correction — on tool failure: inspect, retry, repair args, try alternative.
 */

const { validateAgainstSchema } = require("../sdk/define-tool");

const ALTERNATIVES = {
  "filesystem.read": ["workspace.files", "workspace.get_file"],
  "filesystem.write": ["filesystem.edit"],
  "filesystem.search": ["workspace.search", "memory.search"],
  "browser.fetch": ["browser.extract", "search.web"],
  "browser.crawl": ["browser.fetch", "search.web"],
  "documents.search": ["memory.search", "workspace.search"],
  "memory.search": ["documents.search"],
  "git.push": ["git.status"],
  "git.pull": ["git.fetch", "git.status"],
  "terminal.execute": ["terminal.history"],
  "preview.start": ["preview.health"],
};

function tryParseJson(raw) {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Attempt to repair common argument mistakes.
 */
function repairArguments(tool, args, error) {
  const next = { ...(args || {}) };
  const msg = String(error?.message || error || "").toLowerCase();
  const schema = tool.schema || {};
  const props = schema.properties || {};

  // Coerce string numbers
  for (const [key, prop] of Object.entries(props)) {
    if (prop.type === "number" && typeof next[key] === "string" && next[key].trim() !== "") {
      const n = Number(next[key]);
      if (!Number.isNaN(n)) next[key] = n;
    }
    if (prop.type === "boolean" && typeof next[key] === "string") {
      if (next[key] === "true") next[key] = true;
      if (next[key] === "false") next[key] = false;
    }
    if (prop.type === "array" && typeof next[key] === "string") {
      const parsed = tryParseJson(next[key]);
      if (Array.isArray(parsed)) next[key] = parsed;
      else if (next[key].includes(",")) next[key] = next[key].split(",").map((s) => s.trim());
    }
  }

  // Path normalization
  if (typeof next.path === "string") {
    next.path = next.path.replace(/^[/\\]+/, "").replace(/\\/g, "/");
  }

  // Missing action with enum default
  if (props.action?.enum?.length && !next.action) {
    next.action = props.action.enum[0];
  }

  // If content was nested in wrong field
  if (props.content && !next.content && next.text) {
    next.content = next.text;
  }
  if (props.query && !next.query && next.q) {
    next.query = next.q;
  }

  // Enum fuzzy match
  for (const [key, prop] of Object.entries(props)) {
    if (prop.enum && next[key] && !prop.enum.includes(next[key])) {
      const lower = String(next[key]).toLowerCase();
      const match = prop.enum.find((e) => String(e).toLowerCase() === lower);
      if (match) next[key] = match;
    }
  }

  if (msg.includes("required") || msg.includes("missing")) {
    const errors = validateAgainstSchema(schema, next);
    // Already attempted repairs; return next anyway
    void errors;
  }

  return next;
}

function suggestAlternatives(toolId) {
  return ALTERNATIVES[toolId] || [];
}

/**
 * Decide whether a failure is worth retrying / repairing.
 */
function shouldSelfCorrect(result, error) {
  const code = result?.code || error?.code || "";
  if (code === "PERMISSION_DENIED" || code === "CANCELLED" || code === "ABORT") return false;
  if (code === "PATH_ESCAPE" || code === "BLOCKED") return false;
  if (code === "NO_WORKSPACE" || code === "NO_PROJECT" || code === "NOT_FOUND") return false;
  if (code === "UNKNOWN_TOOL") return true;
  if (code === "BAD_ARGS" || code === "VALIDATION_ERROR") return true;
  if (code === "TIMEOUT") return true;
  if (result && result.ok === false) return true;
  if (error) return true;
  return false;
}

module.exports = {
  ALTERNATIVES,
  repairArguments,
  suggestAlternatives,
  shouldSelfCorrect,
};
