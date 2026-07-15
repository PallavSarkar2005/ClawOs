const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { validate } = require("../middleware/validate.middleware");
const { createSkillSchema, idParam } = require("../validators/common.validator");
const {
  getSkills,
  createSkill,
  deleteSkill,
} = require("../controllers/skill.controller");

router.get("/", protect, getSkills);
router.post("/", protect, validate(createSkillSchema), createSkill);
router.delete("/:id", protect, validate(idParam, "params"), deleteSkill);

module.exports = router;
