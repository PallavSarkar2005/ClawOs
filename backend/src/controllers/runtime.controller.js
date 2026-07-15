const prisma = require("../database/prisma");
const {
  coordinator,
  persistence,
  initSSE,
  sendSSE,
  endSSE,
  STREAM_EVENTS,
} = require("../runtime");
const shouldSaveMemory = require("../agents/memory.agent");
const routeSkill = require("../agents/router.agent");
const webSearch = require("../agents/websearch.agent");
const { memoryService, contextBuilder, citationEngine } = require("../memory");

async function resolveChatContext(req, body) {
  const {
    conversationId,
    message,
    skillId,
    workflowId,
    documentId,
    webSearchEnabled,
    projectId,
  } = body;

  let settings = await prisma.setting.findUnique({ where: { userId: req.user.id } });
  if (!settings) {
    settings = {
      defaultProvider: "openrouter",
      defaultModel: "meta-llama/llama-3.3-70b-instruct",
      autoMemorySave: true,
      autoSkillRouting: true,
      webSearchDefault: false,
      temperature: 0.7,
      maxContext: 20,
      maxTokens: 4096,
    };
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
  });
  if (!conversation) {
    const err = new Error("Conversation not found");
    err.status = 404;
    throw err;
  }
  if (conversation.userId !== req.user.id) {
    const err = new Error("Unauthorized");
    err.status = 403;
    throw err;
  }

  await prisma.message.create({
    data: { role: "user", content: message, conversationId },
  });

  if (conversation.title === "New Chat") {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: message.slice(0, 50) },
    });
  }

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
  } catch (e) {
    console.error("Memory Save Error:", e.message);
  }

  let citations = [];
  try {
    const built = await contextBuilder.build(req.user.id, message, {
      tokenBudget: Math.max(1500, (settings.maxContext || 20) * 120),
      conversationId,
      documentId: documentId || null,
      projectId: projectId || null,
      topK: settings.maxContext || 12,
    });
    citations = built.citations || [];
  } catch {
    /* ignore */
  }

  let selectedSkill = null;
  let skillPrompt = "";
  if (skillId) {
    const skill = await prisma.skill.findFirst({
      where: { id: skillId, userId: req.user.id },
    });
    if (skill?.enabled) {
      selectedSkill = skill;
      skillPrompt = skill.prompt;
      await prisma.skill.update({
        where: { id: skill.id },
        data: { usageCount: { increment: 1 } },
      });
    }
  } else if (settings.autoSkillRouting) {
    selectedSkill = await routeSkill(req.user.id, message);
    if (selectedSkill) {
      skillPrompt = selectedSkill.prompt;
      await prisma.skill.update({
        where: { id: selectedSkill.id },
        data: { usageCount: { increment: 1 } },
      });
    }
  }

  let selectedWorkflow = null;
  let workflowPrompt = "";
  if (workflowId) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, userId: req.user.id },
    });
    if (workflow?.enabled) {
      selectedWorkflow = workflow;
      workflowPrompt = workflow.prompt;
    }
  }

  let webContext = "";
  if (webSearchEnabled || settings.webSearchDefault) {
    try {
      webContext = await webSearch(message);
    } catch (e) {
      console.error("Web Search Error:", e.message);
    }
  }

  return {
    settings,
    conversation,
    citations,
    selectedSkill,
    skillPrompt,
    selectedWorkflow,
    workflowPrompt,
    webContext,
    projectId: projectId || null,
    documentId: documentId || null,
  };
}

/**
 * Streaming multi-agent message (SSE).
 */
async function sendMessageStream(req, res) {
  try {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) {
      return res.status(400).json({ message: "conversationId and message required" });
    }

    const ctx = await resolveChatContext(req, req.body);
    initSSE(res);

    sendSSE(res, "meta", {
      skill: ctx.selectedSkill?.name || null,
      workflow: ctx.selectedWorkflow?.name || null,
    });

    const result = await coordinator.run({
      userId: req.user.id,
      conversationId,
      projectId: ctx.projectId,
      documentId: ctx.documentId,
      message,
      skillPrompt: ctx.skillPrompt,
      workflowPrompt: ctx.workflowPrompt,
      webContext: ctx.webContext,
      settings: ctx.settings,
      citations: ctx.citations,
      onEvent: (payload) => {
        sendSSE(res, payload.event || "message", payload);
      },
    });

    const annotated = citationEngine.annotateAnswer
      ? citationEngine.annotateAnswer(result.reply, result.citations || ctx.citations)
      : { answer: result.reply, citations: result.citations || [] };

    await prisma.message.create({
      data: {
        role: "assistant",
        content: annotated.answer,
        conversationId,
        citations: annotated.citations?.length ? annotated.citations : undefined,
      },
    });

    sendSSE(res, STREAM_EVENTS.FINAL_RESPONSE, {
      content: annotated.answer,
      citations: annotated.citations || [],
      executionId: result.executionId,
      status: result.status,
      metrics: result.metrics || null,
      skill: ctx.selectedSkill?.name || null,
      workflow: ctx.selectedWorkflow?.name || null,
    });

    endSSE(res);
  } catch (error) {
    console.error("sendMessageStream:", error);
    if (!res.headersSent) {
      return res.status(error.status || 500).json({
        success: false,
        error: error.message,
      });
    }
    sendSSE(res, STREAM_EVENTS.ERROR, { message: error.message });
    endSSE(res);
  }
}

