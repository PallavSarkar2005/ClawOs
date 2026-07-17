const axios = require("axios");
const { NODE_TYPES } = require("../constants");
const { evaluate } = require("../expression/engine");
const { runSandboxed } = require("../security/sandbox");

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      return reject(Object.assign(new Error("Cancelled"), { code: "CANCELLED" }));
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(Object.assign(new Error("Cancelled"), { code: "CANCELLED" }));
    };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

async function handleStart(node, ctx) {
  return {
    outputs: { started: true, at: new Date().toISOString(), inputs: ctx.variables.layers.inputs },
    branch: null,
  };
}

async function handleEnd(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  return {
    outputs: {
      finished: true,
      at: new Date().toISOString(),
      result: config.result ?? ctx.variables.layers.outputs,
    },
    branch: null,
    terminal: true,
  };
}

async function handleCondition(node, ctx) {
  const config = node.config || {};
  const expr = config.expression || config.condition || "true";
  const result = Boolean(evaluate(ctx.vars.interpolate(String(expr)), ctx.vars.flat()));
  return {
    outputs: { result, branch: result ? "true" : "false" },
    branch: result ? "true" : "false",
  };
}

async function handleLoop(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const items = Array.isArray(config.items)
    ? config.items
    : Array.isArray(config.collection)
      ? config.collection
      : [];
  const maxIterations = Number(config.maxIterations || items.length || 1);
  const stateKey = `__loop_${node.id}`;
  const state = ctx.variables.layers.workflow[stateKey] || { index: 0, results: [] };
  const index = state.index;

  if (index >= maxIterations || (items.length && index >= items.length)) {
    ctx.variables.set(stateKey, undefined);
    return {
      outputs: { done: true, results: state.results, iterations: index },
      branch: "done",
    };
  }

  const item = items.length ? items[index] : index;
  state.index = index + 1;
  state.results.push(item);
  ctx.variables.set(stateKey, state);
  ctx.variables.set("loop", { index, item, iteration: index + 1 });

  return {
    outputs: { index, item, iteration: index + 1, continue: true },
    branch: "body",
    loopContinue: true,
  };
}

async function handleDelay(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const ms = Number(config.ms || config.delayMs || config.seconds * 1000 || 1000);
  await sleep(Math.min(Math.max(ms, 0), 30 * 60 * 1000), ctx.signal);
  return { outputs: { delayedMs: ms }, branch: null };
}

async function handleTimer(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const until = config.until ? new Date(config.until).getTime() : Date.now() + Number(config.ms || 0);
  const wait = Math.max(0, until - Date.now());
  await sleep(Math.min(wait, 30 * 60 * 1000), ctx.signal);
  return { outputs: { firedAt: new Date().toISOString() }, branch: null };
}

async function handleWait(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  if (config.resumeToken || config.event) {
    return {
      outputs: { waiting: true, event: config.event || "manual" },
      waiting: true,
      waitPayload: { event: config.event, token: config.resumeToken || node.id },
    };
  }
  const ms = Number(config.ms || 0);
  if (ms > 0) await sleep(Math.min(ms, 30 * 60 * 1000), ctx.signal);
  return { outputs: { waited: true }, branch: null };
}

async function handleApproval(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  if (ctx.approvalDecision) {
    const approved = Boolean(ctx.approvalDecision.approved);
    return {
      outputs: {
        approved,
        decidedBy: ctx.approvalDecision.decidedBy,
        comment: ctx.approvalDecision.comment || null,
      },
      branch: approved ? "approved" : "rejected",
    };
  }
  return {
    outputs: { pending: true, message: config.message || "Approval required" },
    awaitingApproval: true,
    approval: {
      nodeKey: node.id,
      message: config.message || "Approval required",
      timeoutMs: config.timeoutMs || null,
    },
  };
}

