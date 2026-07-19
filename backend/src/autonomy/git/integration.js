/**
 * Git integration for autonomous engineering —
 * branch, commit, diff review, PR planning, conflict analysis, rollback.
 * Dangerous ops (force push) require approval.
 */

const { spawn } = require("child_process");
const { gateOrExecute } = require("../approval/gate");
const { decide } = require("../decision/engine");
const { createArtifact } = require("../artifacts/manager");
const { ARTIFACT_KINDS } = require("../constants");
const { resolveProjectRoot } = require("../../tools/engine/workspace-path");

function runGit(cwd, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const proc = spawn("git", args, {
      cwd,
      env: {
        PATH: process.env.PATH,
        PATHEXT: process.env.PATHEXT,
        SYSTEMROOT: process.env.SYSTEMROOT,
        GIT_TERMINAL_PROMPT: "0",
        HOME: process.env.HOME,
        USERPROFILE: process.env.USERPROFILE,
      },
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      resolve({ code: 1, stdout, stderr: stderr || "git timeout" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: err.message });
    });
  });
}

async function resolveCwd(ctx) {
  if (ctx.cwd) return ctx.cwd;
  if (!ctx.projectId || !ctx.userId) return null;
  try {
    return await resolveProjectRoot(ctx);
  } catch {
    return null;
  }
}

async function createBranch(ctx, branchName) {
  const cwd = await resolveCwd(ctx);
  if (!cwd) throw Object.assign(new Error("No project cwd"), { code: "NO_PROJECT" });
  const name = String(branchName || `autonomy/${Date.now()}`).replace(/[^\w./-]/g, "-");
  const result = await runGit(cwd, ["checkout", "-b", name]);
  if (result.code !== 0) {
    // try switch if exists
    const sw = await runGit(cwd, ["checkout", name]);
    if (sw.code !== 0) throw new Error(sw.stderr || result.stderr || "branch failed");
  }
  await decide(
    {
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: "git_branch",
      summary: `Created/switched branch ${name}`,
      reasoning: "Isolate autonomous changes on a dedicated branch",
      alternatives: [
        { id: "main", score: 0.2, reason: "Work on default branch" },
        { id: name, score: 0.9, reason: "Feature branch isolation" },
      ],
      confidence: 0.9,
      risks: [],
      tradeoffs: [],
      evidence: [{ branch: name }],
      choice: name,
    },
    ctx.emit,
  );
  return { branch: name };
}

async function getDiff(ctx) {
  const cwd = await resolveCwd(ctx);
  if (!cwd) return { staged: "", unstaged: "", status: "" };
  const [status, unstaged, staged] = await Promise.all([
    runGit(cwd, ["status", "--porcelain"]),
    runGit(cwd, ["diff"]),
    runGit(cwd, ["diff", "--cached"]),
  ]);
  return {
    status: status.stdout,
    unstaged: unstaged.stdout,
    staged: staged.stdout,
  };
}

async function commitChanges(ctx, message) {
  const cwd = await resolveCwd(ctx);
  if (!cwd) throw Object.assign(new Error("No project cwd"), { code: "NO_PROJECT" });

  const msg = String(message || "autonomy: apply changes").slice(0, 500);
  await runGit(cwd, ["add", "-A"]);
  const result = await runGit(cwd, ["commit", "-m", msg]);
  if (result.code !== 0 && !/nothing to commit/i.test(result.stdout + result.stderr)) {
    throw new Error(result.stderr || result.stdout || "commit failed");
  }

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: ARTIFACT_KINDS.CODE,
      name: `commit-${Date.now()}.txt`,
      content: `${msg}\n\n${result.stdout}`,
      metadata: { type: "git_commit" },
    },
    ctx.emit,
  );

  return { ok: true, message: msg, stdout: result.stdout };
}

async function planPullRequest(ctx, { title, body, base = "main" } = {}) {
  const diff = await getDiff(ctx);
  const plan = {
    title: title || `Autonomy: ${String(ctx.goalDescription || "changes").slice(0, 72)}`,
    base,
    body:
      body ||
      [
        "## Summary",
        `- Autonomous session ${ctx.sessionId || ""}`,
        `- Goal: ${ctx.goalDescription || ""}`,
        "",
        "## Test plan",
        "- [ ] Build",
        "- [ ] Tests",
        "- [ ] Review",
        "",
        "## Diff status",
        "```",
        (diff.status || "").slice(0, 2000),
        "```",
      ].join("\n"),
  };

  await createArtifact(
    {
      sessionId: ctx.sessionId,
      goalId: ctx.goalId,
      kind: ARTIFACT_KINDS.RELEASE_NOTES,
      name: `pr-plan-${Date.now()}.md`,
      content: `# ${plan.title}\n\nBase: ${plan.base}\n\n${plan.body}`,
    },
    ctx.emit,
  );

  return plan;
}

async function analyzeConflicts(ctx) {
  const cwd = await resolveCwd(ctx);
  if (!cwd) return { conflicts: [] };
  const status = await runGit(cwd, ["status", "--porcelain"]);
  const conflicts = status.stdout
    .split(/\r?\n/)
    .filter((l) => /^(UU|AA|DD|AU|UA|DU|UD)/.test(l.trim()))
    .map((l) => l.trim());
  return { conflicts, raw: status.stdout };
}

async function rollback(ctx, { soft = true } = {}) {
  const cwd = await resolveCwd(ctx);
  if (!cwd) throw Object.assign(new Error("No project cwd"), { code: "NO_PROJECT" });

  const args = soft ? ["reset", "--soft", "HEAD~1"] : ["reset", "--hard", "HEAD~1"];
  return gateOrExecute(
    ctx,
    `git ${args.join(" ")}`,
    soft ? "Soft rollback last commit" : "Hard rollback last commit",
    { command: `git ${args.join(" ")}`, largeRefactor: !soft },
    async () => {
      const result = await runGit(cwd, args);
      if (result.code !== 0) throw new Error(result.stderr || "rollback failed");
      return result;
    },
  );
}

async function forcePush(ctx, remote = "origin", branch) {
  const cwd = await resolveCwd(ctx);
  if (!cwd) throw Object.assign(new Error("No project cwd"), { code: "NO_PROJECT" });
  const b = branch || "HEAD";
  return gateOrExecute(
    ctx,
    `git push --force ${remote} ${b}`,
    "Force push (requires approval)",
    { forcePush: true, command: `git push --force ${remote} ${b}` },
    async () => runGit(cwd, ["push", "--force", remote, b]),
  );
}

module.exports = {
  runGit,
  createBranch,
  getDiff,
  commitChanges,
  planPullRequest,
  analyzeConflicts,
  rollback,
  forcePush,
};