/**
 * Non-streaming multi-agent message (compatible JSON).
 */
async function sendMessageRuntime(req, res) {
  try {
    const { conversationId, message } = req.body;
    if (!conversationId || !message) {
      return res.status(400).json({ message: "conversationId and message required" });
    }

    const ctx = await resolveChatContext(req, req.body);
    const result = await coordinator.run({
      userId: req.user.id,
      conversationId,
      projectId: ctx.projectId,
      documentId: ctx.documentId,
      message,
      skillPrompt: ctx.skillPrompt,
      workflowPrompt: ctx.workflowPrompt,
      webContext: ctx.webContext,
      settings: ctx.settings,
      citations: ctx.citations,
    });

    const annotated = citationEngine.annotateAnswer
      ? citationEngine.annotateAnswer(result.reply, result.citations || ctx.citations)
      : { answer: result.reply, citations: result.citations || [] };

    await prisma.message.create({
      data: {
        role: "assistant",
        content: annotated.answer,
        conversationId,
        citations: annotated.citations?.length ? annotated.citations : undefined,
      },
    });

    return res.json({
      success: true,
      reply: annotated.answer,
      citations: annotated.citations || [],
      skill: ctx.selectedSkill?.name || null,
      workflow: ctx.selectedWorkflow?.name || null,
      executionId: result.executionId,
      status: result.status,
      plan: result.plan || null,
      metrics: result.metrics || null,
    });
  } catch (error) {
    console.error(error);
    return res.status(error.status || 500).json({
      success: false,
      error: error.message,
    });
  }
}

async function getExecution(req, res) {
  try {
    const execution = await persistence.getExecution(req.params.id, req.user.id);
    if (!execution) {
      return res.status(404).json({ message: "Execution not found" });
    }
    return res.json(execution);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function listExecutions(req, res) {
  try {
    const executions = await persistence.listExecutions(req.user.id, {
      conversationId: req.query.conversationId || null,
      limit: Number(req.query.limit) || 20,
    });
    return res.json(executions);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function cancelExecution(req, res) {
  try {
    const row = await coordinator.cancel(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ message: "Execution not found" });
    return res.json({ success: true, execution: row });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function retryExecution(req, res) {
  try {
    const result = await coordinator.resume(req.params.id, req.user.id, {
      message: req.body?.message,
      settings: req.body?.settings,
    });
    return res.json({ success: true, ...result });
  } catch (error) {
    return res.status(error.code === "NOT_FOUND" ? 404 : 500).json({
      message: error.message,
    });
  }
}

async function streamExecution(req, res) {
  try {
    const execution = await persistence.getExecution(req.params.id, req.user.id);
    if (!execution) {
      return res.status(404).json({ message: "Execution not found" });
    }

    initSSE(res);
    sendSSE(res, "snapshot", execution);

    const handle = coordinator.getActive(execution.id);
    if (!handle) {
      endSSE(res);
      return;
    }

    const onEvent = (payload) => {
      if (payload.executionId !== execution.id) return;
      sendSSE(res, payload.event || "message", payload);
      if (
        payload.event === STREAM_EVENTS.EXECUTION_COMPLETED ||
        payload.event === STREAM_EVENTS.EXECUTION_FAILED ||
        payload.event === STREAM_EVENTS.EXECUTION_CANCELLED
      ) {
        coordinator.off("event", onEvent);
        endSSE(res);
      }
    };
    coordinator.on("event", onEvent);

    req.on("close", () => {
      coordinator.off("event", onEvent);
    });
  } catch (error) {
    if (!res.headersSent) {
      return res.status(500).json({ message: error.message });
    }
    endSSE(res);
  }
}

module.exports = {
  sendMessageStream,
  sendMessageRuntime,
  getExecution,
  listExecutions,
  cancelExecution,
  retryExecution,
  streamExecution,
};