async function handleRetry(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  return {
    outputs: {
      maxAttempts: Number(config.maxAttempts || 3),
      backoffMs: Number(config.backoffMs || 500),
    },
    retryPolicy: {
      maxAttempts: Number(config.maxAttempts || 3),
      backoffMs: Number(config.backoffMs || 500),
      exponential: config.exponential !== false,
    },
    branch: null,
  };
}

async function handleHttp(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const method = String(config.method || "GET").toUpperCase();
  const url = config.url;
  if (!url) throw new Error("HTTP node requires url");
  const res = await axios({
    method,
    url,
    headers: config.headers || {},
    data: config.body ?? config.data,
    params: config.params,
    timeout: Number(config.timeoutMs || 30000),
    validateStatus: () => true,
    signal: ctx.signal,
  });
  return {
    outputs: {
      status: res.status,
      headers: res.headers,
      data: res.data,
      ok: res.status >= 200 && res.status < 300,
    },
    branch: res.status >= 200 && res.status < 300 ? "success" : "error",
  };
}

async function handleWebhook(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  if (config.mode === "receive" || config.wait) {
    if (ctx.triggerData?.webhookBody != null) {
      return {
        outputs: {
          body: ctx.triggerData.webhookBody,
          headers: ctx.triggerData.webhookHeaders || {},
        },
        branch: null,
      };
    }
    return {
      outputs: { waiting: true },
      waiting: true,
      waitPayload: { type: "webhook", nodeKey: node.id },
    };
  }
  return handleHttp(
    { ...node, config: { method: config.method || "POST", url: config.url, body: config.body, headers: config.headers } },
    ctx,
  );
}

async function handleLlm(node, ctx) {
  const { chat } = require("../../runtime/llm.client");
  const config = ctx.vars.resolve(node.config || {});
  const prompt = config.prompt || config.message || "";
  const system = config.system || "You are a helpful assistant inside an OpenClaw workflow.";
  const result = await chat({
    messages: [
      { role: "system", content: system },
      { role: "user", content: String(prompt) },
    ],
    model: config.model,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
    userId: ctx.userId,
  });
  const text = result?.content || result?.text || result?.reply || String(result);
  const tokens = result?.usage?.total_tokens || result?.totalTokens || 0;
  return {
    outputs: { text, content: text, usage: result?.usage || {} },
    tokensUsed: tokens,
    branch: null,
  };
}

async function handleAgent(agentType, node, ctx) {
  const { coordinator } = require("../../runtime");
  const config = ctx.vars.resolve(node.config || {});
  const message =
    config.message ||
    config.prompt ||
    ctx.vars.get("inputs.message") ||
    `Execute ${agentType} agent task for workflow node ${node.label || node.id}`;

  const result = await coordinator.run({
    userId: ctx.userId,
    conversationId: ctx.conversationId || null,
    projectId: ctx.projectId || config.projectId || null,
    documentId: config.documentId || null,
    message: String(message),
    skillPrompt: config.skillPrompt || "",
    workflowPrompt: `Workflow node ${node.id} (${agentType}): ${config.instructions || ""}`,
    settings: {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      preferredAgent: agentType === "coordinator" ? null : agentType.replace("_agent", ""),
    },
    maxRetries: config.maxRetries ?? 1,
    timeoutMs: config.timeoutMs || ctx.nodeTimeoutMs || 120000,
    onEvent: (payload) => ctx.emit?.("agent", { nodeKey: node.id, ...payload }),
  });

  return {
    outputs: {
      reply: result.reply,
      status: result.status,
      executionId: result.executionId,
      plan: result.plan,
      metrics: result.metrics,
    },
    tokensUsed: result.metrics?.totalTokens || 0,
    agentActivity: {
      agent: agentType,
      executionId: result.executionId,
      status: result.status,
    },
    branch: result.status === "COMPLETED" ? "success" : "error",
  };
}

async function handleCoordinator(node, ctx) {
  return handleAgent("coordinator", node, ctx);
}

