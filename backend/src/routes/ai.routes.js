const express = require("express");

const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { aiLimiter } = require("../middleware/rate-limit.middleware");

const {
  getModels,
  setProvider,
} = require("../controllers/ai.controller");

router.get("/models", protect, aiLimiter, getModels);
router.post("/provider", protect, aiLimiter, setProvider);

module.exports = router;
