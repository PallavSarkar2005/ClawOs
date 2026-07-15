const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const {
  workspaceLimiter,
  terminalLimiter,
  gitLimiter,
  aiLimiter,
} = require("../middleware/rate-limit.middleware");
const {
  createProjectSchema,
  updateProjectSchema,
  projectIdParam,
  createFileSchema,
  updateFileSchema,
  runCommandSchema,
  gitCommitSchema,
  gitStageSchema,
  gitCheckoutSchema,
  gitRemoteSchema,
  sessionIdParam,
} = require("../validators/common.validator");
const projectController = require("../controllers/project.controller");
const ideController = require("../controllers/ide.controller");

router.use(protect);
router.use(workspaceLimiter);

router.get("/", (req, res) => projectController.getProjects(req, res));
router.post("/", validate(createProjectSchema), (req, res) =>
  projectController.createProject(req, res),
);
router.put("/reorder", (req, res) => projectController.reorderProjects(req, res));

router.get("/:projectId", validate(projectIdParam, "params"), (req, res) =>
  projectController.getProjectDetails(req, res),
);
router.patch(
  "/:projectId",
  validate(projectIdParam, "params"),
  validate(updateProjectSchema),
  (req, res) => projectController.updateProject(req, res),
);
router.delete("/:projectId", validate(projectIdParam, "params"), (req, res) =>
  projectController.deleteProject(req, res),
);

router.post(
  "/:projectId/files",
  validate(projectIdParam, "params"),
  validate(createFileSchema),
  (req, res) => projectController.createFile(req, res),
);
router.post("/:projectId/upload", validate(projectIdParam, "params"), (req, res) =>
  projectController.uploadFiles(req, res),
);
router.put("/files/:fileId", validate(updateFileSchema), (req, res) =>
  projectController.updateFile(req, res),
);
router.patch("/files/:fileId/rename", (req, res) => projectController.renameFile(req, res));
router.patch("/files/:fileId/move", (req, res) => ideController.moveFile(req, res));
router.delete("/files/:fileId", (req, res) => projectController.deleteFile(req, res));

router.get("/:projectId/logs", validate(projectIdParam, "params"), (req, res) =>
  projectController.getLogs(req, res),
);
router.post("/:projectId/logs", validate(projectIdParam, "params"), (req, res) =>
  projectController.addLog(req, res),
);

router.get("/:projectId/executions", validate(projectIdParam, "params"), (req, res) =>
  projectController.getExecutions(req, res),
);
router.post("/:projectId/executions/:executionId/cancel", (req, res) =>
  ideController.cancelExecution(req, res),
);
router.get("/:projectId/diffs", validate(projectIdParam, "params"), (req, res) =>
  projectController.getDiffs(req, res),
);
router.post("/:projectId/diffs/:diffId/accept", (req, res) =>
  projectController.acceptDiff(req, res),
);
router.post("/:projectId/diffs/:diffId/reject", (req, res) =>
  projectController.rejectDiff(req, res),
);

router.post(
  "/:projectId/ai-edit",
  aiLimiter,
  validate(projectIdParam, "params"),
  (req, res) => projectController.aiEdit(req, res),
);
router.get("/:projectId/problems", validate(projectIdParam, "params"), (req, res) =>
  projectController.analyzeProblems(req, res),
);

router.post("/:projectId/sync", validate(projectIdParam, "params"), (req, res) =>
  ideController.syncWorkspace(req, res),
);
router.get("/:projectId/detect", validate(projectIdParam, "params"), (req, res) =>
  ideController.detectType(req, res),
);
router.post(
  "/:projectId/run",
  validate(projectIdParam, "params"),
  validate(runCommandSchema),
  (req, res) => ideController.startRun(req, res),
);
router.post("/:projectId/stop", validate(projectIdParam, "params"), (req, res) =>
  ideController.stopRun(req, res),
);
router.get("/:projectId/runs", validate(projectIdParam, "params"), (req, res) =>
  ideController.listRuns(req, res),
);
router.get("/:projectId/runs/:runId", (req, res) => ideController.getRun(req, res));

router.get("/:projectId/layout", validate(projectIdParam, "params"), (req, res) =>
  ideController.getLayout(req, res),
);
router.put("/:projectId/layout", validate(projectIdParam, "params"), (req, res) =>
  ideController.saveLayout(req, res),
);

router.get(
  "/:projectId/terminals",
  terminalLimiter,
  validate(projectIdParam, "params"),
  (req, res) => ideController.listTerminals(req, res),
);
router.post(
  "/:projectId/terminals",
  terminalLimiter,
  validate(projectIdParam, "params"),
  (req, res) => ideController.createTerminal(req, res),
);
router.delete(
  "/:projectId/terminals/:sessionId",
  terminalLimiter,
  validate(projectIdParam, "params"),
  (req, res) => ideController.deleteTerminal(req, res),
);

router.get(
  "/:projectId/git/status",
  gitLimiter,
  validate(projectIdParam, "params"),
  (req, res) => ideController.gitStatus(req, res),
);
router.get(
  "/:projectId/git/diff",
  gitLimiter,
  validate(projectIdParam, "params"),
  (req, res) => ideController.gitDiff(req, res),
);
router.post(
  "/:projectId/git/stage",
  gitLimiter,
  validate(projectIdParam, "params"),
  validate(gitStageSchema),
  (req, res) => ideController.gitStage(req, res),
);
router.post(
  "/:projectId/git/commit",
  gitLimiter,
  validate(projectIdParam, "params"),
  validate(gitCommitSchema),
  (req, res) => ideController.gitCommit(req, res),
);
router.post(
  "/:projectId/git/checkout",
  gitLimiter,
  validate(projectIdParam, "params"),
  validate(gitCheckoutSchema),
  (req, res) => ideController.gitCheckout(req, res),
);
router.post(
  "/:projectId/git/push",
  gitLimiter,
  validate(projectIdParam, "params"),
  validate(gitRemoteSchema),
  (req, res) => ideController.gitPush(req, res),
);
router.post(
  "/:projectId/git/pull",
  gitLimiter,
  validate(projectIdParam, "params"),
  validate(gitRemoteSchema),
  (req, res) => ideController.gitPull(req, res),
);

module.exports = router;
