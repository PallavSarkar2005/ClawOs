const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
} = require("../controllers/workflow.controller");

router.get("/", protect, getWorkflows);

router.post("/", protect, createWorkflow);

router.delete("/:id", protect, deleteWorkflow);

module.exports = router;