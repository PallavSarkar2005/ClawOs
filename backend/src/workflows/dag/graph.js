/**
 * DAG utilities — topological waves, cycle detection, adjacency.
 */

function normalizeDefinition(definition = {}) {
  const nodes = Array.isArray(definition.nodes) ? definition.nodes : [];
  const edges = Array.isArray(definition.edges) ? definition.edges : [];
  const groups = Array.isArray(definition.groups) ? definition.groups : [];
  return {
    ...definition,
    nodes: nodes.map((n) => ({
      id: n.id || n.nodeKey || n.key,
      type: n.type,
      label: n.label || n.type || "",
      config: n.config || n.data?.config || {},
      position: n.position || { x: n.positionX || 0, y: n.positionY || 0 },
      groupId: n.groupId || null,
      retryPolicy: n.retryPolicy || {},
      timeoutMs: n.timeoutMs,
      data: n.data || {},
    })),
    edges: edges.map((e) => ({
      id: e.id || e.edgeKey || `${e.source}-${e.target}`,
      source: e.source || e.sourceKey || e.from,
      target: e.target || e.targetKey || e.to,
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
      label: e.label || null,
      condition: e.condition || e.data?.condition || null,
      data: e.data || {},
    })),
    groups,
    viewport: definition.viewport || { x: 0, y: 0, zoom: 1 },
  };
}

function buildAdjacency(definition) {
  const def = normalizeDefinition(definition);
  const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
  const outgoing = new Map();
  const incoming = new Map();
  for (const n of def.nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }
  for (const e of def.edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    outgoing.get(e.source).push(e);
    incoming.get(e.target).push(e);
  }
  return { def, nodeMap, outgoing, incoming };
}

function detectCycles(definition) {
  const { def, outgoing } = buildAdjacency(definition);
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map(def.nodes.map((n) => [n.id, WHITE]));
  const cycles = [];

  function dfs(u, path) {
    color.set(u, GRAY);
    path.push(u);
    for (const e of outgoing.get(u) || []) {
      const v = e.target;
      if (color.get(v) === GRAY) {
        const idx = path.indexOf(v);
        cycles.push(path.slice(idx).concat(v));
      } else if (color.get(v) === WHITE) {
        dfs(v, path);
      }
    }
    path.pop();
    color.set(u, BLACK);
  }

  for (const n of def.nodes) {
    if (color.get(n.id) === WHITE) dfs(n.id, []);
  }
  return cycles;
}

function topologicalWaves(definition) {
  const { def, outgoing, incoming } = buildAdjacency(definition);
  const indegree = new Map();
  for (const n of def.nodes) {
    indegree.set(n.id, (incoming.get(n.id) || []).length);
  }
  const waves = [];
  const remaining = new Set(def.nodes.map((n) => n.id));
  let safety = def.nodes.length + 2;

  while (remaining.size && safety-- > 0) {
    const wave = [...remaining].filter((id) => indegree.get(id) === 0);
    if (!wave.length) break;
    waves.push(wave);
    for (const id of wave) {
      remaining.delete(id);
      for (const e of outgoing.get(id) || []) {
        indegree.set(e.target, indegree.get(e.target) - 1);
      }
    }
  }

  return { waves, remaining: [...remaining], hasCycle: remaining.size > 0 };
}

function getStartNodes(definition) {
  const { def, incoming } = buildAdjacency(definition);
  const starts = def.nodes.filter((n) => n.type === "start");
  if (starts.length) return starts.map((n) => n.id);
  return def.nodes.filter((n) => (incoming.get(n.id) || []).length === 0).map((n) => n.id);
}

function getReadyNodes(definition, completedSet, skippedSet = new Set()) {
  const { def, incoming } = buildAdjacency(definition);
  const done = new Set([...completedSet, ...skippedSet]);
  return def.nodes
    .filter((n) => !done.has(n.id))
    .filter((n) => {
      const preds = incoming.get(n.id) || [];
      if (!preds.length) return true;
      return preds.every((e) => done.has(e.source));
    })
    .map((n) => n.id);
}

function getSuccessors(definition, nodeId, handle = null) {
  const { outgoing } = buildAdjacency(definition);
  let edges = outgoing.get(nodeId) || [];
  if (handle != null) {
    edges = edges.filter((e) => !e.sourceHandle || e.sourceHandle === handle);
  }
  return edges;
}

module.exports = {
  normalizeDefinition,
  buildAdjacency,
  detectCycles,
  topologicalWaves,
  getStartNodes,
  getReadyNodes,
  getSuccessors,
};
