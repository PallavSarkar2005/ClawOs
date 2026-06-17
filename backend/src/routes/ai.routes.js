const express = require("express");

const router = express.Router();

const {
  getModels,
  setProvider,
} = require("../controllers/ai.controller");

router.get("/models", getModels);

router.post("/provider", setProvider);

module.exports = router;