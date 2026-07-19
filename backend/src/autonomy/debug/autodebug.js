/**
 * Autonomous debugging — detect compiler/runtime/test/lint/type/dependency
 * errors and generate fixes with retry/verify.
 */

const { spawnSafe, parseSafeCommand } = require("../../utils/safe-exec");
const { chat } = require("../../runtime/llm.client");
const { extractJson } = require("../../runtime/planner");
const { getAgent } = require("../agents/registry");
const { decide } = require("../decision/engine");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS, STREAM_EVENTS } = require("../constants");
const { gateOrExecute } = require("../approval/gate");

const ERROR_PATTERNS = [
  { kind: "compiler", re: /error TS\d+|compilation error|cannot find name|SyntaxError:/i },
  { kind: "runtime", re: /TypeError:|ReferenceError:|UnhandledPromiseRejection|FATAL ERROR/i },
  { kind: "test", re: /\b(\d+)\s+failing\b|FAIL\s+|AssertionError|expected .* but/i },
  { kind: "lint", re: /ESLint|eslint|prettier|lint error|error\/|✖\s+\d+\s+problem/i },
  { kind: "type", re: /Type '.+' is not assignable|Property '.+' does not exist|TS\d{4}/i },
  { kind: "dependency", re: /Cannot find module|MODULE_NOT_FOUND|ERESOLVE|peer dep/i },
  { kind: "import", re: /is not exported|Failed to resolve import|Cannot resolve/i },
  { kind: "api", re: /404|ECONNREFUSED|status code 5\d\d|API mismatch/i },
];

function classifyErrors(text) {
  const src = String(text || "");
  const found = [];
  for (const p of ERROR_PATTERNS) {
    if (p.re.test(src)) found.push(p.kind);
  }
  return [...new Set(found)];
}

function parseFailureDetails(stdout, stderr) {
  const combined = `${stdout || ""}\n${stderr || ""}`;
  const lines = combined.split(/\r?\n/).filter(Boolean);
  const errorLines = lines.filter((l) =>
    /error|fail|exception|cannot|unable|ENOENT|EADDRINUSE/i.test(l),
  );
  return {
    kinds: classifyErrors(combined),
    snippets: errorLines.slice(0, 40),
    raw: combined.slice(0, 20000),
  };
}

async function runCommand(command, { cwd, timeoutMs = 180_000 } = {}) {
  const parsed = parseSafeCommand(command);
  const started = Date.now();
  const spawned = spawnSafe(parsed.file, parsed.args, { cwd, timeoutMs });
  const { proc, maxBuffer } = spawned;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
      if (stdout.length > maxBuffer) stdout = stdout.slice(-maxBuffer);
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > maxBuffer) stderr = stderr.slice(-maxBuffer);
    });
    proc.on("error", (err) => {
      resolve({
        command: parsed.display,
        exitCode: 1,
        stdout,
        stderr: err.message,
        status: "failed",
        durationMs: Date.now() - started,
      });
    });
    proc.on("close", (code) => {
      const timedOut = spawned.timedOut;
      resolve({
        command: parsed.display,
        exitCode: timedOut ? 124 : code ?? 1,
        stdout,
        stderr: timedOut ? `${stderr}\nCommand timed out` : stderr,
        status: !timedOut && code === 0 ? "passed" : "failed",
        durationMs: Date.now() - started,
      });
    });
  });
}

