const { spawn } = require("child_process");
const path = require("path");

const DANGEROUS_PATTERNS = [
  /[;&|`$]/,
  /\n|\r/,
  /\$\(/,
  />\s*\//,
  /<\s*\//,
  /\b(rm\s+-rf\s+\/|mkfs|dd\s+if=|shutdown|reboot)\b/i,
  /\.\.(\/|\\)/,
];

const ALLOWED_RUN_BINARIES = new Set([
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "python",
  "python3",
  "py",
  "pip",
  "pip3",
  "ruby",
  "go",
  "cargo",
  "java",
  "javac",
  "dotnet",
  "php",
  "bun",
  "deno",
]);

/**
 * Parse a simple command string into executable + args without shell.
 * Supports: "npm run dev", "node index.js", "python app.py"
 */
function parseSafeCommand(command) {
  const raw = String(command || "").trim();
  if (!raw) throw new Error("Empty command");
  if (raw.length > 500) throw new Error("Command too long");

  for (const re of DANGEROUS_PATTERNS) {
    if (re.test(raw)) {
      throw new Error("Command contains disallowed characters or patterns");
    }
  }

  // Simple whitespace tokenizer (no quotes nesting for shell metachar)
  const tokens = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (cur) tokens.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (quote) throw new Error("Unbalanced quotes in command");
  if (cur) tokens.push(cur);
  if (!tokens.length) throw new Error("Empty command");

  const executable = tokens[0].toLowerCase().replace(/\.exe$/i, "");
  const base = path.basename(executable);
  if (!ALLOWED_RUN_BINARIES.has(base) && !ALLOWED_RUN_BINARIES.has(executable)) {
    throw new Error(`Executable not allowed: ${tokens[0]}`);
  }

  return { file: tokens[0], args: tokens.slice(1), display: raw };
}

function spawnSafe(file, args, options = {}) {
  const {
    cwd,
    env = {},
    timeoutMs = 5 * 60 * 1000,
    maxBuffer = 2 * 1024 * 1024,
  } = options;

  const safeEnv = {
    PATH: process.env.PATH,
    PATHEXT: process.env.PATHEXT,
    SYSTEMROOT: process.env.SYSTEMROOT,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    LANG: process.env.LANG,
    FORCE_COLOR: "1",
    NODE_ENV: process.env.NODE_ENV,
    ...env,
  };

  // Strip secrets from inherited env
  delete safeEnv.JWT_SECRET;
  delete safeEnv.JWT_REFRESH_SECRET;
  delete safeEnv.ENCRYPTION_KEY;
  delete safeEnv.DATABASE_URL;
  delete safeEnv.OPENROUTER_API_KEY;
  delete safeEnv.OPENAI_API_KEY;
  delete safeEnv.GROQ_API_KEY;
  delete safeEnv.GEMINI_API_KEY;
  delete safeEnv.GOOGLE_API_KEY;

  const proc = spawn(file, args, {
    cwd,
    env: safeEnv,
    shell: false,
    windowsHide: true,
  });

  let killed = false;
  const timer = setTimeout(() => {
    killed = true;
    try {
      if (process.platform === "win32" && proc.pid) {
        spawn("taskkill", ["/pid", String(proc.pid), "/f", "/t"], { shell: false, windowsHide: true });
      } else {
        proc.kill("SIGKILL");
      }
    } catch {
      /* ignore */
    }
  }, timeoutMs);

  proc.on("exit", () => clearTimeout(timer));
  proc.on("error", () => clearTimeout(timer));

  return { proc, get timedOut() { return killed; }, maxBuffer };
}

function assertInsideRoot(root, targetPath) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(targetPath);
  const rootWithSep = resolvedRoot.endsWith(path.sep)
    ? resolvedRoot
    : resolvedRoot + path.sep;
  if (resolved !== resolvedRoot && !resolved.startsWith(rootWithSep)) {
    throw new Error("Path escapes workspace");
  }
  return resolved;
}

module.exports = {
  parseSafeCommand,
  spawnSafe,
  assertInsideRoot,
  ALLOWED_RUN_BINARIES,
  DANGEROUS_PATTERNS,
};
