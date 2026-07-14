const prisma = require("../database/prisma");
const coordinatorAgent = require("../agents/coordinator.agent");
const shouldSaveMemory = require("../agents/memory.agent");
const routeSkill = require("../agents/router.agent");
const webSearch = require("../agents/websearch.agent");
const searchMemories = require("../agents/memory-search.agent");
const { memoryService, contextBuilder, citationEngine } = require("../memory");
const chooseTool = require("../agents/tool-router.agent");
const executeTool = require("../agents/tools.agent");
const runChain = require("../agents/chain.agent");

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
    const {
      conversationId,
      message,
      skillId,
      workflowId,
      documentId,
      webSearchEnabled,
    } = req.body;

    if (!conversationId || !message) {
      return res.status(400).json({
        message: "conversationId and message required",
      });
    }

    // ======================================
    // LOAD USER SETTINGS
    // ======================================

    let settings = await prisma.setting.findUnique({
      where: {
        userId: req.user.id,
      },
    });

    if (!settings) {
      settings = {
        defaultProvider: "openrouter",
        autoMemorySave: true,
        autoSkillRouting: true,
        webSearchDefault: false,
        temperature: 0.7,
        maxContext: 20,
      };
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
      if (settings.autoMemorySave && shouldSaveMemory(message)) {
        await memoryService.create(req.user.id, {
          content: message,
          scope: "CONVERSATION",
          conversationId,
          source: "auto-save",
          importance: 0.55,
          tags: ["conversation", "auto"],
        });
      }
    } catch (memoryError) {
      console.error("Memory Save Error:", memoryError);
    }

    // ======================================
    // LOAD MEMORY CONTEXT (RAG Context Builder)
    // ======================================

    let memoryContext = "";
    let ragCitations = [];

    try {
      const built = await contextBuilder.build(req.user.id, message, {
        tokenBudget: Math.max(1500, (settings.maxContext || 20) * 120),
        conversationId,
        documentId: documentId || null,
        topK: settings.maxContext || 12,
      });
      memoryContext = built.context || (await searchMemories(req.user.id, message));
      ragCitations = built.citations || [];
    } catch (memoryError) {
      console.error("Memory Load Error:", memoryError);
      try {
        memoryContext = await searchMemories(req.user.id, message);
      } catch {
        memoryContext = "";
      }
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

    if (settings.autoSkillRouting && !skillId) {
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
    // DOCUMENT CONTEXT SETUP & LOADING
    // ======================================

    let documentContext = "";

    if (documentId) {
      const document = await prisma.document.findUnique({
        where: {
          id: documentId,
        },
      });

      if (document) {
        documentContext = document.content.slice(0, 15000);
      }
    }

    // ======================================
    // WEB SEARCH CONTEXT
    // ======================================

    let webContext = "";

    if (webSearchEnabled) {
      try {
        webContext = await webSearch(message);
      } catch (searchError) {
        console.error("Web Search Error:", searchError);
      }
    }

    // ======================================
    // Tool Context
    // ======================================

    let toolContext = "";

    const tool = await chooseTool(message);

    if (tool) {
      toolContext = await executeTool(tool, {}, req.user.id);
    }

    // ======================================
    // AI RESPONSE
    // ======================================

    let aiReply;

    try {
      if (
        message.toLowerCase().includes("research") ||
        message.toLowerCase().includes("analyze")
      ) {
        aiReply = await runChain(message);
      } else {
        aiReply = await coordinatorAgent(
          message,
          skillPrompt,
          memoryContext,
          documentContext,
          webContext,
          toolContext,
          settings,
        );
      }
    } catch (aiError) {
      console.error("AI Error:", aiError);

      aiReply =
        "AI service is temporarily unavailable. Please try again later.";
    }

    // ======================================
    // SAVE AI MESSAGE
    // ======================================

    const annotated = citationEngine.annotateAnswer(aiReply, ragCitations);
    aiReply = annotated.answer;

    await prisma.message.create({
      data: {
        role: "assistant",
        content: aiReply,
        conversationId,
        citations: annotated.citations?.length ? annotated.citations : undefined,
      },
    });



    // ======================================
    // RESPONSE
    // ======================================

    return res.json({
      success: true,
      reply: aiReply,
      citations: annotated.citations || [],
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
