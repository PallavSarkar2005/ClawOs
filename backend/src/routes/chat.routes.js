const express = require("express");
const router = express.Router();

const prisma = require("../database/prisma");
const protect = require("../middleware/auth.middleware");

const coordinatorAgent = require("../agents/coordinator.agent");
const {
  createConversation,
  getConversations,
  sendMessage,
  getMessages,
  deleteConversation,
} = require("../controllers/chat.controller");

/*
|--------------------------------------------------------------------------
| Conversations
|--------------------------------------------------------------------------
*/

router.post("/conversation", protect, createConversation);

router.get("/conversations", protect, getConversations);

router.post("/message", protect, sendMessage);

router.get("/:conversationId", protect, getMessages);

router.delete("/conversation/:id", protect, deleteConversation);

/*
|--------------------------------------------------------------------------
| Send Message
|--------------------------------------------------------------------------
*/

router.post("/message", protect, async (req, res) => {
  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        success: false,
        error: "conversationId and message are required",
      });
    }

    await prisma.message.create({
      data: {
        role: "user",
        content: message,
        conversationId,
      },
    });

    const reply = await coordinatorAgent(message);

    await prisma.message.create({
      data: {
        role: "assistant",
        content: reply,
        conversationId,
      },
    });

    res.json({
      success: true,
      reply,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
  }
});

/*
|--------------------------------------------------------------------------
| Get Messages
|--------------------------------------------------------------------------
*/

router.get("/:conversationId", protect, async (req, res) => {
  try {
    const messages = await prisma.message.findMany({
      where: {
        conversationId: req.params.conversationId,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    res.json(messages);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: "Something went wrong",
    });
  }
});

module.exports = router;
