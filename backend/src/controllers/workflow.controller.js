const service = require("../workflows/service");
const { startWorkflowScheduler } = require("../workflows/scheduler");
const { seedBuiltinTemplates } = require("../workflows/service");
const { NODE_TYPES, TRIGGER_TYPES, STREAM_EVENTS } = require("../workflows/constants");

function send(res, data, status = 200) {
  return res.status(status).json(data);
}

function handleError(res, err) {
  const status = err.status || 500;
  return res.status(status).json({
    message: err.message || "Internal error",
    errors: err.errors || undefined,
    code: err.code || undefined,
  });
}

async function listWorkflows(req, res) {
  try {
    const data = await service.listWorkflows(req.user.id, req.query);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getWorkflow(req, res) {
  try {
    const data = await service.getWorkflow(req.user.id, req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createWorkflow(req, res) {
  try {
    const data = await service.createWorkflow(req.user.id, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function updateWorkflow(req, res) {
  try {
    const data = await service.updateWorkflow(req.user.id, req.params.id, req.body);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function deleteWorkflow(req, res) {
  try {
    const data = await service.deleteWorkflow(req.user.id, req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function cloneWorkflow(req, res) {
  try {
    const data = await service.cloneWorkflow(req.user.id, req.params.id, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function publishWorkflow(req, res) {
  try {
    const data = await service.publishWorkflow(req.user.id, req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function exportWorkflow(req, res) {
  try {
    const data = await service.exportWorkflow(req.user.id, req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function importWorkflow(req, res) {
  try {
    const data = await service.importWorkflow(req.user.id, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function validateWorkflow(req, res) {
  try {
    const target = req.body.definition || req.params.id;
    const data = await service.validateWorkflow(req.user.id, target);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function layoutWorkflow(req, res) {
  try {
    const data = await service.layoutWorkflow(req.user.id, req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function executeWorkflow(req, res) {
  try {
    const execution = await service.startExecution({
      workflowId: req.params.id,
      userId: req.user.id,
      inputs: req.body.inputs || req.body || {},
      triggerType: "manual",
      triggerData: { source: "api" },
      projectId: req.body.projectId || null,
      conversationId: req.body.conversationId || null,
    });
    return send(res, execution, 202);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listExecutions(req, res) {
  try {
    const data = await service.listExecutions(req.user.id, {
      workflowId: req.query.workflowId || req.params.id,
      status: req.query.status,
      limit: req.query.limit,
    });
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getExecution(req, res) {
  try {
    const data = await service.getExecution(req.user.id, req.params.executionId || req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function pauseExecution(req, res) {
  try {
    const data = await service.pauseExecution(req.params.executionId, req.user.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function resumeExecution(req, res) {
  try {
    const data = await service.resumeExecution(req.params.executionId, req.user.id, req.body || {});
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function cancelExecution(req, res) {
  try {
    const data = await service.cancelExecution(req.params.executionId, req.user.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function retryExecution(req, res) {
  try {
    const data = await service.retryExecution(req.params.executionId, req.user.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function approveExecution(req, res) {
  try {
    const data = await service.resumeExecution(req.params.executionId, req.user.id, {
      approvalDecision: {
        approved: req.body.approved !== false,
        decidedBy: req.user.id,
        comment: req.body.comment || "",
      },
    });
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function streamExecution(req, res) {
  try {
    const executionId = req.params.executionId;
    await service.getExecution(req.user.id, executionId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const sendEvent = (payload) => {
      res.write(`event: ${payload.event}\n`);
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };

    const unsub = service.subscribe(executionId, sendEvent);
    sendEvent({ event: "workflow.subscribed", executionId });

    const heartbeat = setInterval(() => {
      res.write(`: ping\n\n`);
    }, 15000);

    req.on("close", () => {
      clearInterval(heartbeat);
      unsub();
    });
  } catch (err) {
    return handleError(res, err);
  }
}

async function getMetrics(req, res) {
  try {
    const data = await service.getMetrics(req.user.id, req.params.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listTemplates(req, res) {
  try {
    const data = await service.listTemplates(req.user.id);
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createTemplate(req, res) {
  try {
    const data = await service.createTemplate(req.user.id, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createFromTemplate(req, res) {
  try {
    const data = await service.createFromTemplate(req.user.id, req.params.templateId, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createSchedule(req, res) {
  try {
    const data = await service.createSchedule(req.params.id, req.user.id, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listSchedules(req, res) {
  try {
    const wf = await service.getWorkflow(req.user.id, req.params.id);
    return send(res, wf.schedules);
  } catch (err) {
    return handleError(res, err);
  }
}

async function createTrigger(req, res) {
  try {
    const data = await service.createTrigger(req.params.id, req.user.id, req.body);
    return send(res, data, 201);
  } catch (err) {
    return handleError(res, err);
  }
}

async function listTriggers(req, res) {
  try {
    const wf = await service.getWorkflow(req.user.id, req.params.id);
    return send(res, wf.triggers);
  } catch (err) {
    return handleError(res, err);
  }
}

async function webhookTrigger(req, res) {
  try {
    const execution = await service.fireTrigger(req.params.triggerId, {
      body: req.body,
      headers: req.headers,
      inputs: req.body,
    }, { secret: req.headers["x-webhook-secret"] || req.query.secret });
    return send(res, execution, 202);
  } catch (err) {
    return handleError(res, err);
  }
}

async function getNodeTypes(req, res) {
  return send(res, {
    nodeTypes: NODE_TYPES,
    triggerTypes: TRIGGER_TYPES,
    streamEvents: STREAM_EVENTS,
    queue: service.getQueueStats(),
  });
}

async function getHistory(req, res) {
  try {
    const data = await service.listExecutions(req.user.id, {
      workflowId: req.params.id,
      limit: req.query.limit || 100,
    });
    return send(res, data);
  } catch (err) {
    return handleError(res, err);
  }
}

module.exports = {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  cloneWorkflow,
  publishWorkflow,
  exportWorkflow,
  importWorkflow,
  validateWorkflow,
  layoutWorkflow,
  executeWorkflow,
  listExecutions,
  getExecution,
  pauseExecution,
  resumeExecution,
  cancelExecution,
  retryExecution,
  approveExecution,
  streamExecution,
  getMetrics,
  listTemplates,
  createTemplate,
  createFromTemplate,
  createSchedule,
  listSchedules,
  createTrigger,
  listTriggers,
  webhookTrigger,
  getNodeTypes,
  getHistory,
  startWorkflowScheduler,
  seedBuiltinTemplates,
};
