/**
 * Tool Platform bootstrap — register builtins, plugins, MCP; expose public API.
 */

const { defineTool, toOpenAiSchema, ok, fail } = require("./sdk/define-tool");
const { registry } = require("./engine/registry");
const { executeTool, executeParallel, cancelExecution, cancelAll, getActiveExecutions } = require("./engine/executor");
const { toolCache } = require("./engine/cache");
const { checkPermissions, hasPermission, expandPermissions } = require("./engine/permissions");
const obs = require("./engine/observability");
const { loadPluginsDir, watchPlugins, loadPlugin } = require("./plugins/loader");
const {
  connectMcpServer,
  disconnectMcpServer,
  listMcpServers,
  autoDiscoverFromEnv,
} = require("./mcp/client");

const { filesystemTools } = require("./categories/filesystem.tools");
const { terminalTools } = require("./categories/terminal.tools");
const { gitTools } = require("./categories/git.tools");
const { workspaceTools } = require("./categories/workspace.tools");
const { memoryTools } = require("./categories/memory.tools");
const { documentsTools } = require("./categories/documents.tools");
const { browserTools } = require("./categories/browser.tools");
const { previewTools } = require("./categories/preview.tools");

let initialized = false;
let watcher = null;

function registerBuiltins() {
  const all = [
    ...filesystemTools,
    ...terminalTools,
    ...gitTools,
    ...workspaceTools,
    ...memoryTools,
    ...documentsTools,
    ...browserTools,
    ...previewTools,
  ];
  registry.registerMany(all);
  return all.length;
}

async function syncToolsToDb() {
  for (const tool of registry.list({ enabledOnly: false })) {
    await obs.upsertToolRow(tool);
  }
}

/**
 * Initialize the tool platform (idempotent).
 */
async function initToolPlatform({ hotReload = true, loadMcp = true } = {}) {
  if (!initialized) {
    registerBuiltins();
    initialized = true;
  }

  let plugins = [];
  try {
    plugins = await loadPluginsDir();
  } catch (e) {
    console.warn("[tools] plugin load:", e.message);
  }

  let mcp = [];
  if (loadMcp) {
    try {
      mcp = await autoDiscoverFromEnv();
    } catch (e) {
      console.warn("[tools] MCP discover:", e.message);
    }
  }

  if (hotReload && !watcher) {
    try {
      watcher = watchPlugins();
    } catch (e) {
      console.warn("[tools] hot-reload watch:", e.message);
    }
  }

  // Best-effort DB sync
  syncToolsToDb().catch(() => {});

  console.log(
    `[tools] platform ready — ${registry.list().length} tools, ${plugins.length} plugins, ${mcp.length} MCP`,
  );

  return {
    toolCount: registry.list().length,
    plugins,
    mcp,
    catalog: registry.catalog(),
  };
}

function getToolSchemas(names) {
  ensureInit();
  return registry.getOpenAiSchemas(names);
}

function listTools() {
  ensureInit();
  return registry.list().map((t) => t.id);
}

function ensureInit() {
  if (!initialized) registerBuiltins();
}

module.exports = {
  // SDK
  defineTool,
  toOpenAiSchema,
  ok,
  fail,
  // Registry
  registry,
  // Execution
  executeTool,
  executeParallel,
  cancelExecution,
  cancelAll,
  getActiveExecutions,
  // Schemas (compat with runtime/tools)
  getToolSchemas,
  listTools,
  // Cache / perms
  toolCache,
  checkPermissions,
  hasPermission,
  expandPermissions,
  // Plugins / MCP
  loadPlugin,
  loadPluginsDir,
  connectMcpServer,
  disconnectMcpServer,
  listMcpServers,
  // Lifecycle
  initToolPlatform,
  registerBuiltins,
  syncToolsToDb,
};
