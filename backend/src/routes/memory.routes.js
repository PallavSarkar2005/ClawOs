const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const {
  getMemories,
  deleteMemory,
} = require("../controllers/memory.controller");

router.get("/", protect, getMemories);

router.delete("/:id", protect, deleteMemory);

module.exports = router;
