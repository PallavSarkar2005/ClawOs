const express = require("express");
const router = express.Router();
const protect = require("../middleware/auth.middleware");
const { chatLimiter } = require("../middleware/rate-limit.middleware");
const { validate } = require("../middleware/validate.middleware");
const { sendMessageSchema, idParam } = require("../validators/common.validator");
const {
  sendMessageStream,
  sendMessageRuntime,
  getExecution,
  listExecutions,
  cancelExecution,
  retryExecution,
  streamExecution,
} = require("../controllers/runtime.controller");

router.post(
  "/message",
  protect,
  chatLimiter,
  validate(sendMessageSchema),
  sendMessageRuntime,
);

router.post(
  "/message/stream",
  protect,
  chatLimiter,
  validate(sendMessageSchema),
  sendMessageStream,
);

router.get("/executions", protect, chatLimiter, listExecutions);
router.get("/executions/:id", protect, chatLimiter, validate(idParam, "params"), getExecution);
router.get(
  "/executions/:id/stream",
  protect,
  chatLimiter,
  validate(idParam, "params"),
  streamExecution,
);
router.post(
  "/executions/:id/cancel",
  protect,
  chatLimiter,
  validate(idParam, "params"),
  cancelExecution,
);
router.post(
  "/executions/:id/retry",
  protect,
  chatLimiter,
  validate(idParam, "params"),
  retryExecution,
);

module.exports = router;
