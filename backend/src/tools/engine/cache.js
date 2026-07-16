/**
 * Result cache for idempotent / read-only tool calls.
 */

class ToolCache {
  constructor({ maxEntries = 500 } = {}) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, { value: any, expiresAt: number }>} */
    this.store = new Map();
  }

  key(toolId, args, ctx) {
    const scope = `${ctx?.userId || ""}:${ctx?.projectId || ""}`;
    return `${toolId}::${scope}::${stableStringify(args || {})}`;
  }

  get(toolId, args, ctx) {
    const k = this.key(toolId, args, ctx);
    const entry = this.store.get(k);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(k);
      return undefined;
    }
    // LRU touch
    this.store.delete(k);
    this.store.set(k, entry);
    return entry.value;
  }

  set(toolId, args, ctx, value, ttlMs) {
    if (!ttlMs || ttlMs <= 0) return;
    const k = this.key(toolId, args, ctx);
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      this.store.delete(oldest);
    }
    this.store.set(k, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(prefix) {
    if (!prefix) {
      this.store.clear();
      return;
    }
    for (const k of this.store.keys()) {
      if (k.startsWith(prefix)) this.store.delete(k);
    }
  }

  clear() {
    this.store.clear();
  }
}

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

const toolCache = new ToolCache();

module.exports = { ToolCache, toolCache, stableStringify };
