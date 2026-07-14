const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  exportAccountData,
  downloadConversations,
  exportMemories,
  deleteAllMemories,
  deleteAllConversations,
  deleteAllDocuments,
  clearCache,
} = require("../controllers/data.controller");

router.get("/export", authMiddleware, exportAccountData);
router.get("/conversations", authMiddleware, downloadConversations);
router.get("/memories", authMiddleware, exportMemories);
router.delete("/memories", authMiddleware, deleteAllMemories);
router.delete("/conversations", authMiddleware, deleteAllConversations);
router.delete("/documents", authMiddleware, deleteAllDocuments);
router.delete("/cache", authMiddleware, clearCache);

module.exports = router;
