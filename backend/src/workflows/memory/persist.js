/**
 * Sync definition JSON ↔ WorkflowNode / WorkflowEdge rows.
 */
const prisma = require("../../database/prisma");
const { normalizeDefinition } = require("../dag/graph");

async function syncDefinitionToRows(workflowId, definition) {
  const def = normalizeDefinition(definition);
  await prisma.$transaction([
    prisma.workflowNode.deleteMany({ where: { workflowId } }),
    prisma.workflowEdge.deleteMany({ where: { workflowId } }),
  ]);

  if (def.nodes.length) {
    await prisma.workflowNode.createMany({
      data: def.nodes.map((n) => ({
        workflowId,
        nodeKey: n.id,
        type: n.type,
        label: n.label || "",
        config: n.config || {},
        positionX: n.position?.x || 0,
        positionY: n.position?.y || 0,
        groupId: n.groupId || null,
        retryPolicy: n.retryPolicy || {},
        timeoutMs: n.timeoutMs || null,
        metadata: n.data || {},
      })),
    });
  }

  if (def.edges.length) {
    await prisma.workflowEdge.createMany({
      data: def.edges.map((e) => ({
        workflowId,
        edgeKey: e.id,
        sourceKey: e.source,
        targetKey: e.target,
        sourceHandle: e.sourceHandle || null,
        targetHandle: e.targetHandle || null,
        label: e.label || null,
        condition: e.condition || null,
        metadata: e.data || {},
      })),
    });
  }

  return def;
}

function definitionFromRows(nodes = [], edges = [], extra = {}) {
  return normalizeDefinition({
    nodes: nodes.map((n) => ({
      id: n.nodeKey,
      type: n.type,
      label: n.label,
      config: n.config,
      position: { x: n.positionX, y: n.positionY },
      groupId: n.groupId,
      retryPolicy: n.retryPolicy,
      timeoutMs: n.timeoutMs,
    })),
    edges: edges.map((e) => ({
      id: e.edgeKey,
      source: e.sourceKey,
      target: e.targetKey,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
      condition: e.condition,
    })),
    ...extra,
  });
}

/**
 * Simple auto-layout: layered by topological waves.
 */
function autoLayout(definition) {
  const { topologicalWaves } = require("../dag/graph");
  const def = normalizeDefinition(definition);
  const { waves } = topologicalWaves(def);
  const nodePos = new Map();
  waves.forEach((wave, wi) => {
    wave.forEach((id, ni) => {
      nodePos.set(id, { x: 80 + wi * 220, y: 80 + ni * 120 });
    });
  });
  // orphans
  for (const n of def.nodes) {
    if (!nodePos.has(n.id)) nodePos.set(n.id, { x: 80, y: 80 + nodePos.size * 100 });
  }
  return {
    ...def,
    nodes: def.nodes.map((n) => ({
      ...n,
      position: nodePos.get(n.id) || n.position,
    })),
  };
}

module.exports = {
  syncDefinitionToRows,
  definitionFromRows,
  autoLayout,
};
