/**
 * Tool Registry — dynamic registration, discovery, hot reload.
 * Supports: built-in tools, plugins, MCP servers, external tools.
 */

const EventEmitter = require("events");
const { toOpenAiSchema } = require("../sdk/define-tool");

class ToolRegistry extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, object>} */
    this.tools = new Map();
    /** @type {Map<string, string>} alias → id */
    this.aliases = new Map();
    /** @type {Map<string, Set<string>>} category → tool ids */
    this.categories = new Map();
    this.version = 0;
  }

  register(tool) {
    if (!tool?.id) throw new Error("Cannot register tool without id");
    const prev = this.tools.get(tool.id);
    this.tools.set(tool.id, tool);

    for (const alias of tool.aliases || []) {
      this.aliases.set(alias, tool.id);
    }
    // Also allow OpenAI-style underscore names
    this.aliases.set(tool.id.replace(/\./g, "_"), tool.id);
    // Category short name only if unique later — handled in resolve

    if (!this.categories.has(tool.category)) {
      this.categories.set(tool.category, new Set());
    }
    this.categories.get(tool.category).add(tool.id);

    this.version += 1;
    this.emit(prev ? "updated" : "registered", tool);
    return tool;
  }

  registerMany(tools) {
    for (const t of tools) this.register(t);
    return tools.length;
  }

  unregister(id) {
    const tool = this.tools.get(id);
    if (!tool) return false;
    this.tools.delete(id);
    for (const [alias, target] of this.aliases) {
      if (target === id) this.aliases.delete(alias);
    }
    this.categories.get(tool.category)?.delete(id);
    this.version += 1;
    this.emit("unregistered", tool);
    return true;
  }

  unregisterBySource(source, pluginId = null) {
    const removed = [];
    for (const [id, tool] of this.tools) {
      if (tool.source !== source) continue;
      if (pluginId && tool.pluginId !== pluginId) continue;
      this.unregister(id);
      removed.push(id);
    }
    return removed;
  }

  get(idOrAlias) {
    if (!idOrAlias) return null;
    if (this.tools.has(idOrAlias)) return this.tools.get(idOrAlias);
    const viaAlias = this.aliases.get(idOrAlias);
    if (viaAlias) return this.tools.get(viaAlias) || null;
    // Try underscore ↔ dot
    const dotted = String(idOrAlias).replace(/_/g, ".");
    if (this.tools.has(dotted)) return this.tools.get(dotted);
    return null;
  }

  has(idOrAlias) {
    return Boolean(this.get(idOrAlias));
  }

  list({ category, source, enabledOnly = true } = {}) {
    let tools = [...this.tools.values()];
    if (enabledOnly) tools = tools.filter((t) => t.enabled !== false);
    if (category) tools = tools.filter((t) => t.category === category);
    if (source) tools = tools.filter((t) => t.source === source);
    return tools.sort((a, b) => a.id.localeCompare(b.id));
  }

  listByCategories(categories = []) {
    if (!categories?.length) return this.list();
    const set = new Set(categories);
    // Expand: "filesystem" → all filesystem.* tools; also include exact id match
    return this.list().filter(
      (t) => set.has(t.category) || set.has(t.id) || set.has(t.id.replace(/\./g, "_")),
    );
  }

  /**
   * Resolve agent tool allowlist (categories and/or tool ids) to OpenAI schemas.
   * Prefer category composite tools (id === category) to keep LLM schemas compact;
   * fall back to all tools in the category when no composite exists.
   */
  getOpenAiSchemas(allowlist) {
    if (!allowlist || allowlist === "all") {
      // Prefer composites for catalog compactness
      const composites = this.list().filter((t) => t.id === t.category);
      if (composites.length) return composites.map(toOpenAiSchema);
      return this.list().map(toOpenAiSchema);
    }
    const names = Array.isArray(allowlist) ? allowlist : [allowlist];
    const selected = [];
    const seen = new Set();
    for (const name of names) {
      const exact = this.get(name);
      if (exact && !seen.has(exact.id)) {
        selected.push(exact);
        seen.add(exact.id);
        continue;
      }
      const composite = this.tools.get(name);
      if (composite && !seen.has(composite.id)) {
        selected.push(composite);
        seen.add(composite.id);
        continue;
      }
      for (const t of this.listByCategories([name])) {
        if (t.id === name || t.category === name) {
          // Prefer composite (id === category)
          if (t.id === t.category && !seen.has(t.id)) {
            selected.push(t);
            seen.add(t.id);
          }
        }
      }
      // If nothing selected for this name, add all category tools
      if (![...seen].some((id) => this.get(id)?.category === name || id === name)) {
        for (const t of this.listByCategories([name])) {
          if (!seen.has(t.id)) {
            selected.push(t);
            seen.add(t.id);
          }
        }
      }
    }
    return selected.map(toOpenAiSchema);
  }

  /**
   * Metadata for API / UI discovery.
   */
  describe(idOrAlias) {
    const tool = this.get(idOrAlias);
    if (!tool) return null;
    return {
      id: tool.id,
      name: tool.name,
      description: tool.description,
      category: tool.category,
      version: tool.version,
      permissions: tool.permissions,
      timeout: tool.timeout,
      retries: tool.retries,
      schema: tool.schema,
      cacheable: tool.cacheable,
      dangerous: tool.dangerous,
      source: tool.source,
      pluginId: tool.pluginId,
      mcpServerId: tool.mcpServerId,
      enabled: tool.enabled,
      aliases: tool.aliases,
    };
  }

  catalog() {
    const byCategory = {};
    for (const tool of this.list()) {
      if (!byCategory[tool.category]) byCategory[tool.category] = [];
      byCategory[tool.category].push(this.describe(tool.id));
    }
    return {
      version: this.version,
      count: this.tools.size,
      categories: Object.keys(byCategory).sort(),
      tools: byCategory,
    };
  }

  clear() {
    this.tools.clear();
    this.aliases.clear();
    this.categories.clear();
    this.version += 1;
    this.emit("cleared");
  }
}

const registry = new ToolRegistry();

module.exports = {
  ToolRegistry,
  registry,
};
