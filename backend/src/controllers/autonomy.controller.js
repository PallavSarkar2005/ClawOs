const {
  engine,
  listGoals,
  getGoal,
  listSessions,
  getSession,
  listApprovals,
  resolveApproval,
  listDecisions,
  listArtifacts,
  getArtifact,
  createGoal,
} = require("../autonomy");
const persist = require("../autonomy/session/persist");
const { createMasterPlan } = require("../autonomy/planner/master");
const { decomposeGoal } = require("../autonomy/planner/decompose");

function ok(res, data) {
  return res.json(data);
}

function fail(res, err, code = 500) {
  const status =
    err.status ||
    (err.code === "NOT_FOUND" ? 404 : err.code === "CONFLICT" || err.code === "EXPIRED" ? 409 : code);
  return res.status(status).json({ message: err.message || "Autonomy error", code: err.code });
}

async function dashboard(req, res) {
  try {
    const hours = Number(req.query.hours) || 24;
    return ok(res, await engine.getDashboard(req.user.id, hours));
  } catch (err) {
    return fail(res, err);
  }
}

async function createGoalHandler(req, res) {
  try {
    const goal = await createGoal(req.user.id, req.body || {});
    return ok(res, goal);
  } catch (err) {
    return fail(res, err);
  }
}

async function listGoalsHandler(req, res) {
  try {
    return ok(res, await listGoals(req.user.id, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

async function getGoalHandler(req, res) {
  try {
    const goal = await getGoal(req.params.id, req.user.id);
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    return ok(res, goal);
  } catch (err) {
    return fail(res, err);
  }
}

async function updateGoalHandler(req, res) {
  try {
    const goal = await persist.updateGoal(req.params.id, req.user.id, req.body || {});
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    return ok(res, goal);
  } catch (err) {
    return fail(res, err);
  }
}

async function planGoal(req, res) {
  try {
    const goal = await getGoal(req.params.id, req.user.id);
    if (!goal) return res.status(404).json({ message: "Goal not found" });
    const plan = await createMasterPlan({
      userId: req.user.id,
      goalId: goal.id,
      projectId: goal.projectId,
      goalDescription: goal.description,
      settings: req.body?.settings || {},
    });
    const dbPlan = await persist.persistPlan(goal.id, plan, {
      version: (goal.plans?.[0]?.version || 0) + 1,
    });
    return ok(res, { plan, persisted: dbPlan });
  } catch (err) {
    return fail(res, err);
  }
}

async function decompose(req, res) {
  try {
    const text = req.body?.description || req.body?.goal || "";
    return ok(res, decomposeGoal(text));
  } catch (err) {
    return fail(res, err);
  }
}

async function startExecution(req, res) {
  try {
    const result = await engine.start({
      userId: req.user.id,
      goalId: req.body.goalId,
      projectId: req.body.projectId,
      conversationId: req.body.conversationId,
      title: req.body.title,
      description: req.body.description || req.body.message,
      settings: req.body.settings,
      cwd: req.body.cwd,
      maxCycles: req.body.maxCycles,
      createBranch: req.body.createBranch,
      branchName: req.body.branchName,
      commit: req.body.commit,
      commitMessage: req.body.commitMessage,
      projectMeta: req.body.projectMeta,
      allowReplan: req.body.allowReplan,
    });
    return ok(res, result);
  } catch (err) {
    return fail(res, err);
  }
}

async function listSessionsHandler(req, res) {
  try {
    return ok(res, await listSessions(req.user.id, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

async function getSessionHandler(req, res) {
  try {
    const session = await getSession(req.params.id, req.user.id);
    if (!session) return res.status(404).json({ message: "Session not found" });
    return ok(res, session);
  } catch (err) {
    return fail(res, err);
  }
}

async function getProgress(req, res) {
  try {
    const data = await engine.getProgress(req.params.id, req.user.id);
    if (!data) return res.status(404).json({ message: "Session not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function cancelSession(req, res) {
  try {
    const row = await engine.cancel(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ message: "Session not found" });
    return ok(res, row);
  } catch (err) {
    return fail(res, err);
  }
}

async function resumeSession(req, res) {
  try {
    const result = await engine.resume(req.params.id, req.user.id, req.body || {});
    return ok(res, result);
  } catch (err) {
    return fail(res, err);
  }
}

async function streamSession(req, res) {
  const sessionId = req.params.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (payload) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send({ event: "connected", sessionId });

  const onEvent = (payload) => {
    if (payload.sessionId === sessionId) send(payload);
  };
  engine.on("event", onEvent);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    engine.off("event", onEvent);
  });
}

async function listArtifactsHandler(req, res) {
  try {
    return ok(
      res,
      await listArtifacts({
        goalId: req.query.goalId,
        sessionId: req.query.sessionId,
        taskId: req.query.taskId,
        kind: req.query.kind,
        limit: req.query.limit,
        includeContent: req.query.includeContent === "true",
      }),
    );
  } catch (err) {
    return fail(res, err);
  }
}

async function getArtifactHandler(req, res) {
  try {
    const row = await getArtifact(req.params.id);
    if (!row) return res.status(404).json({ message: "Artifact not found" });
    return ok(res, row);
  } catch (err) {
    return fail(res, err);
  }
}

async function listDecisionsHandler(req, res) {
  try {
    return ok(
      res,
      await listDecisions({
        userId: req.user.id,
        goalId: req.query.goalId,
        sessionId: req.query.sessionId,
        taskId: req.query.taskId,
        kind: req.query.kind,
        limit: req.query.limit,
      }),
    );
  } catch (err) {
    return fail(res, err);
  }
}

async function listApprovalsHandler(req, res) {
  try {
    return ok(res, await listApprovals(req.user.id, req.query));
  } catch (err) {
    return fail(res, err);
  }
}

async function resolveApprovalHandler(req, res) {
  try {
    const row = await resolveApproval(req.params.id, req.user.id, {
      approve: req.body?.approve !== false && req.body?.status !== "rejected",
      note: req.body?.note,
    });
    return ok(res, row);
  } catch (err) {
    return fail(res, err);
  }
}

async function listBuilds(req, res) {
  try {
    const prisma = require("../database/prisma");
    const where = {};
    if (req.query.sessionId) where.sessionId = req.query.sessionId;
    if (req.query.taskId) where.taskId = req.query.taskId;
    const rows = await prisma.buildResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit) || 50, 200),
    });
    return ok(res, rows);
  } catch (err) {
    return fail(res, err);
  }
}

async function listTests(req, res) {
  try {
    const prisma = require("../database/prisma");
    const where = {};
    if (req.query.sessionId) where.sessionId = req.query.sessionId;
    if (req.query.taskId) where.taskId = req.query.taskId;
    const rows = await prisma.testResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit) || 50, 200),
    });
    return ok(res, rows);
  } catch (err) {
    return fail(res, err);
  }
}

