/**
 * Plugin loader — auto-discover and hot-reload tools from plugins directory.
 */

const fs = require("fs");
const path = require("path");
const { registry } = require("../engine/registry");
const obs = require("../engine/observability");

const DEFAULT_PLUGINS_DIR = path.join(__dirname, "../../../plugins");

/**
 * Load a single plugin module.
 * Plugin must export `{ id, name, tools: ToolDefinition[] }` or a function returning that.
 */
async function loadPlugin(pluginPath) {
  const abs = path.resolve(pluginPath);
  // Clear require cache for hot reload
  delete require.cache[require.resolve(abs)];
  // eslint-disable-next-line import/no-dynamic-require, global-require
  let mod = require(abs);
  if (typeof mod === "function") mod = await mod();
  if (mod.default) mod = mod.default;

  const pluginId = mod.id || path.basename(abs, path.extname(abs));
  const tools = mod.tools || [];

  // Unregister previous tools from this plugin
  registry.unregisterBySource("plugin", pluginId);

  const registered = [];
  for (const raw of tools) {
    const tool = {
      ...raw,
      source: "plugin",
      pluginId,
    };
    // Re-freeze via register (defineTool already applied by author)
    if (!tool.executor) throw new Error(`Plugin ${pluginId}: tool missing executor`);
    registry.register(Object.freeze({
      version: "1.0.0",
      permissions: [`${tool.category || "plugin"}:execute`],
      timeout: 30000,
      retries: 1,
      schema: { type: "object", properties: {}, required: [] },
      cacheable: false,
      aliases: [],
      dangerous: false,
      enabled: true,
      metadata: {},
      mcpServerId: null,
      ...tool,
      source: "plugin",
      pluginId,
    }));
    registered.push(tool.id);
    await obs.upsertToolRow(registry.get(tool.id));
  }

  return { pluginId, name: mod.name || pluginId, tools: registered, path: abs };
}

/**
 * Discover and load all plugins from a directory.
 */
async function loadPluginsDir(dir = DEFAULT_PLUGINS_DIR) {
  const results = [];
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    return results;
  }
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    let target = null;
    if (stat.isFile() && /\.(js|cjs|mjs)$/.test(entry)) target = full;
    else if (stat.isDirectory()) {
      const index = ["index.js", "plugin.js", "tools.js"]
        .map((f) => path.join(full, f))
        .find((f) => fs.existsSync(f));
      if (index) target = index;
    }
    if (!target) continue;
    try {
      results.push(await loadPlugin(target));
    } catch (e) {
      results.push({ path: target, error: e.message });
    }
  }
  return results;
}

/**
 * Watch plugins directory for hot reload without backend restart.
 */
function watchPlugins(dir = DEFAULT_PLUGINS_DIR, { debounceMs = 500 } = {}) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let timer = null;
  const watcher = fs.watch(dir, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const loaded = await loadPluginsDir(dir);
        console.log(`[tools] hot-reloaded plugins: ${loaded.length}`);
      } catch (e) {
        console.error("[tools] plugin hot-reload failed:", e.message);
      }
    }, debounceMs);
  });
  return watcher;
}

module.exports = {
  loadPlugin,
  loadPluginsDir,
  watchPlugins,
  DEFAULT_PLUGINS_DIR,
};
