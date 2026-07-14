const express = require("express");
const protect = require("../middleware/auth.middleware");
const uploadDocument = require("../middleware/upload-document.middleware");
const ctrl = require("../controllers/memory.controller");

const router = express.Router();

router.use(protect);

// Stats & history
router.get("/stats", ctrl.memoryStats);
router.get("/history", ctrl.memoryHistory);

// Search & context
router.post("/search", ctrl.searchMemory);
router.get("/search", ctrl.searchMemory);
router.post("/context", ctrl.buildContext);

// Collections
router.get("/collections", ctrl.listCollections);
router.post("/collections", ctrl.createCollection);
router.patch("/collections/:id", ctrl.updateCollection);
router.delete("/collections/:id", ctrl.deleteCollection);
router.post("/collections/:id/items", ctrl.addToCollection);
router.delete("/collections/:id/items/:memoryId", ctrl.removeFromCollection);

// Relationships / graph
router.get("/relationships", ctrl.listRelationships);
router.post("/relationships", ctrl.createRelationship);
router.delete("/relationships/:id", ctrl.deleteRelationship);
router.get("/graph/:id", ctrl.traverseGraph);

// Documents (RAG)
router.get("/documents", ctrl.listDocuments);
router.post("/documents/upload", uploadDocument.single("file"), ctrl.uploadDocument);
router.get("/documents/:id", ctrl.getDocument);
router.get("/documents/:id/chunks", ctrl.getDocumentChunks);
router.delete("/documents/:id", ctrl.deleteDocument);
router.post("/documents/:id/reindex", ctrl.reindexDocument);

// Index jobs
router.get("/jobs", ctrl.listJobs);
router.get("/jobs/:jobId", ctrl.getJob);

// CRUD memories
router.get("/", ctrl.listMemories);
router.post("/", ctrl.createMemory);
router.delete("/", ctrl.deleteAllMemories);
router.get("/:id", ctrl.getMemory);
router.patch("/:id", ctrl.updateMemory);
router.post("/:id/pin", ctrl.pinMemory);
router.post("/:id/reembed", ctrl.reembedMemory);
router.delete("/:id", ctrl.deleteMemory);

module.exports = router;
