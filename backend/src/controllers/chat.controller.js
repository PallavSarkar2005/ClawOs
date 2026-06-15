const prisma = require("../database/prisma");
const coordinatorAgent = require("../agents/coordinator.agent");

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

async function sendMessage(req, res) {
  try {
    const { conversationId, message } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        message: "conversationId and message required",
      });
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        id: conversationId,
      },
    });

    if (!conversation) {
      return res.status(404).json({
        message: "Conversation not found",
      });
    }

    await prisma.message.create({
      data: {
        role: "user",
        content: message,
        conversationId,
      },
    });

    if (conversation.title === "New Chat") {
      await prisma.conversation.update({
        where: {
          id: conversationId,
        },
        data: {
          title: message.slice(0, 50),
        },
      });
    }

    const aiReply = await coordinatorAgent(message);

    await prisma.message.create({
      data: {
        role: "assistant",
        content: aiReply,
        conversationId,
      },
    });

    res.json({
      success: true,
      reply: aiReply,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || null,
    });
  }
}

async function getMessages(req, res) {
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
      message: "Server Error",
    });
  }
}

module.exports = {
  createConversation,
  getConversations,
  sendMessage,
  getMessages,
};