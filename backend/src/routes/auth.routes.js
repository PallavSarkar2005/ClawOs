const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth.middleware");

const { register, login, me } = require("../controllers/auth.controller");

router.post("/register", register);
router.post("/login", login);
router.get("/me", protect, me);

router.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "Auth routes working",
  });
});

module.exports = router;
