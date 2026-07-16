const express = require("express");
const protect = require("../middleware/auth.middleware");
const ctrl = require("../controllers/tools.controller");

const router = express.Router();

router.use(protect);

router.get("/catalog", ctrl.catalog);
router.get("/", ctrl.listTools);
router.get("/active", ctrl.active);
router.get("/metrics", ctrl.metrics);
router.get("/executions", ctrl.listExecutions);
router.get("/executions/:id", ctrl.getExecution);
router.post("/executions/:id/replay", ctrl.replayExecution);
router.post("/executions/:id/cancel", ctrl.cancel);
router.post("/parallel", ctrl.parallelInvoke);
router.post("/plugins/reload", ctrl.reloadPlugins);
router.get("/mcp", ctrl.listMcp);
router.post("/mcp", ctrl.connectMcp);
router.delete("/mcp/:id", ctrl.disconnectMcp);
router.get("/:id", ctrl.getTool);
router.post("/:id/invoke", ctrl.invokeTool);

module.exports = router;