async function handleTool(node, ctx) {
  const { executeTool } = require("../../tools");
  const config = ctx.vars.resolve(node.config || {});
  const toolId = config.tool || config.toolId || config.name;
  if (!toolId) throw new Error("Tool node requires tool id");
  const args = config.arguments || config.args || config.input || {};
  const result = await executeTool(toolId, args, {
    userId: ctx.userId,
    projectId: ctx.projectId || config.projectId,
    conversationId: ctx.conversationId,
    agentType: "workflow",
    executionId: ctx.executionId,
    stepId: node.id,
    signal: ctx.signal,
    emit: (event, data) => ctx.emit?.("tool", { nodeKey: node.id, event, data }),
  });
  if (!result.ok) {
    throw Object.assign(new Error(result.error || "Tool failed"), { toolResult: result });
  }
  return {
    outputs: { data: result.data, toolId, durationMs: result.durationMs },
    toolCalls: [{ toolId, args, result: result.data, durationMs: result.durationMs }],
    branch: "success",
  };
}

async function handleFilesystem(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const action = config.action || "read_file";
  const toolMap = {
    read: "filesystem.read_file",
    read_file: "filesystem.read_file",
    write: "filesystem.write_file",
    write_file: "filesystem.write_file",
    list: "filesystem.list_dir",
    list_dir: "filesystem.list_dir",
    search: "filesystem.search",
  };
  return handleTool(
    {
      ...node,
      config: {
        tool: toolMap[action] || config.tool || "filesystem.read_file",
        arguments: config.arguments || {
          path: config.path,
          content: config.content,
          query: config.query,
        },
        projectId: config.projectId,
      },
    },
    ctx,
  );
}

async function handleTerminal(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  return handleTool(
    {
      ...node,
      config: {
        tool: "terminal.execute",
        arguments: {
          command: config.command,
          cwd: config.cwd,
          timeoutMs: config.timeoutMs,
        },
        projectId: config.projectId,
      },
    },
    ctx,
  );
}

async function handleGit(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const action = config.action || "status";
  const toolMap = {
    status: "git.status",
    commit: "git.commit",
    diff: "git.diff",
    log: "git.log",
    branch: "git.branch",
    checkout: "git.checkout",
    push: "git.push",
    pull: "git.pull",
  };
  return handleTool(
    {
      ...node,
      config: {
        tool: toolMap[action] || config.tool || "git.status",
        arguments: config.arguments || { message: config.message, branch: config.branch },
        projectId: config.projectId,
      },
    },
    ctx,
  );
}

async function handleBrowser(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  return handleTool(
    {
      ...node,
      config: {
        tool: config.tool || "browser.navigate",
        arguments: config.arguments || { url: config.url, selector: config.selector },
      },
    },
    ctx,
  );
}

async function handleMemory(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const action = config.action || "search";
  if (action === "create" || action === "write") {
    const { memoryService } = require("../../memory");
    const mem = await memoryService.create(ctx.userId, {
      content: config.content,
      scope: config.scope || "USER",
      projectId: ctx.projectId,
      importance: config.importance ?? 0.6,
      tags: [...(config.tags || []), "workflow"],
      metadata: { workflowExecutionId: ctx.executionId, nodeKey: node.id },
      source: "workflow",
    });
    return { outputs: { memory: mem }, branch: null };
  }
  return handleTool(
    {
      ...node,
      config: {
        tool: "memory.search",
        arguments: { query: config.query || config.content, topK: config.topK || 8 },
      },
    },
    ctx,
  );
}

async function handleKnowledge(node, ctx) {
  const { knowledgeRetrieval } = require("../../knowledge");
  const config = ctx.vars.resolve(node.config || {});
  const query = config.query || ctx.vars.get("inputs.query") || ctx.vars.get("inputs.message") || "";
  const results = await knowledgeRetrieval.hybridSearch(ctx.userId, String(query), {
    topK: config.topK || 10,
    threshold: config.threshold,
    projectId: ctx.projectId || config.projectId,
    scope: config.scope || "USER",
    persist: true,
  });
  return {
    outputs: {
      results: results.results,
      count: results.count,
      latencyMs: results.latencyMs,
      query: String(query),
    },
    branch: null,
  };
}

