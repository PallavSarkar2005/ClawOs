const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { z } = require("zod");
const { idParam } = require("../validators/common.validator");
const ctrl = require("../controllers/workflow.controller");

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional().default(""),
  prompt: z.string().max(100000).optional().default(""),
  definition: z.any().optional(),
  enabled: z.boolean().optional(),
  status: z.string().max(40).optional(),
  projectId: z.string().optional().nullable(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  variables: z.record(z.string(), z.any()).optional(),
  secrets: z.record(z.string(), z.any()).optional(),
  settings: z.record(z.string(), z.any()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
}).passthrough();

const updateWorkflowSchema = createWorkflowSchema.partial().extend({
  publish: z.boolean().optional(),
  changelog: z.string().max(2000).optional(),
}).passthrough();

const executionIdParam = z.object({
  executionId: z.string().min(1),
});

// Meta (before /:id)
router.get("/meta/node-types", protect, ctrl.getNodeTypes);

// Templates
router.get("/templates", protect, ctrl.listTemplates);
router.post("/templates", protect, ctrl.createTemplate);
router.post("/templates/:templateId/create", protect, ctrl.createFromTemplate);

// Import
router.post("/import", protect, ctrl.importWorkflow);

// Webhook (auth via secret header)
router.post("/hooks/:triggerId", ctrl.webhookTrigger);

// Execution control — MUST be before /:id
router.get("/executions/:executionId", protect, validate(executionIdParam, "params"), ctrl.getExecution);
router.get("/executions/:executionId/stream", protect, validate(executionIdParam, "params"), ctrl.streamExecution);
router.post("/executions/:executionId/pause", protect, validate(executionIdParam, "params"), ctrl.pauseExecution);
router.post("/executions/:executionId/resume", protect, validate(executionIdParam, "params"), ctrl.resumeExecution);
router.post("/executions/:executionId/cancel", protect, validate(executionIdParam, "params"), ctrl.cancelExecution);
router.post("/executions/:executionId/retry", protect, validate(executionIdParam, "params"), ctrl.retryExecution);
router.post("/executions/:executionId/approve", protect, validate(executionIdParam, "params"), ctrl.approveExecution);

// CRUD
router.get("/", protect, ctrl.listWorkflows);
router.post("/", protect, validate(createWorkflowSchema), ctrl.createWorkflow);
router.get("/:id", protect, validate(idParam, "params"), ctrl.getWorkflow);
router.put("/:id", protect, validate(idParam, "params"), validate(updateWorkflowSchema), ctrl.updateWorkflow);
router.patch("/:id", protect, validate(idParam, "params"), validate(updateWorkflowSchema), ctrl.updateWorkflow);
router.delete("/:id", protect, validate(idParam, "params"), ctrl.deleteWorkflow);

// Collaboration
router.post("/:id/clone", protect, validate(idParam, "params"), ctrl.cloneWorkflow);
router.post("/:id/publish", protect, validate(idParam, "params"), ctrl.publishWorkflow);
router.get("/:id/export", protect, validate(idParam, "params"), ctrl.exportWorkflow);
router.post("/:id/validate", protect, validate(idParam, "params"), ctrl.validateWorkflow);
router.post("/:id/layout", protect, validate(idParam, "params"), ctrl.layoutWorkflow);

// Execution
router.post("/:id/execute", protect, validate(idParam, "params"), ctrl.executeWorkflow);
router.get("/:id/executions", protect, validate(idParam, "params"), ctrl.listExecutions);
router.get("/:id/history", protect, validate(idParam, "params"), ctrl.getHistory);
router.get("/:id/metrics", protect, validate(idParam, "params"), ctrl.getMetrics);

// Schedules & triggers
router.get("/:id/schedules", protect, validate(idParam, "params"), ctrl.listSchedules);
router.post("/:id/schedules", protect, validate(idParam, "params"), ctrl.createSchedule);
router.get("/:id/triggers", protect, validate(idParam, "params"), ctrl.listTriggers);
router.post("/:id/triggers", protect, validate(idParam, "params"), ctrl.createTrigger);

module.exports = router;
