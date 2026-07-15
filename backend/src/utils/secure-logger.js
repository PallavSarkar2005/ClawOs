const SENSITIVE_KEYS = new Set([
  "password",
  "currentpassword",
  "newpassword",
  "confirmpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "authorization",
  "cookie",
  "cookies",
  "apikey",
  "api_key",
  "secret",
  "jwt",
  "encryptionkey",
  "encryption_key",
  "passwordhash",
]);

function maskValue(value) {
  if (value == null) return value;
  const str = String(value);
  if (str.length <= 4) return "****";
  return `${str.slice(0, 2)}***${str.slice(-2)}`;
}

function sanitize(input, depth = 0) {
  if (depth > 6) return "[truncated]";
  if (input == null) return input;
  if (typeof input === "string") {
    if (/bearer\s+/i.test(input) || input.length > 200) {
      return maskValue(input);
    }
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((v) => sanitize(v, depth + 1));
  }
  if (typeof input === "object") {
    const out = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(String(key).toLowerCase().replace(/[_-]/g, ""))) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitize(value, depth + 1);
      }
    }
    return out;
  }
  return input;
}

function safeLog(...args) {
  const cleaned = args.map((a) =>
    typeof a === "object" && a !== null ? sanitize(a) : a,
  );
  console.log(...cleaned);
}

function safeWarn(...args) {
  const cleaned = args.map((a) =>
    typeof a === "object" && a !== null ? sanitize(a) : a,
  );
  console.warn(...cleaned);
}

function safeError(...args) {
  const cleaned = args.map((a) => {
    if (a instanceof Error) {
      return { name: a.name, message: a.message, stack: a.stack };
    }
    return typeof a === "object" && a !== null ? sanitize(a) : a;
  });
  console.error(...cleaned);
}

module.exports = {
  sanitize,
  maskValue,
  safeLog,
  safeWarn,
  safeError,
};
