const { DEFAULT_MAX_RETRIES } = require("./constants");

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(Object.assign(new Error("Aborted"), { code: "ABORT" }));
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Aborted"), { code: "ABORT" }));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

function isRetryable(error) {
  if (!error) return false;
  if (error.code === "ABORT" || error.code === "CANCELLED") return false;
  const status = error.status || error.response?.status;
  if (status === 429 || status >= 500) return true;
  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("timeout") ||
    msg.includes("temporarily") ||
    msg.includes("rate limit") ||
    msg.includes("econnreset") ||
    msg.includes("unavailable")
  );
}

/**
 * Retry with exponential backoff. Supports rollback via optional onRollback.
 */
async function withRetry(fn, options = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = 500,
    signal,
    onRetry,
    onRollback,
    shouldRetry = isRetryable,
  } = options;

  let lastError;
  let attempt = 0;

  while (attempt <= maxRetries) {
    if (signal?.aborted) {
      throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
    }
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxRetries || !shouldRetry(error)) {
        if (onRollback) await onRollback(error, attempt);
        throw error;
      }
      const delay = baseDelayMs * Math.pow(2, attempt);
      if (onRetry) await onRetry(error, attempt, delay);
      await sleep(delay, signal);
      attempt += 1;
    }
  }

  throw lastError;
}

function withTimeout(promise, timeoutMs, label = "operation") {
  if (!timeoutMs || timeoutMs <= 0) return promise;
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(Object.assign(new Error(`${label} timed out after ${timeoutMs}ms`), { code: "TIMEOUT" }));
    }, timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

module.exports = {
  withRetry,
  withTimeout,
  isRetryable,
  sleep,
};
