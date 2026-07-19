const express = require("express");
const protect = require("../middleware/auth.middleware");
const ctrl = require("../controllers/autonomy.controller");

const router = express.Router();

router.use(protect);

router.get("/dashboard", ctrl.dashboard);
router.get("/agents", ctrl.listAgents);
router.get("/history", ctrl.getHistory);

router.post("/goals", ctrl.createGoalHandler);
router.get("/goals", ctrl.listGoalsHandler);
router.get("/goals/:id", ctrl.getGoalHandler);
router.patch("/goals/:id", ctrl.updateGoalHandler);
router.post("/goals/:id/plan", ctrl.planGoal);

router.post("/decompose", ctrl.decompose);
router.post("/execute", ctrl.startExecution);

router.get("/sessions", ctrl.listSessionsHandler);
router.get("/sessions/:id", ctrl.getSessionHandler);
router.get("/sessions/:id/progress", ctrl.getProgress);
router.get("/sessions/:id/stream", ctrl.streamSession);
router.post("/sessions/:id/cancel", ctrl.cancelSession);
router.post("/sessions/:id/resume", ctrl.resumeSession);

router.get("/artifacts", ctrl.listArtifactsHandler);
router.get("/artifacts/:id", ctrl.getArtifactHandler);

router.get("/decisions", ctrl.listDecisionsHandler);

router.get("/approvals", ctrl.listApprovalsHandler);
router.post("/approvals/:id/resolve", ctrl.resolveApprovalHandler);

router.get("/builds", ctrl.listBuilds);
router.get("/tests", ctrl.listTests);
router.get("/reviews", ctrl.listReviews);

module.exports = router;
