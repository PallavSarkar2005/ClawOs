const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const projectController = require("../controllers/project.controller");
const ideController = require("../controllers/ide.controller");

router.get("/", protect, (req, res) => projectController.getProjects(req, res));
router.post("/", protect, (req, res) => projectController.createProject(req, res));
router.put("/reorder", protect, (req, res) => projectController.reorderProjects(req, res));

router.get("/:projectId", protect, (req, res) => projectController.getProjectDetails(req, res));
router.patch("/:projectId", protect, (req, res) => projectController.updateProject(req, res));
router.delete("/:projectId", protect, (req, res) => projectController.deleteProject(req, res));

router.post("/:projectId/files", protect, (req, res) => projectController.createFile(req, res));
router.post("/:projectId/upload", protect, (req, res) => projectController.uploadFiles(req, res));
router.put("/files/:fileId", protect, (req, res) => projectController.updateFile(req, res));
router.patch("/files/:fileId/rename", protect, (req, res) => projectController.renameFile(req, res));
router.patch("/files/:fileId/move", protect, (req, res) => ideController.moveFile(req, res));
router.delete("/files/:fileId", protect, (req, res) => projectController.deleteFile(req, res));

router.get("/:projectId/logs", protect, (req, res) => projectController.getLogs(req, res));
router.post("/:projectId/logs", protect, (req, res) => projectController.addLog(req, res));

router.get("/:projectId/executions", protect, (req, res) => projectController.getExecutions(req, res));
router.post("/:projectId/executions/:executionId/cancel", protect, (req, res) =>
  ideController.cancelExecution(req, res)
);
router.get("/:projectId/diffs", protect, (req, res) => projectController.getDiffs(req, res));
router.post("/:projectId/diffs/:diffId/accept", protect, (req, res) => projectController.acceptDiff(req, res));
router.post("/:projectId/diffs/:diffId/reject", protect, (req, res) => projectController.rejectDiff(req, res));

router.post("/:projectId/ai-edit", protect, (req, res) => projectController.aiEdit(req, res));
router.get("/:projectId/problems", protect, (req, res) => projectController.analyzeProblems(req, res));

router.post("/:projectId/sync", protect, (req, res) => ideController.syncWorkspace(req, res));
router.get("/:projectId/detect", protect, (req, res) => ideController.detectType(req, res));
router.post("/:projectId/run", protect, (req, res) => ideController.startRun(req, res));
router.post("/:projectId/stop", protect, (req, res) => ideController.stopRun(req, res));
router.get("/:projectId/runs", protect, (req, res) => ideController.listRuns(req, res));
router.get("/:projectId/runs/:runId", protect, (req, res) => ideController.getRun(req, res));

router.get("/:projectId/layout", protect, (req, res) => ideController.getLayout(req, res));
router.put("/:projectId/layout", protect, (req, res) => ideController.saveLayout(req, res));

router.get("/:projectId/terminals", protect, (req, res) => ideController.listTerminals(req, res));
router.post("/:projectId/terminals", protect, (req, res) => ideController.createTerminal(req, res));
router.delete("/:projectId/terminals/:sessionId", protect, (req, res) =>
  ideController.deleteTerminal(req, res)
);

router.get("/:projectId/git/status", protect, (req, res) => ideController.gitStatus(req, res));
router.get("/:projectId/git/diff", protect, (req, res) => ideController.gitDiff(req, res));
router.post("/:projectId/git/stage", protect, (req, res) => ideController.gitStage(req, res));
router.post("/:projectId/git/commit", protect, (req, res) => ideController.gitCommit(req, res));
router.post("/:projectId/git/checkout", protect, (req, res) => ideController.gitCheckout(req, res));
router.post("/:projectId/git/push", protect, (req, res) => ideController.gitPush(req, res));
router.post("/:projectId/git/pull", protect, (req, res) => ideController.gitPull(req, res));

module.exports = router;