async function handleContext(node, ctx) {
  const { contextEngine } = require("../../context");
  const config = ctx.vars.resolve(node.config || {});
  const query = config.query || ctx.vars.get("inputs.message") || ctx.vars.get("inputs.query") || "";
  const built = await contextEngine.build(ctx.userId, String(query), {
    conversationId: ctx.conversationId,
    projectId: ctx.projectId || config.projectId,
    agentType: config.agentType || "workflow",
    agentExecutionId: ctx.executionId,
    workflowPrompt: config.workflowPrompt,
    tokenBudget: config.tokenBudget || 5500,
    topK: config.topK || 16,
    persist: true,
  });
  return {
    outputs: {
      text: built.text,
      citations: built.citations,
      usedTokens: built.usedTokens,
      sessionId: built.sessionId,
    },
    tokensUsed: built.usedTokens || 0,
    branch: null,
  };
}

async function handleIntelligence(node, ctx) {
  const intelligence = require("../../intelligence");
  const config = ctx.vars.resolve(node.config || {});
  const projectId = ctx.projectId || config.projectId;
  if (!projectId) throw new Error("Workspace Intelligence node requires projectId");
  const action = config.action || "ask";
  let result;
  if (action === "status") {
    result = await intelligence.getStatus(projectId, ctx.userId);
  } else if (action === "graphs") {
    result = await intelligence.getGraphs(projectId, ctx.userId);
  } else if (action === "symbols") {
    result = await intelligence.getSymbols(projectId, ctx.userId, config);
  } else if (action === "impact") {
    result = await intelligence.impact(projectId, ctx.userId, config);
  } else {
    result = await intelligence.ask(
      projectId,
      ctx.userId,
      config.query || ctx.vars.get("inputs.message") || "",
    );
  }
  return { outputs: { result }, branch: null };
}

async function handleNotification(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const payload = {
    channel: config.channel || "in_app",
    title: config.title || "Workflow notification",
    message: config.message || "",
    at: new Date().toISOString(),
  };
  ctx.emit?.("notification", payload);
  return { outputs: payload, branch: null };
}

async function handleEmail(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const payload = {
    to: config.to,
    subject: config.subject,
    body: config.body || config.message,
    sent: false,
  };
  const webhook = config.webhookUrl;
  if (webhook) {
    await axios.post(webhook, payload, { timeout: 15000 });
    payload.sent = true;
  }
  return { outputs: payload, branch: payload.sent ? "sent" : "queued" };
}

async function handleSlack(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const webhook = config.webhookUrl;
  if (!webhook) {
    return {
      outputs: { sent: false, message: config.message, reason: "no_webhook" },
      branch: "skipped",
    };
  }
  await axios.post(webhook, { text: config.message || config.text }, { timeout: 15000 });
  return { outputs: { sent: true, message: config.message }, branch: "sent" };
}

async function handleDiscord(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const webhook = config.webhookUrl;
  if (!webhook) {
    return {
      outputs: { sent: false, message: config.message, reason: "no_webhook" },
      branch: "skipped",
    };
  }
  await axios.post(webhook, { content: config.message || config.content }, { timeout: 15000 });
  return { outputs: { sent: true }, branch: "sent" };
}

