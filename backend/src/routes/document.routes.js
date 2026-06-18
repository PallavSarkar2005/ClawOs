const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const upload = require("../middleware/upload.middleware");

const {
  uploadDocument,
  getDocuments,
  deleteDocument,
} = require("../controllers/document.controller");

router.post("/upload", protect, upload.single("file"), uploadDocument);

router.get("/", protect, getDocuments);

router.delete("/:id", protect, deleteDocument);

module.exports = router;
