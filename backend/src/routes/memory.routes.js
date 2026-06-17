const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const {
  getMemories,
  createMemory,
  deleteMemory,
} = require("../controllers/memory.controller");

router.get("/", protect, getMemories);

router.post("/", protect, createMemory);

router.delete("/:id", protect, deleteMemory);

module.exports = router;