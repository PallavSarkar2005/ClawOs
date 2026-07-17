const prisma = require("../../database/prisma");
const retrievalEngine = require("../../memory/services/retrieval.engine");
const { estimateTokens } = require("../../runtime/token");
const { keywordScore, MEMORY_SCOPES } = require("../../memory/utils");
const { compressConversation } = require("../compression");
const { analyzeProject, analyzeGitHistory } = require("../project-intelligence");
const { CONTEXT_SOURCES, ITEM_TYPES } = require("../constants");

async function retrieveConversation(userId, query, opts = {}) {
  const items = [];
  if (!opts.conversationId) return items;

  const msgs = await prisma.message.findMany({
    where: { conversationId: opts.conversationId },
    orderBy: { createdAt: "desc" },
    take: opts.messageLimit || 24,
  });
  const chronological = msgs.reverse();

  for (const m of chronological.slice(-8)) {
    items.push({
      source: CONTEXT_SOURCES.CONVERSATION,
      type: ITEM_TYPES.MESSAGE,
      sourceId: m.id,
      content: `${m.role}: ${m.content}`,
      similarity: query ? keywordScore(m.content, query) : 0.5,
      importance: m.role === "user" ? 0.7 : 0.55,
      timestamp: m.createdAt,
      reason: "Recent conversation message",
      tokenCount: estimateTokens(m.content),
      metadata: { role: m.role },
    });
  }

  // Conversation summary for older messages
  if (chronological.length > 8) {
    const older = chronological.slice(0, -8);
    const summarized = compressConversation(older, opts.summaryBudget || 450);
    if (summarized.summary) {
      items.push({
        source: CONTEXT_SOURCES.CONVERSATION_SUMMARY,
        type: ITEM_TYPES.SUMMARY,
        sourceId: `summary:${opts.conversationId}`,
        content: summarized.summary,
        similarity: 0.65,
        importance: 0.8,
        timestamp: older[older.length - 1]?.createdAt,
        reason: "Compressed older conversation turns",
        tokenCount: summarized.summaryTokens,
        metadata: {
          originalTokens: summarized.originalTokens,
          messageCount: older.length,
        },
      });
    }
  }

  return items;
}

async function retrieveMemory(userId, query, opts = {}) {
  const hybrid = await retrievalEngine.hybridSearch(userId, query, {
    topK: opts.topK || 16,
    projectId: opts.projectId || null,
    documentIds: opts.documentId ? [opts.documentId] : undefined,
    includeMemories: true,
    includeChunks: false,
    threshold: opts.threshold || 0.1,
  });

  const now = Date.now();
  return hybrid.results.map((r) => {
    const ageMs = now - new Date(r.updatedAt || r.createdAt || now).getTime();
    const isShortTerm = ageMs < 24 * 3600000;
    const isLongTerm = ageMs > 7 * 86400000 || r.pinned || (r.importance || 0) >= 0.75;
    let source = CONTEXT_SOURCES.SEMANTIC_MEMORY;
    if (r.pinned) source = CONTEXT_SOURCES.PINNED;
    else if (isShortTerm) source = CONTEXT_SOURCES.SHORT_TERM_MEMORY;
    else if (isLongTerm) source = CONTEXT_SOURCES.LONG_TERM_MEMORY;

    return {
      source,
      type: ITEM_TYPES.MEMORY,
      sourceId: r.id,
      content: r.content,
      similarity: r.hybridScore || r.semanticScore || 0,
      hybridScore: r.hybridScore,
      semanticScore: r.semanticScore,
      keywordScore: r.keywordScore,
      importance: r.importance ?? 0.5,
      confidence: r.confidence ?? r.scoring?.confidence ?? 0.7,
      frequency: r.frequency || 0,
      pinned: !!r.pinned,
      decay: r.decay,
      scope: r.scope,
      agentType: r.agentType,
      agentMatch: opts.agentType && r.agentType === opts.agentType,
      projectId: r.projectId,
      collectionId: r.collectionId || r.metadata?.collectionId,
      collectionWeight: r.collectionId ? 0.85 : 0,
      timestamp: r.lastAccessed || r.updatedAt || r.createdAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      reason: r.pinned
        ? "Pinned memory"
        : `Hybrid retrieval (sem=${(r.semanticScore || 0).toFixed(2)} kw=${(r.keywordScore || 0).toFixed(2)})`,
      tokenCount: estimateTokens(r.content),
      metadata: { ...(r.metadata || {}), tags: r.tags, scope: r.scope },
    };
  });
}

