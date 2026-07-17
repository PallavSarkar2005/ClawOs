/**
 * Live indexing watcher — incremental re-index on project file changes.
 */

const { reindexFile, ensureRepository } = require("./indexer");
const workspaceMemory = require("./memory/workspace-memory");

/** @type {Map<string, { timer: NodeJS.Timeout, ownerId: string, projectId: string }>} */
const pending = new Map();
const DEBOUNCE_MS = 1500;
let started = false;

function startWatcher() {
  started = true;
  return { started: true };
}

function stopWatcher() {
  for (const [, entry] of pending) clearTimeout(entry.timer);
  pending.clear();
  started = false;
}

/**
 * Called when a project file is created/updated/deleted.
 */
function notifyFileChange(projectId, ownerId, filePath, changeType = "update") {
  if (!started || !projectId || !ownerId) return;
  const key = `${projectId}:${filePath || "*"}`;
  const existing = pending.get(key);
  if (existing) clearTimeout(existing.timer);

  const timer = setTimeout(async () => {
    pending.delete(key);
    try {
      const repo = await ensureRepository(projectId, ownerId);
      if (filePath) await workspaceMemory.recordEdit(repo.id, filePath, { changeType });
      await reindexFile(projectId, ownerId, filePath);
      try {
        const { fireByType } = require("../workflows/triggers/manager");
        await fireByType(ownerId, "file_change", { projectId, path: filePath }, {
          inputs: { projectId, path: filePath, changeType },
        });
        await fireByType(ownerId, "repository_change", { projectId, repositoryId: repo.id }, {
          inputs: { projectId, path: filePath, changeType },
        });
      } catch {
        /* workflow triggers optional */
      }
    } catch (err) {
      console.warn("[intelligence] incremental reindex:", err.message);
    }
  }, DEBOUNCE_MS);

  pending.set(key, { timer, ownerId, projectId });
}

module.exports = {
  startWatcher,
  stopWatcher,
  notifyFileChange,
};
