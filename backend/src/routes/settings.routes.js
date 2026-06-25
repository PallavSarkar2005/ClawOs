const express = require("express");

const router = express.Router();

const authMiddleware = require("../middleware/auth.middleware");

const {
  getSettings,
  updateSettings,
} = require("../controllers/settings.controller");

// ======================================
// GET
// ======================================

router.get("/", authMiddleware, getSettings);

// ======================================
// UPDATE
// ======================================

router.put("/", authMiddleware, updateSettings);

module.exports = router;