async function retrieveDocuments(userId, query, opts = {}) {
  const hybrid = await retrievalEngine.hybridSearch(userId, query, {
    topK: opts.topK || 12,
    projectId: opts.projectId || null,
    documentIds: opts.documentId ? [opts.documentId] : undefined,
    includeMemories: false,
    includeChunks: true,
    threshold: opts.threshold || 0.1,
  });

  return hybrid.results.map((r) => ({
    source: CONTEXT_SOURCES.DOCUMENTS,
    type: r.type === "chunk" ? ITEM_TYPES.CHUNK : ITEM_TYPES.DOCUMENT,
    sourceId: r.id,
    content: r.content,
    similarity: r.hybridScore || r.semanticScore || 0,
    hybridScore: r.hybridScore,
    semanticScore: r.semanticScore,
    importance: 0.65,
    confidence: r.confidence || r.hybridScore || 0.5,
    documentId: r.documentId,
    projectId: opts.projectId,
    timestamp: r.createdAt,
    reason: `Document chunk from ${r.documentName || r.documentId || "doc"}`,
    tokenCount: r.tokenCount || estimateTokens(r.content),
    metadata: {
      ...(r.metadata || {}),
      documentName: r.documentName,
      pageStart: r.pageStart,
      lineStart: r.lineStart,
      chunkIndex: r.metadata?.chunkIndex,
    },
  }));
}

async function retrieveWorkspace(userId, query, opts = {}) {
  const mem = await prisma.memory.findMany({
    where: {
      ownerId: userId,
      deletedAt: null,
      scope: MEMORY_SCOPES.WORKSPACE,
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
    },
    orderBy: [{ pinned: "desc" }, { lastAccessed: "desc" }],
    take: 20,
  });

  return mem.map((m) => ({
    source: CONTEXT_SOURCES.PROJECT_FILES,
    type: ITEM_TYPES.MEMORY,
    sourceId: m.id,
    content: m.content,
    similarity: query ? keywordScore(m.content, query) : 0.4,
    importance: m.importance,
    pinned: m.pinned,
    confidence: m.confidence,
    frequency: m.frequency,
    projectId: m.projectId,
    timestamp: m.lastAccessed,
    reason: "Workspace-scoped memory",
    tokenCount: estimateTokens(m.content),
    metadata: m.metadata,
  }));
}

async function retrieveRepository(userId, query, opts = {}) {
  if (!opts.projectId) return { items: [], graph: {} };
  const { items, graph } = await analyzeProject(opts.projectId, query, {
    fileLimit: opts.fileLimit || 80,
  });
  const gitItems = await analyzeGitHistory(opts.projectId, query);

  // Enrich with Phase 6 repository intelligence when indexed
  let intelItems = [];
  try {
    const { buildCoordinatorContext } = require("../../intelligence");
    const intel = await buildCoordinatorContext(opts.projectId, userId, query);
    intelItems = intel.items || [];
    if (intel.intelligence?.summary && !graph.intelligence) {
      graph.intelligence = {
        healthScore: intel.intelligence.healthScore,
        summary: intel.intelligence.summary,
        techInventory: intel.intelligence.techInventory,
      };
    }
  } catch {
    /* optional until first index */
  }

  return { items: [...intelItems, ...items, ...gitItems], graph };
}

