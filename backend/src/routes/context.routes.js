const express = require("express");
const protect = require("../middleware/auth.middleware");
const ctrl = require("../controllers/context.controller");

const router = express.Router();

router.use(protect);

router.post("/preview", ctrl.preview);
router.post("/rank", ctrl.rank);
router.post("/compress", ctrl.compress);
router.post("/allocation", ctrl.allocation);
router.post("/debug/retrieval", ctrl.debugRetrieval);
router.get("/sessions", ctrl.listSessions);
router.get("/sessions/:id", ctrl.inspect);
router.post("/sessions/:id/replay", ctrl.replay);
router.get("/cache", ctrl.cacheStats);
router.post("/cache/invalidate", ctrl.invalidateCache);

module.exports = router;
