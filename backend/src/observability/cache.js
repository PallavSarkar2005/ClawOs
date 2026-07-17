/**
 * Simple TTL cache for dashboard/metrics queries.
 */

class TtlCache {
  constructor({ defaultTtlMs = 15_000, maxEntries = 200 } = {}) {
    this.defaultTtlMs = defaultTtlMs;
    this.maxEntries = maxEntries;
    this.map = new Map();
  }

  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    if (this.map.size >= this.maxEntries) {
      const first = this.map.keys().next().value;
      this.map.delete(first);
    }
    this.map.set(key, { value, expires: Date.now() + ttlMs });
    return value;
  }

  async getOrSet(key, fn, ttlMs) {
    const hit = this.get(key);
    if (hit !== undefined) return hit;
    const value = await fn();
    return this.set(key, value, ttlMs);
  }

  invalidate(prefix) {
    if (!prefix) {
      this.map.clear();
      return;
    }
    for (const key of this.map.keys()) {
      if (String(key).startsWith(prefix)) this.map.delete(key);
    }
  }
}

const queryCache = new TtlCache({ defaultTtlMs: 10_000, maxEntries: 300 });

module.exports = { TtlCache, queryCache };
