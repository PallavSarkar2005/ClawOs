const express = require("express");
const router = express.Router();

const protect = require("../middleware/auth.middleware");
const { chatLimiter } = require("../middleware/rate-limit.middleware");
const { validate } = require("../middleware/validate.middleware");
const {
  sendMessageSchema,
  idParam,
  conversationIdParam,
} = require("../validators/common.validator");

const {
  createConversation,
  getConversations,
  sendMessage,
  getMessages,
  deleteConversation,
} = require("../controllers/chat.controller");

router.post("/conversation", protect, chatLimiter, createConversation);

router.get("/conversation", protect, chatLimiter, getConversations);
router.get("/conversations", protect, chatLimiter, getConversations);

router.post("/message", protect, chatLimiter, validate(sendMessageSchema), sendMessage);


router.get(
  "/:conversationId",
  protect,
  chatLimiter,
  validate(conversationIdParam, "params"),
  getMessages,
);

router.delete(
  "/conversation/:id",
  protect,
  chatLimiter,
  validate(idParam, "params"),
  deleteConversation,
);

module.exports = router;
