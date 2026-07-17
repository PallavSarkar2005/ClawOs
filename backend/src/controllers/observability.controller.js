const { engine } = require("../observability");
const { redactValue } = require("../observability/redact");

function ok(res, data) {
  return res.json(data);
}

function fail(res, err, code = 500) {
  const status = err.status || err.code === "NOT_FOUND" ? 404 : code;
  return res.status(status).json({ message: err.message || "Observability error" });
}

async function dashboard(req, res) {
  try {
    const hours = Number(req.query.hours) || 24;
    const data = await engine.getDashboard(req.user.id, hours);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function search(req, res) {
  try {
    const data = await engine.search(req.user.id, {
      q: req.query.q,
      projectId: req.query.projectId,
      workflowId: req.query.workflowId,
      agent: req.query.agent,
      tool: req.query.tool,
      model: req.query.model,
      status: req.query.status,
      kind: req.query.kind,
      traceId: req.query.traceId,
      minLatency: req.query.minLatency,
      maxLatency: req.query.maxLatency,
      from: req.query.from,
      to: req.query.to,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getTrace(req, res) {
  try {
    const data = await engine.getTrace(req.params.traceId, req.user.id);
    if (!data) return res.status(404).json({ message: "Trace not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getTimeline(req, res) {
  try {
    const data = await engine.getTimeline(req.params.traceId, req.user.id);
    if (!data) return res.status(404).json({ message: "Trace not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getMetrics(req, res) {
  try {
    const hours = Number(req.query.hours) || 24;
    const data = await engine.getMetrics(req.user.id, hours);
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getAlerts(req, res) {
  try {
    const data = await engine.getAlerts(req.user.id, {
      status: req.query.status,
      type: req.query.type,
      severity: req.query.severity,
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function acknowledgeAlert(req, res) {
  try {
    const data = await engine.acknowledgeAlert(req.params.id, req.user.id);
    if (!data) return res.status(404).json({ message: "Alert not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function resolveAlert(req, res) {
  try {
    const data = await engine.resolveAlert(req.params.id, req.user.id);
    if (!data) return res.status(404).json({ message: "Alert not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function createReplay(req, res) {
  try {
    const data = await engine.createReplay(req.params.traceId, req.user.id);
    if (!data) return res.status(404).json({ message: "Trace not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function listReplays(req, res) {
  try {
    const data = await engine.listReplays(req.user.id, {
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getReplay(req, res) {
  try {
    const data = await engine.getReplay(req.params.id, req.user.id);
    if (!data) return res.status(404).json({ message: "Replay not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function playReplay(req, res) {
  try {
    const data = await engine.playReplay(req.params.id, req.user.id, {
      fromStep: Number(req.body?.fromStep) || 0,
      toStep: req.body?.toStep,
    });
    if (!data) return res.status(404).json({ message: "Replay not found" });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function getLogs(req, res) {
  try {
    const data = await engine.getLogs(req.user.id, {
      limit: Number(req.query.limit) || 100,
      offset: Number(req.query.offset) || 0,
      level: req.query.level,
    });
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function exportTrace(req, res) {
  try {
    const data = await engine.exportTrace(req.params.traceId, req.user.id);
    if (!data) return res.status(404).json({ message: "Trace not found" });
    const safe = redactValue(data);
    res.setHeader("Content-Disposition", `attachment; filename="trace-${req.params.traceId}.json"`);
    return ok(res, safe);
  } catch (err) {
    return fail(res, err);
  }
}

async function streamTrace(req, res) {
  try {
    const { initSSE, sendSSE, endSSE } = require("../runtime/stream");
    initSSE(res);
    const traceId = req.params.traceId;
    const detail = await engine.getTrace(traceId, req.user.id);
    if (!detail) {
      sendSSE(res, "error", { message: "Trace not found" });
      endSSE(res);
      return;
    }
    sendSSE(res, "snapshot", {
      traceId,
      status: detail.status,
      spanCount: detail.spans?.length || 0,
    });

    const onEvent = (payload) => {
      if (payload.traceId !== traceId) return;
      sendSSE(res, payload.event || "update", payload);
    };
    engine.tracer.on("stream", onEvent);
    engine.tracer.on(traceId, onEvent);

    req.on("close", () => {
      engine.tracer.off("stream", onEvent);
      engine.tracer.off(traceId, onEvent);
      endSSE(res);
    });
  } catch (err) {
    if (!res.headersSent) return fail(res, err);
  }
}

async function maintenance(req, res) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Admin only" });
    }
    const data = await engine.runMaintenance();
    return ok(res, data);
  } catch (err) {
    return fail(res, err);
  }
}

async function recordUserAction(req, res) {
  try {
    const { action, traceId, metadata } = req.body || {};
    let tid = traceId;
    if (!tid) {
      const handle = engine.startExecutionTrace({
        kind: "user_action",
        name: action || "user.action",
        userId: req.user.id,
        projectId: req.body?.projectId,
        attributes: metadata || {},
      });
      tid = handle.traceId;
      engine.recordUserAction(tid, { label: action, ...(metadata || {}) });
      engine.endExecutionTrace(tid, { status: "ok" });
    } else {
      engine.recordUserAction(tid, { label: action, ...(metadata || {}) });
    }
    return ok(res, { traceId: tid, ok: true });
  } catch (err) {
    return fail(res, err);
  }
}

module.exports = {
  dashboard,
  search,
  getTrace,
  getTimeline,
  getMetrics,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  createReplay,
  listReplays,
  getReplay,
  playReplay,
  getLogs,
  exportTrace,
  streamTrace,
  maintenance,
  recordUserAction,
};