async function listReviews(req, res) {
  try {
    const prisma = require("../database/prisma");
    const where = {};
    if (req.query.sessionId) where.sessionId = req.query.sessionId;
    if (req.query.taskId) where.taskId = req.query.taskId;
    const rows = await prisma.reviewResult.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Number(req.query.limit) || 50, 200),
    });
    return ok(res, rows);
  } catch (err) {
    return fail(res, err);
  }
}

async function getHistory(req, res) {
  try {
    const sessions = await listSessions(req.user.id, { limit: 100 });
    return ok(res, { sessions });
  } catch (err) {
    return fail(res, err);
  }
}

async function listAgents(req, res) {
  try {
    const { listAgentTypes, prompts } = require("../autonomy/agents/registry");
    return ok(
      res,
      listAgentTypes().map((type) => ({
        type,
        promptPreview: String(prompts[type] || "").slice(0, 200),
      })),
    );
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = {
  dashboard,
  createGoalHandler,
  listGoalsHandler,
  getGoalHandler,
  updateGoalHandler,
  planGoal,
  decompose,
  startExecution,
  listSessionsHandler,
  getSessionHandler,
  getProgress,
  cancelSession,
  resumeSession,
  streamSession,
  listArtifactsHandler,
  getArtifactHandler,
  listDecisionsHandler,
  listApprovalsHandler,
  resolveApprovalHandler,
  listBuilds,
  listTests,
  listReviews,
  getHistory,
  listAgents,
};
