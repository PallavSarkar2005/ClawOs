const express = require("express");
const protect = require("../middleware/auth.middleware");
const { apiLimiter } = require("../middleware/rate-limit.middleware");
const ctrl = require("../controllers/intelligence.controller");

const router = express.Router({ mergeParams: true });

router.use(protect);
router.use(apiLimiter());

router.get("/status", ctrl.status);
router.post("/index", ctrl.index);
router.get("/graphs", ctrl.graphs);
router.get("/symbols", ctrl.symbols);
router.get("/search", ctrl.search);
router.post("/search", ctrl.search);
router.get("/definition", ctrl.definition);
router.get("/references", ctrl.references);
router.get("/peek", ctrl.peek);
router.get("/call-hierarchy", ctrl.callHierarchy);
router.get("/type-hierarchy", ctrl.typeHierarchy);
router.get("/breadcrumbs", ctrl.breadcrumbs);
router.post("/ask", ctrl.ask);
router.get("/ask", ctrl.ask);
router.post("/impact", ctrl.impact);
router.get("/impact", ctrl.impact);
router.post("/rename", ctrl.rename);
router.get("/metrics", ctrl.metrics);
router.get("/debt", ctrl.debt);
router.get("/architecture", ctrl.architecture);
router.get("/memory", ctrl.memory);
router.post("/memory", ctrl.memory);
router.get("/observability", ctrl.observability);

module.exports = router;
