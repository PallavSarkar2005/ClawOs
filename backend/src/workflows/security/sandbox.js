const vm = require("vm");

/**
 * Sandboxed custom code / script execution.
 * No require, no process, no filesystem — pure JS with injected context.
 */
function runSandboxed(code, context = {}, { timeoutMs = 5000 } = {}) {
  const source = String(code || "").trim();
  if (!source) throw new Error("Empty script");
  if (source.length > 50_000) throw new Error("Script too large");

  const banned = [
    /require\s*\(/,
    /process\./,
    /child_process/,
    /fs\./,
    /globalThis/,
    /Function\s*\(/,
    /eval\s*\(/,
    /import\s*\(/,
    /__dirname/,
    /__filename/,
  ];
  for (const re of banned) {
    if (re.test(source)) {
      throw Object.assign(new Error(`Disallowed pattern in script: ${re}`), {
        code: "SANDBOX_VIOLATION",
      });
    }
  }

  const sandbox = {
    console: {
      log: (...args) => {
        sandbox.__logs.push(args.map(String).join(" "));
      },
      warn: (...args) => {
        sandbox.__logs.push("[warn] " + args.map(String).join(" "));
      },
      error: (...args) => {
        sandbox.__logs.push("[error] " + args.map(String).join(" "));
      },
    },
    __logs: [],
    __result: undefined,
    inputs: context.inputs || {},
    variables: context.variables || {},
    outputs: context.outputs || {},
    Math,
    JSON,
    Date,
    Array,
    Object,
    String,
    Number,
    Boolean,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
  };

  const wrapped = `
    "use strict";
    (function() {
      ${source.includes("return ") || source.includes("exports") ? "" : ""}
      const module = { exports: {} };
      const exports = module.exports;
      ${source}
      if (typeof run === "function") {
        __result = run(inputs, variables);
      } else if (Object.keys(module.exports).length) {
        __result = module.exports;
      } else if (typeof result !== "undefined") {
        __result = result;
      }
      return __result;
    })();
  `;

  const script = new vm.Script(wrapped, { filename: "workflow-script.js" });
  const ctx = vm.createContext(sandbox);
  const result = script.runInContext(ctx, { timeout: timeoutMs, displayErrors: true });
  return {
    result: result !== undefined ? result : sandbox.__result,
    logs: sandbox.__logs,
  };
}

module.exports = { runSandboxed };
