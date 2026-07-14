const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const uploadDocument = require("../middleware/upload-document.middleware");
const {
  uploadDocument: uploadHandler,
  getDocuments,
  deleteDocument,
} = require("../controllers/document.controller");

router.post("/upload", protect, uploadDocument.single("file"), uploadHandler);
router.get("/", protect, getDocuments);
router.delete("/:id", protect, deleteDocument);

module.exports = router;
