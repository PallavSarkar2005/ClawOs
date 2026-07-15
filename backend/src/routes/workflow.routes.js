const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { createWorkflowSchema, idParam } = require("../validators/common.validator");
const {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
} = require("../controllers/workflow.controller");

router.get("/", protect, getWorkflows);
router.post("/", protect, validate(createWorkflowSchema), createWorkflow);
router.delete("/:id", protect, validate(idParam, "params"), deleteWorkflow);

module.exports = router;