async function handleGithub(node, ctx) {
  const config = ctx.vars.resolve(node.config || {});
  const action = config.action || "get_repo";
  return handleTool(
    {
      ...node,
      config: {
        tool: config.tool || `github.${action}`,
        arguments: config.arguments || config,
      },
    },
    ctx,
  ).catch(async () => {
    // Fallback: HTTP to GitHub API if tool missing
    if (!config.token && !process.env.GITHUB_TOKEN) {
      return {
        outputs: { ok: false, reason: "github_tool_unavailable" },
        branch: "skipped",
      };
    }
    const token = config.token || process.env.GITHUB_TOKEN;
    const res = await axios({
      method: config.method || "GET",
      url: config.url || `https://api.github.com/repos/${config.owner}/${config.repo}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "OpenClaw-Workflow",
      },
      data: config.body,
      timeout: 30000,
      validateStatus: () => true,
    });
    return {
      outputs: { status: res.status, data: res.data },
      branch: res.status < 400 ? "success" : "error",
    };
  });
}

async function handleCustomScript(node, ctx) {
  const config = node.config || {};
  const code = config.code || config.script || "";
  const result = runSandboxed(code, {
    inputs: ctx.vars.resolve(config.inputs || ctx.variables.layers.inputs),
    variables: ctx.vars.flat(),
    outputs: ctx.variables.layers.outputs,
  }, { timeoutMs: Number(config.timeoutMs || 5000) });
  return {
    outputs: {
      result: result.result,
      logs: result.logs,
    },
    logs: result.logs,
    branch: null,
  };
}

const HANDLERS = {
  [NODE_TYPES.START]: handleStart,
  [NODE_TYPES.END]: handleEnd,
  [NODE_TYPES.CONDITION]: handleCondition,
  [NODE_TYPES.LOOP]: handleLoop,
  [NODE_TYPES.DELAY]: handleDelay,
  [NODE_TYPES.TIMER]: handleTimer,
  [NODE_TYPES.WAIT]: handleWait,
  [NODE_TYPES.APPROVAL]: handleApproval,
  [NODE_TYPES.RETRY]: handleRetry,
  [NODE_TYPES.WEBHOOK]: handleWebhook,
  [NODE_TYPES.HTTP]: handleHttp,
  [NODE_TYPES.LLM]: handleLlm,
  [NODE_TYPES.COORDINATOR]: handleCoordinator,
  [NODE_TYPES.RESEARCH_AGENT]: (n, c) => handleAgent("research", n, c),
  [NODE_TYPES.ARCHITECT_AGENT]: (n, c) => handleAgent("architect", n, c),
  [NODE_TYPES.CODER_AGENT]: (n, c) => handleAgent("coder", n, c),
  [NODE_TYPES.REVIEWER_AGENT]: (n, c) => handleAgent("reviewer", n, c),
  [NODE_TYPES.TESTER_AGENT]: (n, c) => handleAgent("tester", n, c),
  [NODE_TYPES.TOOL]: handleTool,
  [NODE_TYPES.FILESYSTEM]: handleFilesystem,
  [NODE_TYPES.TERMINAL]: handleTerminal,
  [NODE_TYPES.GIT]: handleGit,
  [NODE_TYPES.BROWSER]: handleBrowser,
  [NODE_TYPES.MEMORY]: handleMemory,
  [NODE_TYPES.KNOWLEDGE_RETRIEVAL]: handleKnowledge,
  [NODE_TYPES.CONTEXT_RETRIEVAL]: handleContext,
  [NODE_TYPES.WORKSPACE_INTELLIGENCE]: handleIntelligence,
  [NODE_TYPES.NOTIFICATION]: handleNotification,
  [NODE_TYPES.EMAIL]: handleEmail,
  [NODE_TYPES.SLACK]: handleSlack,
  [NODE_TYPES.DISCORD]: handleDiscord,
  [NODE_TYPES.GITHUB]: handleGithub,
  [NODE_TYPES.CUSTOM_SCRIPT]: handleCustomScript,
  [NODE_TYPES.CODE]: handleCustomScript,
};

async function executeNode(node, ctx) {
  const handler = HANDLERS[node.type];
  if (!handler) {
    throw Object.assign(new Error(`No handler for node type: ${node.type}`), {
      code: "UNKNOWN_NODE_TYPE",
    });
  }
  return handler(node, ctx);
}

module.exports = {
  executeNode,
  HANDLERS,
  sleep,
};
