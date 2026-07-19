/**
 * Automatic test generation — unit, integration, API, component,
 * regression, performance, edge cases. Re-run after changes.
 */

const { getAgent } = require("../agents/registry");
const { runCommand, parseFailureDetails } = require("../debug/autodebug");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS, STREAM_EVENTS } = require("../constants");
const prisma = require("../../database/prisma");
const { gateOrExecute } = require("../approval/gate");

function detectTestCommand(projectMeta = {}) {
  if (projectMeta.testCommand) return projectMeta.testCommand;
  const pkg = projectMeta.packageManager || "npm";
  if (pkg === "pnpm") return "pnpm test";
  if (pkg === "yarn") return "yarn test";
  return "npm test";
}

async function generateTests(input, ctx) {
  const qa = getAgent("qa_engineer");
  const kinds = input.kinds || [
    "unit",
    "integration",
    "api",
    "component",
    "regression",
    "edge",
  ];

  const task = {
    id: `gen_tests_${Date.now()}`,
    description: [
      "Generate real, runnable tests for the recent implementation.",
      `Test kinds required: ${kinds.join(", ")}`,
      "Include edge cases and failure paths.",
      "Write test files into the project using filesystem tools.",
      `TARGET:\n${String(input.target || ctx.goalDescription || "").slice(0, 8000)}`,
      input.codeContext ? `CODE CONTEXT:\n${String(input.codeContext).slice(0, 10000)}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    expectedOutputs: ["tests"],
    requiredTools: ["filesystem", "workspace", "terminal"],
  };

  const output = await qa.run(task, ctx);

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      taskId: input.taskId,
      kind: ARTIFACT_KINDS.CODE,
      name: `generated-tests-${Date.now()}.md`,
      content: output.content,
      metadata: { kinds },
    },
    ctx.emit,
  );

  return output;
}

function parseTestCounts(stdout = "", stderr = "") {
  const text = `${stdout}\n${stderr}`;
  const pass = text.match(/(\d+)\s+passing/i) || text.match(/(\d+)\s+passed/i);
  const fail = text.match(/(\d+)\s+failing/i) || text.match(/(\d+)\s+failed/i);
  const skip = text.match(/(\d+)\s+pending/i) || text.match(/(\d+)\s+skipped/i);
  return {
    passed: pass ? Number(pass[1]) : /Tests\s+.*?(\d+)\s+passed/i.test(text) ? 1 : 0,
    failed: fail ? Number(fail[1]) : 0,
    skipped: skip ? Number(skip[1]) : 0,
  };
}

async function runTests(ctx, { command, cwd, taskId } = {}) {
  const cmd = command || detectTestCommand(ctx.projectMeta);
  const gated = await gateOrExecute(
    ctx,
    cmd,
    `Run tests: ${cmd}`,
    { command: cmd },
    () => runCommand(cmd, { cwd: cwd || ctx.cwd }),
  );

  if (gated?.pendingApproval) return { pendingApproval: true, approval: gated.approval };

  const counts = parseTestCounts(gated.stdout, gated.stderr);
  // If command succeeded but no counts parsed, treat as passed with 1 synthetic pass
  if (gated.status === "passed" && counts.passed === 0 && counts.failed === 0) {
    counts.passed = 1;
  }
  if (gated.status === "failed" && counts.failed === 0) counts.failed = 1;

  const status = gated.status === "passed" && counts.failed === 0 ? "passed" : "failed";
  const failures =
    status === "failed" ? parseFailureDetails(gated.stdout, gated.stderr).snippets : [];

  const row = await prisma.testResult.create({
    data: {
      taskId: taskId || null,
      sessionId: ctx.sessionId || null,
      status,
      suite: cmd,
      passed: counts.passed,
      failed: counts.failed,
      skipped: counts.skipped,
      report: `${gated.stdout || ""}\n${gated.stderr || ""}`.slice(0, 100000),
      failures,
      durationMs: gated.durationMs,
      metadata: { exitCode: gated.exitCode },
    },
  });

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      taskId,
      kind: ARTIFACT_KINDS.TEST_REPORT,
      name: `test-report-${row.id}.txt`,
      content: row.report,
    },
    ctx.emit,
  );

  ctx.emit?.(STREAM_EVENTS.TEST_RESULT, {
    testId: row.id,
    status: row.status,
    passed: row.passed,
    failed: row.failed,
  });

  return { ...row, command: cmd, stdout: gated.stdout, stderr: gated.stderr };
}

async function generateAndRun(input, ctx) {
  const generated = await generateTests(input, ctx);
  const results = await runTests(ctx, {
    command: input.command,
    cwd: input.cwd,
    taskId: input.taskId,
  });
  return { generated, results };
}

module.exports = {
  detectTestCommand,
  generateTests,
  runTests,
  generateAndRun,
  parseTestCounts,
};
