const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { authLimiter, passwordResetLimiter } = require("../middleware/rate-limit.middleware");
const upload = require("../middleware/upload.middleware");
const authController = require("../controllers/auth.controller");

// Auth Core
router.post("/register", authLimiter, (req, res) => authController.register(req, res));
router.post("/login", authLimiter, (req, res) => authController.login(req, res));
router.post("/logout", protect, (req, res) => authController.logout(req, res));
router.post("/refresh", (req, res) => authController.refresh(req, res));
router.get("/me", protect, (req, res) => authController.me(req, res));
router.put("/profile", protect, (req, res, next) => {
  upload.single("avatar")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Avatar upload failed" });
    }
    return authController.updateProfile(req, res);
  });
});
router.put("/change-password", protect, (req, res) => authController.changePassword(req, res));
router.post("/forgot-password", passwordResetLimiter, (req, res) => authController.forgotPassword(req, res));
router.post("/reset-password", passwordResetLimiter, (req, res) => authController.resetPassword(req, res));
router.get("/verify-email", (req, res) => authController.verifyEmail(req, res));
router.delete("/account", protect, (req, res) => authController.deleteAccount(req, res));

// Session Management
router.get("/sessions", protect, (req, res) => authController.getSessions(req, res));
router.delete("/sessions/:sessionId", protect, (req, res) => authController.revokeSession(req, res));
router.delete("/sessions", protect, (req, res) => authController.revokeAllSessions(req, res));

module.exports = router;