async function retrieveExecutions(userId, query, opts = {}) {
  const items = [];
  const where = {
    userId,
    ...(opts.projectId ? { projectId: opts.projectId } : {}),
    ...(opts.conversationId ? { conversationId: opts.conversationId } : {}),
  };

  const executions = await prisma.agentExecution.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.executionLimit || 5,
    include: {
      steps: { orderBy: { createdAt: "desc" }, take: 8 },
      toolCalls: { orderBy: { createdAt: "desc" }, take: 12 },
    },
  });

  for (const ex of executions) {
    const success = ex.status === "COMPLETED" ? 1 : ex.status === "FAILED" ? 0.2 : 0.5;
    const planText = ex.plan
      ? `Plan: ${typeof ex.plan === "string" ? ex.plan : JSON.stringify(ex.plan).slice(0, 800)}`
      : "";
    const summary = [
      `Execution ${ex.id.slice(0, 8)} status=${ex.status}`,
      ex.intent ? `intent: ${ex.intent}` : null,
      planText,
      ex.error ? `failure: ${ex.error}` : null,
      ex.finalOutput ? `output: ${String(ex.finalOutput).slice(0, 500)}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    items.push({
      source: CONTEXT_SOURCES.EXECUTION_HISTORY,
      type: ITEM_TYPES.EXECUTION,
      sourceId: ex.id,
      content: summary,
      similarity: query ? keywordScore(summary, query) : 0.45,
      importance: 0.7,
      executionSuccess: success,
      projectId: ex.projectId,
      timestamp: ex.createdAt,
      reason: success >= 1 ? "Previous successful execution" : "Previous execution (learn from outcome)",
      tokenCount: estimateTokens(summary),
      metadata: { status: ex.status, intent: ex.intent },
    });

    // Failed steps — high value for tester/coder
    for (const step of ex.steps.filter((s) => s.status === "failed" || s.error)) {
      const text = `Failed step ${step.agentType}: ${step.error || step.output || ""}`.slice(0, 800);
      items.push({
        source: CONTEXT_SOURCES.EXECUTION_HISTORY,
        type: ITEM_TYPES.EXECUTION,
        sourceId: step.id,
        content: text,
        similarity: query ? keywordScore(text, query) : 0.55,
        importance: 0.85,
        executionSuccess: 0.15,
        agentType: step.agentType,
        agentMatch: opts.agentType === step.agentType,
        timestamp: step.createdAt,
        reason: "Previous failure — avoid repeating",
        tokenCount: estimateTokens(text),
      });
    }

    for (const tc of ex.toolCalls.slice(0, 8)) {
      const out =
        typeof tc.result === "string"
          ? tc.result
          : JSON.stringify(tc.result ?? tc.error ?? {}).slice(0, 600);
      const text = `Tool ${tc.toolName} (${tc.status}): ${out}`;
      items.push({
        source: CONTEXT_SOURCES.TOOL_OUTPUTS,
        type: ITEM_TYPES.TOOL_CALL,
        sourceId: tc.id,
        content: text,
        similarity: query ? keywordScore(text, query) : 0.4,
        importance: tc.status === "completed" || tc.status === "done" ? 0.65 : 0.75,
        executionSuccess: tc.status === "failed" ? 0.2 : 0.8,
        agentType: tc.agentType,
        timestamp: tc.createdAt,
        reason: "Prior tool output",
        tokenCount: estimateTokens(text),
        metadata: { toolName: tc.toolName, status: tc.status },
      });
    }
  }

  // Also AiExecution (project builds/tests)
  if (opts.projectId) {
    try {
      const builds = await prisma.aiExecution.findMany({
        where: { projectId: opts.projectId },
        orderBy: { createdAt: "desc" },
        take: 3,
      });
      for (const b of builds) {
        const text = `Build/test ${b.status}: ${b.summary || b.currentStage || ""}`;
        items.push({
          source: CONTEXT_SOURCES.EXECUTION_HISTORY,
          type: ITEM_TYPES.EXECUTION,
          sourceId: b.id,
          content: text,
          similarity: query ? keywordScore(text, query) : 0.4,
          importance: 0.6,
          executionSuccess: b.status === "completed" || b.status === "success" ? 1 : 0.3,
          projectId: opts.projectId,
          timestamp: b.createdAt,
          reason: "Previous build/test result",
          tokenCount: estimateTokens(text),
        });
      }
    } catch {
      // optional
    }
  }

  return items;
}

async function retrieveProfile(userId, query) {
  const prefs = await prisma.memory.findMany({
    where: {
      ownerId: userId,
      deletedAt: null,
      scope: MEMORY_SCOPES.USER,
      OR: [{ pinned: true }, { importance: { gte: 0.6 } }],
    },
    orderBy: [{ pinned: "desc" }, { importance: "desc" }],
    take: 15,
  });

  return prefs.map((m) => ({
    source: CONTEXT_SOURCES.USER_PROFILE,
    type: ITEM_TYPES.PREFERENCE,
    sourceId: m.id,
    content: m.content,
    similarity: query ? keywordScore(m.content, query) : 0.5,
    importance: m.importance,
    pinned: m.pinned,
    confidence: m.confidence,
    frequency: m.frequency,
    timestamp: m.lastAccessed,
    reason: m.pinned ? "Pinned user preference" : "User preference / profile",
    tokenCount: estimateTokens(m.content),
    metadata: m.metadata,
  }));
}

async function retrieveSkills(userId, query, opts = {}) {
  const items = [];
  if (opts.skillPrompt) {
    items.push({
      source: CONTEXT_SOURCES.SKILLS,
      type: ITEM_TYPES.SKILL,
      sourceId: opts.skillId || "active-skill",
      content: opts.skillPrompt,
      similarity: 0.9,
      importance: 0.9,
      reason: "Active skill instructions",
      tokenCount: estimateTokens(opts.skillPrompt),
    });
  }

  try {
    const skills = await prisma.skill.findMany({
      where: { userId, enabled: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    for (const s of skills) {
      const body = [s.name, s.description, s.prompt || ""].filter(Boolean).join("\n");
      const sim = query ? keywordScore(body, query) : 0.3;
      if (sim < 0.15 && !opts.skillId) continue;
      items.push({
        source: CONTEXT_SOURCES.SKILLS,
        type: ITEM_TYPES.SKILL,
        sourceId: s.id,
        content: body.slice(0, 1500),
        similarity: Math.max(sim, opts.skillId === s.id ? 0.95 : 0),
        importance: 0.7,
        timestamp: s.createdAt,
        reason: "Matching skill",
        tokenCount: estimateTokens(body.slice(0, 1500)),
        metadata: { name: s.name },
      });
    }
  } catch {
    // skill schema may vary
  }

  return items;
}

async function retrieveWorkflows(userId, query, opts = {}) {
  const items = [];
  if (opts.workflowPrompt) {
    items.push({
      source: CONTEXT_SOURCES.WORKFLOWS,
      type: ITEM_TYPES.WORKFLOW,
      sourceId: opts.workflowId || "active-workflow",
      content: opts.workflowPrompt,
      similarity: 0.9,
      importance: 0.85,
      reason: "Active workflow",
      tokenCount: estimateTokens(opts.workflowPrompt),
    });
  }

  try {
    const workflows = await prisma.workflow.findMany({
      where: { userId, enabled: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    });
    for (const w of workflows) {
      const body = [w.name, w.description, w.prompt || ""].filter(Boolean).join("\n");
      const sim = query ? keywordScore(body, query) : 0.3;
      if (sim < 0.15 && opts.workflowId !== w.id) continue;
      items.push({
        source: CONTEXT_SOURCES.WORKFLOWS,
        type: ITEM_TYPES.WORKFLOW,
        sourceId: w.id,
        content: body.slice(0, 1200),
        similarity: Math.max(sim, opts.workflowId === w.id ? 0.95 : 0),
        importance: 0.7,
        timestamp: w.createdAt,
        reason: "Matching workflow",
        tokenCount: estimateTokens(body.slice(0, 1200)),
        metadata: { name: w.name },
      });
    }
  } catch {
    // optional
  }

  return items;
}

async function retrieveSettings(userId) {
  try {
    const settings = await prisma.setting.findUnique({ where: { userId } });
    if (!settings) return [];
    const content = [
      `maxContext=${settings.maxContext}`,
      `maxTokens=${settings.maxTokens}`,
      `autoMemorySave=${settings.autoMemorySave}`,
      settings.embeddingProvider ? `embeddingProvider=${settings.embeddingProvider}` : null,
      settings.embeddingModel ? `embeddingModel=${settings.embeddingModel}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return [
      {
        source: CONTEXT_SOURCES.SETTINGS,
        type: ITEM_TYPES.SETTING,
        sourceId: settings.id || `settings:${userId}`,
        content: `User settings: ${content}`,
        similarity: 0.3,
        importance: 0.4,
        reason: "User settings affecting context budget",
        tokenCount: estimateTokens(content),
        metadata: {
          maxContext: settings.maxContext,
          maxTokens: settings.maxTokens,
        },
      },
    ];
  } catch {
    return [];
  }
}

