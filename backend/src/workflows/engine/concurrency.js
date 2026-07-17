/**
 * Concurrency control + rate limiting for workflow executions.
 */

class ConcurrencyController {
  constructor({ maxGlobal = 10, maxPerUser = 3, rateLimitPerMinute = 60 } = {}) {
    this.maxGlobal = maxGlobal;
    this.maxPerUser = maxPerUser;
    this.rateLimitPerMinute = rateLimitPerMinute;
    this.active = new Map(); // executionId -> { userId, startedAt }
    this.userCounts = new Map();
    this.rateBuckets = new Map(); // userId -> timestamps[]
  }

  canStart(userId) {
    if (this.active.size >= this.maxGlobal) return { ok: false, reason: "global_limit" };
    const uc = this.userCounts.get(userId) || 0;
    if (uc >= this.maxPerUser) return { ok: false, reason: "user_limit" };
    if (!this.checkRate(userId)) return { ok: false, reason: "rate_limit" };
    return { ok: true };
  }

  checkRate(userId) {
    const now = Date.now();
    const windowMs = 60_000;
    let bucket = this.rateBuckets.get(userId) || [];
    bucket = bucket.filter((t) => now - t < windowMs);
    this.rateBuckets.set(userId, bucket);
    return bucket.length < this.rateLimitPerMinute;
  }

  acquire(executionId, userId) {
    const check = this.canStart(userId);
    if (!check.ok) return check;
    this.active.set(executionId, { userId, startedAt: Date.now() });
    this.userCounts.set(userId, (this.userCounts.get(userId) || 0) + 1);
    const bucket = this.rateBuckets.get(userId) || [];
    bucket.push(Date.now());
    this.rateBuckets.set(userId, bucket);
    return { ok: true };
  }

  release(executionId) {
    const info = this.active.get(executionId);
    if (!info) return;
    this.active.delete(executionId);
    const uc = (this.userCounts.get(info.userId) || 1) - 1;
    if (uc <= 0) this.userCounts.delete(info.userId);
    else this.userCounts.set(info.userId, uc);
  }

  stats() {
    return {
      active: this.active.size,
      maxGlobal: this.maxGlobal,
      users: Object.fromEntries(this.userCounts),
    };
  }
}

class WorkerPool {
  constructor(concurrency = 4) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
  }

  run(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._pump();
    });
  }

  async runAll(fns) {
    return Promise.all(fns.map((fn) => this.run(fn)));
  }

  _pump() {
    while (this.running < this.concurrency && this.queue.length) {
      const item = this.queue.shift();
      this.running += 1;
      Promise.resolve()
        .then(() => item.fn())
        .then(item.resolve, item.reject)
        .finally(() => {
          this.running -= 1;
          this._pump();
        });
    }
  }
}

module.exports = { ConcurrencyController, WorkerPool };
