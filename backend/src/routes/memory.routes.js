const express = require("express");
const protect = require("../middleware/auth.middleware");
const uploadDocument = require("../middleware/upload-document.middleware");
const { memoryLimiter, uploadLimiter } = require("../middleware/rate-limit.middleware");
const { validate } = require("../middleware/validate.middleware");
const { memoryCreateSchema, idParam } = require("../validators/common.validator");
const ctrl = require("../controllers/memory.controller");

const router = express.Router();

router.use(protect);
router.use(memoryLimiter);

router.get("/stats", ctrl.memoryStats);
router.get("/history", ctrl.memoryHistory);

router.post("/search", ctrl.searchMemory);
router.get("/search", ctrl.searchMemory);
router.post("/context", ctrl.buildContext);

router.get("/collections", ctrl.listCollections);
router.post("/collections", ctrl.createCollection);
router.patch("/collections/:id", ctrl.updateCollection);
router.delete("/collections/:id", ctrl.deleteCollection);
router.post("/collections/:id/items", ctrl.addToCollection);
router.delete("/collections/:id/items/:memoryId", ctrl.removeFromCollection);

router.get("/relationships", ctrl.listRelationships);
router.post("/relationships", ctrl.createRelationship);
router.delete("/relationships/:id", ctrl.deleteRelationship);
router.get("/graph/:id", ctrl.traverseGraph);

router.get("/documents", ctrl.listDocuments);
router.post(
  "/documents/upload",
  uploadLimiter,
  uploadDocument.single("file"),
  ctrl.uploadDocument,
);
router.get("/documents/:id", ctrl.getDocument);
router.get("/documents/:id/chunks", ctrl.getDocumentChunks);
router.delete("/documents/:id", ctrl.deleteDocument);
router.post("/documents/:id/reindex", ctrl.reindexDocument);

router.get("/jobs", ctrl.listJobs);
router.get("/jobs/:jobId", ctrl.getJob);

router.get("/", ctrl.listMemories);
router.post("/", validate(memoryCreateSchema), ctrl.createMemory);
router.delete("/", ctrl.deleteAllMemories);
router.get("/:id", validate(idParam, "params"), ctrl.getMemory);
router.patch("/:id", ctrl.updateMemory);
router.post("/:id/pin", ctrl.pinMemory);
router.post("/:id/reembed", ctrl.reembedMemory);
router.delete("/:id", validate(idParam, "params"), ctrl.deleteMemory);

module.exports = router;
