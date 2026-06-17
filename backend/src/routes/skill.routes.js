const express = require("express");

const router = express.Router();

const protect = require("../middleware/auth.middleware");

const {
  getSkills,
  createSkill,
  deleteSkill,
} = require("../controllers/skill.controller");

router.get("/", protect, getSkills);

router.post("/", protect, createSkill);

router.delete("/:id", protect, deleteSkill);

module.exports = router;