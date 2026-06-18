const prisma = require("../database/prisma");
const coordinatorAgent = require("../agents/coordinator.agent");
const shouldSaveMemory = require("../agents/memory.agent");
const routeSkill = require("../agents/router.agent");

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
// SEND MESSAGE
// ======================================

async function sendMessage(req, res) {
  try {
    const { conversationId, message, skillId, workflowId } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        message: "conversationId and message required",
      });
    }

    // ======================================
    // LOAD CONVERSATION
    // ======================================

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

    if (conversation.userId !== req.user.id) {
      return res.status(403).json({
        message: "Unauthorized",
      });
    }

    // ======================================
    // SAVE USER MESSAGE
    // ======================================

    await prisma.message.create({
      data: {
        role: "user",
        content: message,
        conversationId,
      },
    });

    // ======================================
    // UPDATE CHAT TITLE
    // ======================================

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

    // ======================================
    // AUTO MEMORY SAVE
    // ======================================

    try {
      if (shouldSaveMemory(message)) {
        await prisma.memory.create({
          data: {
            content: message,
            userId: req.user.id,
          },
        });
      }
    } catch (memoryError) {
      console.error("Memory Save Error:", memoryError);
    }

    // ======================================
    // LOAD MEMORY CONTEXT
    // ======================================

    let memoryContext = "";

    try {
      const memories = await prisma.memory.findMany({
        where: {
          userId: req.user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      });

      memoryContext = memories
        .map((memory) => `- ${memory.content}`)
        .join("\n");
    } catch (memoryError) {
      console.error("Memory Load Error:", memoryError);
    }

    // ======================================
    // SKILLS
    // ======================================

    let selectedSkill = null;
    let skillPrompt = "";

    if (skillId) {
      const skill = await prisma.skill.findUnique({
        where: {
          id: skillId,
        },
      });

      if (skill && skill.enabled) {
        selectedSkill = skill;

        skillPrompt = skill.prompt;

        await prisma.skill.update({
          where: {
            id: skill.id,
          },
          data: {
            usageCount: {
              increment: 1,
            },
          },
        });
      }
    }

    // ======================================
    // AUTO SKILL ROUTER
    // ======================================

    if (!skillId) {
      selectedSkill = await routeSkill(req.user.id, message);

      if (selectedSkill) {
        skillPrompt = selectedSkill.prompt;

        await prisma.skill.update({
          where: {
            id: selectedSkill.id,
          },
          data: {
            usageCount: {
              increment: 1,
            },
          },
        });
      }
    }

    // ======================================
    // WORKFLOWS
    // ======================================

    let workflowPrompt = "";
    let selectedWorkflow = null;

    if (workflowId) {
      const workflow = await prisma.workflow.findUnique({
        where: {
          id: workflowId,
        },
      });

      if (workflow && workflow.enabled) {
        selectedWorkflow = workflow;

        workflowPrompt = workflow.prompt;
      }
    }

    // ======================================
    // AI RESPONSE
    // ======================================

    let aiReply = "";

    try {
      aiReply = await coordinatorAgent(
        message,
        skillPrompt,
        workflowPrompt,
        memoryContext,
      );
    } catch (aiError) {
      console.error("AI Error:", aiError);

      aiReply =
        "AI service is temporarily unavailable. Please try again later.";
    }

    // ======================================
    // SAVE AI MESSAGE
    // ======================================

    await prisma.message.create({
      data: {
        role: "assistant",
        content: aiReply,
        conversationId,
      },
    });

    // ======================================
    // RESPONSE
    // ======================================

    return res.json({
      success: true,
      reply: aiReply,

      skill: selectedSkill?.name || null,

      workflow: selectedWorkflow?.name || null,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || null,
    });
  }
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

    await prisma.conversation.delete({
      where: {
        id,
      },
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