function retrievePriorAgents(priorOutputs = []) {
  return (priorOutputs || []).map((o, i) => ({
    source: CONTEXT_SOURCES.PRIOR_AGENTS,
    type: ITEM_TYPES.PLAN,
    sourceId: `prior:${o.agent || i}`,
    content: `[${o.agent}]\n${o.output}`,
    similarity: 0.85,
    importance: 0.9,
    agentType: o.agent,
    agentMatch: true,
    reason: `Prior agent output from ${o.agent}`,
    tokenCount: estimateTokens(o.output),
  }));
}

function retrieveWeb(webContext) {
  if (!webContext) return [];
  return [
    {
      source: CONTEXT_SOURCES.WEB,
      type: ITEM_TYPES.DOCUMENT,
      sourceId: "web-context",
      content: String(webContext),
      similarity: 0.8,
      importance: 0.75,
      reason: "Live web research context",
      tokenCount: estimateTokens(webContext),
    },
  ];
}

/**
 * Parallel multi-source retrieval.
 */
async function retrieveAll(userId, query, opts = {}) {
  const [
    conversation,
    memory,
    documents,
    workspace,
    repository,
    executions,
    profile,
    skills,
    workflows,
    settings,
  ] = await Promise.all([
    retrieveConversation(userId, query, opts),
    retrieveMemory(userId, query, opts),
    retrieveDocuments(userId, query, opts),
    retrieveWorkspace(userId, query, opts),
    retrieveRepository(userId, query, opts),
    retrieveExecutions(userId, query, opts),
    retrieveProfile(userId, query),
    retrieveSkills(userId, query, opts),
    retrieveWorkflows(userId, query, opts),
    retrieveSettings(userId),
  ]);

  const prior = retrievePriorAgents(opts.priorOutputs);
  const web = retrieveWeb(opts.webContext);

  const repoItems = repository.items || repository;
  const graph = repository.graph || {};

  return {
    items: [
      ...conversation,
      ...memory,
      ...documents,
      ...workspace,
      ...repoItems,
      ...executions,
      ...profile,
      ...skills,
      ...workflows,
      ...settings,
      ...prior,
      ...web,
    ],
    graph,
    counts: {
      conversation: conversation.length,
      memory: memory.length,
      documents: documents.length,
      workspace: workspace.length,
      repository: repoItems.length,
      executions: executions.length,
      profile: profile.length,
      skills: skills.length,
      workflows: workflows.length,
      settings: settings.length,
      prior: prior.length,
      web: web.length,
    },
  };
}

module.exports = {
  retrieveAll,
  retrieveConversation,
  retrieveMemory,
  retrieveDocuments,
  retrieveWorkspace,
  retrieveRepository,
  retrieveExecutions,
  retrieveProfile,
  retrieveSkills,
  retrieveWorkflows,
  retrieveSettings,
  retrievePriorAgents,
  retrieveWeb,
};
