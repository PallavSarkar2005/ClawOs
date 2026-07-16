const express = require("express");
const protect = require("../middleware/auth.middleware");
const { memoryLimiter } = require("../middleware/rate-limit.middleware");
const ctrl = require("../controllers/knowledge.controller");

const router = express.Router();

router.use(protect);
router.use(memoryLimiter);

router.post("/search", ctrl.search);
router.get("/search", ctrl.search);
router.post("/search/hybrid", ctrl.hybridSearch);
router.post("/search/semantic", ctrl.semanticSearch);
router.get("/search/history", ctrl.searchHistory);

router.get("/graph/:id", ctrl.getGraph);
router.get("/graph-metrics", ctrl.graphMetrics);

router.get("/collections", ctrl.listCollections);
router.post("/collections", ctrl.createCollection);

router.get("/pinned", ctrl.listPinned);
router.get("/archived", ctrl.listArchived);
router.post("/memories/:id/reinforce", ctrl.reinforceMemory);

router.get("/index/status", ctrl.indexStatus);
router.post("/index/optimize", ctrl.optimizeIndexes);
router.get("/embeddings/status", ctrl.embeddingStatus);
router.post("/embeddings/backfill", ctrl.backfill);

router.get("/inspector/:id", ctrl.inspectRetrieval);
router.post("/evaluate", ctrl.evaluate);

router.get("/nodes", ctrl.listNodes);
router.get("/nodes/:id", ctrl.getNode);

module.exports = router;
