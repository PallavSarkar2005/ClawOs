/**
 * Workspace memory — evolution, edits, tabs, debt, decisions.
 */

const prisma = require("../../database/prisma");

async function upsertMemory(repositoryId, kind, key, value, importance = 0.5) {
  return prisma.workspaceMemory.upsert({
    where: { repositoryId_kind_key: { repositoryId, kind, key } },
    create: { repositoryId, kind, key, value, importance },
    update: { value, importance },
  });
}

async function recordIndex(repositoryId, stats) {
  await upsertMemory(repositoryId, "evolution", `index:${Date.now()}`, stats, 0.4);
  await upsertMemory(repositoryId, "evolution", "latest_index", stats, 0.8);
}

async function recordEdit(repositoryId, filePath, meta = {}) {
  const key = `edit:${filePath}`;
  const existing = await prisma.workspaceMemory.findUnique({
    where: { repositoryId_kind_key: { repositoryId, kind: "recent_edit", key } },
  });
  const count = (existing?.value?.count || 0) + 1;
  await upsertMemory(
    repositoryId,
    "recent_edit",
    key,
    { path: filePath, count, lastEditedAt: new Date().toISOString(), ...meta },
    Math.min(1, 0.3 + count * 0.05),
  );
  await upsertMemory(
    repositoryId,
    "frequent_file",
    filePath,
    { path: filePath, count, lastEditedAt: new Date().toISOString() },
    Math.min(1, count * 0.1),
  );
}

async function recordOpenTabs(repositoryId, tabs = []) {
  await upsertMemory(repositoryId, "open_tabs", "current", { tabs, at: new Date().toISOString() }, 0.6);
}

async function recordDecision(repositoryId, decision) {
  const key = `adr:${Date.now()}`;
  await upsertMemory(repositoryId, "architecture_decision", key, decision, 0.9);
}

async function recordRefactor(repositoryId, refactor) {
  await upsertMemory(repositoryId, "refactor_history", `ref:${Date.now()}`, refactor, 0.7);
}

async function recordTechDebt(repositoryId, debtItems = []) {
  await upsertMemory(repositoryId, "tech_debt", "current", { items: debtItems, at: new Date().toISOString() }, 0.75);
}

async function getMemory(repositoryId, kind = null) {
  const where = { repositoryId };
  if (kind) where.kind = kind;
  return prisma.workspaceMemory.findMany({
    where,
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 200,
  });
}

async function getWorkspaceContext(repositoryId) {
  const [recent, tabs, debt, decisions, evolution] = await Promise.all([
    getMemory(repositoryId, "recent_edit"),
    getMemory(repositoryId, "open_tabs"),
    getMemory(repositoryId, "tech_debt"),
    getMemory(repositoryId, "architecture_decision"),
    getMemory(repositoryId, "evolution"),
  ]);
  return {
    recentEdits: recent.slice(0, 20).map((m) => m.value),
    openTabs: tabs[0]?.value?.tabs || [],
    techDebt: debt[0]?.value?.items || [],
    decisions: decisions.slice(0, 20).map((m) => m.value),
    evolution: evolution.slice(0, 10).map((m) => m.value),
  };
}

module.exports = {
  upsertMemory,
  recordIndex,
  recordEdit,
  recordOpenTabs,
  recordDecision,
  recordRefactor,
  recordTechDebt,
  getMemory,
  getWorkspaceContext,
};
