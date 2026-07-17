/**
 * Secret redaction for observability payloads.
 * Masks tokens, API keys, passwords, and authorization headers.
 */

const SECRET_PATTERNS = [
  { re: /(api[_-]?key|apikey|secret|password|passwd|token|authorization|bearer|cookie)\s*[:=]\s*["']?([^\s"',}{]+)/gi, repl: "$1=***REDACTED***" },
  { re: /\b(sk-[a-zA-Z0-9_-]{8,})\b/g, repl: "***REDACTED_KEY***" },
  { re: /\b(Bearer\s+)[A-Za-z0-9._\-+=/]+/gi, repl: "$1***REDACTED***" },
  { re: /\b([A-Za-z0-9+/]{32,}={0,2})\b/g, repl: (m) => (m.length > 40 ? "***REDACTED_B64***" : m) },
  { re: /(ghp_|gho_|github_pat_)[A-Za-z0-9_]+/g, repl: "***REDACTED_GITHUB***" },
  { re: /(xox[baprs]-)[A-Za-z0-9-]+/g, repl: "***REDACTED_SLACK***" },
];

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "passwd",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "api_key",
  "authorization",
  "cookie",
  "credentials",
  "privatekey",
  "private_key",
  "clientsecret",
  "client_secret",
]);

function redactString(value) {
  if (typeof value !== "string" || !value) return value;
  let out = value;
  for (const { re, repl } of SECRET_PATTERNS) {
    out = out.replace(re, repl);
  }
  return out;
}

function redactValue(value, depth = 0) {
  if (depth > 12) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.has(String(k).toLowerCase())) {
        out[k] = "***REDACTED***";
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return String(value);
}

function maskTokens(text, keep = 4) {
  if (typeof text !== "string" || text.length < keep * 2) return text;
  return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

function truncate(value, max = 8000) {
  if (typeof value !== "string") return value;
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…[truncated ${value.length - max} chars]`;
}

module.exports = {
  redactString,
  redactValue,
  maskTokens,
  truncate,
  SENSITIVE_KEYS,
};
