const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth.middleware");
const {
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
  testIntegration,
} = require("../controllers/integrations.controller");

router.get("/", authMiddleware, listIntegrations);
router.post("/connect", authMiddleware, connectIntegration);
router.post("/:provider/test", authMiddleware, testIntegration);
router.delete("/:provider", authMiddleware, disconnectIntegration);

module.exports = router;
