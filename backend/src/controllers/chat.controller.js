const prisma = require("../database/prisma");
const { sendMessageRuntime } = require("./runtime.controller");

// ======================================
// CREATE CONVERSATION
// ======================================

async function createConversation(req, res) {
  try {
    const conversation = await prisma.conversation.create({
      data: {
        title: "New Chat",
        userId: req.user.id,
      },
    });

    res.status(201).json(conversation);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

// ======================================
// GET CONVERSATIONS
// ======================================

async function getConversations(req, res) {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        userId: req.user.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json(conversations);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      message: "Server Error",
    });
  }
}

// ======================================
// SEND MESSAGE — multi-agent runtime
// ======================================

async function sendMessage(req, res) {
  return sendMessageRuntime(req, res);
}

// ======================================
// GET MESSAGES
// ======================================

async function getMessages(req, res) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: {
        id: req.params.conversationId,
      },
    });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    if (conversation.userId !== req.user.id) {
      return res.status(403).json({
        message: "Unauthorized",
      });
    }

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
      message: "Server Error",
    });
  }
}

// ======================================
// DELETE CONVERSATION
// ======================================

async function deleteConversation(req, res) {
  try {
    const { id } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: req.user.id },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "Conversation not found",
      });
    }

    await prisma.conversation.delete({
      where: { id: conversation.id },
    });

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

module.exports = {
  createConversation,
  getConversations,
  sendMessage,
  getMessages,
  deleteConversation,
};