async function diagnose(failureText, ctx) {
  const details = parseFailureDetails(failureText, "");
  let diagnosis = {
    kinds: details.kinds,
    rootCause: details.snippets[0] || "Unknown failure",
    suggestedFixes: [],
    confidence: details.kinds.length ? 0.6 : 0.35,
  };

  try {
    const response = await chat({
      messages: [
        {
          role: "system",
          content: `You are an autonomous debugger. Diagnose software failures and propose concrete fixes.
Return ONLY JSON: {"rootCause":"...","kinds":[],"suggestedFixes":[{"file":"...","action":"...","detail":"..."}],"confidence":0.0}`,
        },
        {
          role: "user",
          content: `GOAL: ${ctx.goalDescription || ""}\n\nFAILURE OUTPUT:\n${String(failureText).slice(0, 14000)}`,
        },
      ],
      settings: ctx.settings || {},
      temperature: 0.1,
      maxTokens: 2048,
      signal: ctx.signal,
    });
    const parsed = extractJson(response.content);
    if (parsed) {
      diagnosis = {
        kinds: parsed.kinds || details.kinds,
        rootCause: parsed.rootCause || diagnosis.rootCause,
        suggestedFixes: Array.isArray(parsed.suggestedFixes) ? parsed.suggestedFixes : [],
        confidence: Number.isFinite(parsed.confidence) ? parsed.confidence : 0.65,
      };
    }
  } catch {
    /* keep heuristic diagnosis */
  }

  await decide(
    {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: "debug_diagnosis",
      summary: `Diagnosed: ${diagnosis.rootCause}`.slice(0, 500),
      reasoning: JSON.stringify(diagnosis).slice(0, 4000),
      alternatives: diagnosis.suggestedFixes.map((f, i) => ({
        id: `fix_${i}`,
        score: 0.7 - i * 0.1,
        reason: f.detail || f.action,
      })),
      confidence: diagnosis.confidence,
      risks: [{ level: "medium", message: "Automated fix may be incomplete" }],
      tradeoffs: [],
      evidence: details.snippets.slice(0, 10),
      choice: diagnosis.suggestedFixes[0]?.action || "manual_review",
    },
    ctx.emit,
  );

  return { ...diagnosis, details };
}

async function applyFixes(diagnosis, ctx) {
  const engineer = getAgent("backend_engineer") || getAgent("qa_engineer");
  if (!engineer) throw new Error("No engineer agent available for fixes");

  const task = {
    id: `debug_fix_${Date.now()}`,
    description: [
      "Apply concrete fixes for the diagnosed failure. Edit real files. No placeholders.",
      `ROOT CAUSE: ${diagnosis.rootCause}`,
      `KINDS: ${(diagnosis.kinds || []).join(", ")}`,
      `SUGGESTED FIXES:\n${JSON.stringify(diagnosis.suggestedFixes || [], null, 2)}`,
      `FAILURE SNIPPETS:\n${(diagnosis.details?.snippets || []).join("\n")}`,
      "After editing, summarize files changed.",
    ].join("\n\n"),
    expectedOutputs: ["fixes"],
    requiredTools: ["filesystem", "workspace", "terminal"],
  };

  const output = await engineer.run(task, ctx);

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: ARTIFACT_KINDS.CODE,
      name: `debug-fix-${Date.now()}.md`,
      content: output.content,
      metadata: { diagnosis },
    },
    ctx.emit,
  );

  return output;
}

async function debugAndFix(failureText, ctx, { verifyCommand, cwd, maxAttempts = 3 } = {}) {
  let last = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (ctx.signal?.aborted || ctx.cancelRequested?.()) {
      throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
    }

    const diagnosis = await diagnose(last?.stderr || last?.stdout || failureText, ctx);
    ctx.emit?.(STREAM_EVENTS.LOG, {
      level: "info",
      message: `Debug attempt ${attempt}: ${diagnosis.rootCause}`,
    });

    await applyFixes(diagnosis, ctx);

    if (!verifyCommand) {
      return { fixed: true, attempt, diagnosis, verify: null };
    }

    // Gate dangerous verify commands
    const gated = await gateOrExecute(
      ctx,
      verifyCommand,
      `Verify fix with: ${verifyCommand}`,
      { command: verifyCommand },
      () => runCommand(verifyCommand, { cwd }),
    );

    if (gated?.pendingApproval) {
      return { fixed: false, pendingApproval: gated.approval, attempt, diagnosis };
    }

    last = gated;
    if (last.status === "passed") {
      return { fixed: true, attempt, diagnosis, verify: last };
    }
    failureText = `${last.stdout}\n${last.stderr}`;
  }

  return { fixed: false, attempt: maxAttempts, verify: last };
}

module.exports = {
  classifyErrors,
  parseFailureDetails,
  runCommand,
  diagnose,
  applyFixes,
  debugAndFix,
};
