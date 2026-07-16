/**
 * In-memory TTL cache for context retrieval results.
 * Supports incremental invalidation by user/project/conversation.
 */

class ContextCache {
  constructor({ maxEntries = 200, ttlMs = 60_000 } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  #key(parts) {
    return parts.filter((p) => p != null && p !== "").join("|");
  }

  get(parts) {
    const key = this.#key(parts);
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    hit.hits += 1;
    return hit.value;
  }

  set(parts, value, ttlMs = this.ttlMs) {
    if (this.store.size >= this.maxEntries) {
      // evict oldest
      const first = this.store.keys().next().value;
      this.store.delete(first);
    }
    const key = this.#key(parts);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
      createdAt: Date.now(),
    });
  }

  invalidate({ userId, projectId, conversationId } = {}) {
    for (const key of [...this.store.keys()]) {
      if (userId && key.includes(userId)) this.store.delete(key);
      else if (projectId && key.includes(projectId)) this.store.delete(key);
      else if (conversationId && key.includes(conversationId)) this.store.delete(key);
    }
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      ttlMs: this.ttlMs,
    };
  }
}

module.exports = new ContextCache();
module.exports.ContextCache = ContextCache;
