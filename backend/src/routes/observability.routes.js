const express = require("express");
const protect = require("../middleware/auth.middleware");
const ctrl = require("../controllers/observability.controller");

const router = express.Router();

router.use(protect);

router.get("/dashboard", ctrl.dashboard);
router.get("/search", ctrl.search);
router.get("/metrics", ctrl.getMetrics);
router.get("/logs", ctrl.getLogs);
router.get("/alerts", ctrl.getAlerts);
router.post("/alerts/:id/acknowledge", ctrl.acknowledgeAlert);
router.post("/alerts/:id/resolve", ctrl.resolveAlert);

router.get("/traces/:traceId", ctrl.getTrace);
router.get("/traces/:traceId/timeline", ctrl.getTimeline);
router.get("/traces/:traceId/stream", ctrl.streamTrace);
router.get("/traces/:traceId/export", ctrl.exportTrace);
router.post("/traces/:traceId/replay", ctrl.createReplay);

router.get("/replays", ctrl.listReplays);
router.get("/replays/:id", ctrl.getReplay);
router.post("/replays/:id/play", ctrl.playReplay);

router.post("/actions", ctrl.recordUserAction);
router.post("/maintenance", ctrl.maintenance);

module.exports = router;
