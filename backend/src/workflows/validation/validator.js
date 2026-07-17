const { NODE_TYPES } = require("../constants");
const { normalizeDefinition, detectCycles, topologicalWaves, getStartNodes } = require("../dag/graph");

const AGENT_TYPES = new Set([
  NODE_TYPES.RESEARCH_AGENT,
  NODE_TYPES.ARCHITECT_AGENT,
  NODE_TYPES.CODER_AGENT,
  NODE_TYPES.REVIEWER_AGENT,
  NODE_TYPES.TESTER_AGENT,
  NODE_TYPES.COORDINATOR,
]);

function validateDefinition(definition) {
  const errors = [];
  const warnings = [];
  const def = normalizeDefinition(definition || {});

  if (!def.nodes.length) {
    errors.push({ code: "NO_NODES", message: "Workflow must contain at least one node" });
    return { ok: false, errors, warnings, definition: def };
  }

  const ids = new Set();
  for (const n of def.nodes) {
    if (!n.id) errors.push({ code: "NODE_NO_ID", message: "Node missing id" });
    if (ids.has(n.id)) errors.push({ code: "DUPLICATE_NODE", message: `Duplicate node id: ${n.id}` });
    ids.add(n.id);
    if (!n.type) errors.push({ code: "NODE_NO_TYPE", message: `Node ${n.id} missing type` });
    else if (!Object.values(NODE_TYPES).includes(n.type) && !AGENT_TYPES.has(n.type)) {
      warnings.push({ code: "UNKNOWN_TYPE", message: `Unknown node type: ${n.type}` });
    }
  }

  for (const e of def.edges) {
    if (!ids.has(e.source)) errors.push({ code: "BAD_EDGE_SOURCE", message: `Edge source missing: ${e.source}` });
    if (!ids.has(e.target)) errors.push({ code: "BAD_EDGE_TARGET", message: `Edge target missing: ${e.target}` });
    if (e.source === e.target) errors.push({ code: "SELF_EDGE", message: `Self-loop on ${e.source}` });
  }

  const cycles = detectCycles(def);
  if (cycles.length) {
    // Loops are allowed via loop nodes — only flag non-loop cycles as errors if no loop node on cycle
    for (const cycle of cycles) {
      const hasLoop = cycle.some((id) => {
        const n = def.nodes.find((x) => x.id === id);
        return n && n.type === NODE_TYPES.LOOP;
      });
      if (!hasLoop) {
        errors.push({
          code: "CYCLE",
          message: `Cycle detected without loop node: ${cycle.join(" → ")}`,
        });
      }
    }
  }

  const starts = getStartNodes(def);
  if (!starts.length) {
    errors.push({ code: "NO_START", message: "Workflow needs a start node or root node" });
  }

  const ends = def.nodes.filter((n) => n.type === NODE_TYPES.END);
  if (!ends.length) {
    warnings.push({ code: "NO_END", message: "Workflow has no end node" });
  }

  const { hasCycle, remaining } = topologicalWaves(def);
  if (hasCycle && remaining.length) {
    const loopNodes = def.nodes.filter((n) => n.type === NODE_TYPES.LOOP).map((n) => n.id);
    const unexplained = remaining.filter((id) => !loopNodes.includes(id));
    if (unexplained.length && !loopNodes.length) {
      errors.push({
        code: "UNREACHABLE_CYCLE",
        message: `Nodes in cycle: ${unexplained.join(", ")}`,
      });
    }
  }

  for (const n of def.nodes) {
    if (n.type === NODE_TYPES.CONDITION && !n.config?.expression && !n.config?.condition) {
      warnings.push({ code: "CONDITION_EMPTY", message: `Condition node ${n.id} has no expression` });
    }
    if (n.type === NODE_TYPES.HTTP && !n.config?.url) {
      warnings.push({ code: "HTTP_NO_URL", message: `HTTP node ${n.id} missing url` });
    }
    if (n.type === NODE_TYPES.CUSTOM_SCRIPT && !n.config?.code && !n.config?.script) {
      warnings.push({ code: "SCRIPT_EMPTY", message: `Script node ${n.id} has no code` });
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    definition: def,
  };
}

module.exports = { validateDefinition, AGENT_TYPES };
