const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const uploadDocument = require("../middleware/upload-document.middleware");
const { documentLimiter, uploadLimiter } = require("../middleware/rate-limit.middleware");
const { validate } = require("../middleware/validate.middleware");
const { idParam } = require("../validators/common.validator");
const {
  uploadDocument: uploadHandler,
  getDocuments,
  deleteDocument,
} = require("../controllers/document.controller");

router.post(
  "/upload",
  protect,
  uploadLimiter,
  documentLimiter,
  uploadDocument.single("file"),
  uploadHandler,
);
router.get("/", protect, documentLimiter, getDocuments);
router.delete(
  "/:id",
  protect,
  documentLimiter,
  validate(idParam, "params"),
  deleteDocument,
);

module.exports = router;
