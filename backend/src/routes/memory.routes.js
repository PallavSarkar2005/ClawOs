const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const {
  getMemories,
  createMemory,
  deleteMemory,
  deleteAllMemories,
} = require("../controllers/memory.controller");

router.get("/", protect, getMemories);

router.post("/", protect, createMemory);

router.delete("/", protect, deleteAllMemories);

router.delete("/:id", protect, deleteMemory);

module.exports = router;