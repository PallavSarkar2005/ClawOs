const { chat } = require("./llm.client");
const contextManager = require("./context-manager");
const { STREAM_EVENTS, AGENT_TYPES } = require("./constants");
const { memoryService } = require("../memory");

const PLANNER_SYSTEM = `You are the Planner Agent for OpenClaw's multi-agent runtime.

Analyze the user request and create a task graph for specialized agents.

Available agents:
- research: gather facts, docs, web intel
- architect: design structure / APIs / modules
- coder: implement code / files
- tester: verify with tests / commands
- reviewer: quality review + polish final answer

Rules:
1. Return ONLY valid JSON (no markdown fences).
2. Keep the graph minimal — only agents needed.
3. Respect dependencies (research before architect before coder before tester before reviewer).
4. Simple Q&A may use only reviewer.
5. Coding requests should include coder (+ research/architect when helpful) and usually tester + reviewer.
6. Each task needs: id, agent, description, dependencies, priority, complexity, requiredTools, expectedOutputs.

JSON schema:
{
  "intent": "short intent summary",
  "strategy": "brief strategy",
  "tasks": [
    {
      "id": "t1",
      "agent": "research|architect|coder|tester|reviewer",
      "description": "what this agent must do",
      "dependencies": [],
      "priority": 1,
      "complexity": "low|medium|high",
      "requiredTools": ["memory","search"],
      "expectedOutputs": ["findings"]
    }
  ]
}`;

function sanitizePlan(plan, userMessage) {
  const validAgents = new Set([
    AGENT_TYPES.RESEARCH,
    AGENT_TYPES.ARCHITECT,
    AGENT_TYPES.CODER,
    AGENT_TYPES.TESTER,
    AGENT_TYPES.REVIEWER,
  ]);

  let tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];
  tasks = tasks
    .filter((t) => t && validAgents.has(String(t.agent || "").toLowerCase()))
    .map((t, idx) => ({
      id: String(t.id || `t${idx + 1}`),
      agent: String(t.agent).toLowerCase(),
      description: String(t.description || userMessage).slice(0, 2000),
      dependencies: Array.isArray(t.dependencies) ? t.dependencies.map(String) : [],
      priority: Number.isFinite(t.priority) ? t.priority : idx + 1,
      complexity: ["low", "medium", "high"].includes(t.complexity) ? t.complexity : "medium",
      requiredTools: Array.isArray(t.requiredTools) ? t.requiredTools.map(String) : [],
      expectedOutputs: Array.isArray(t.expectedOutputs) ? t.expectedOutputs.map(String) : [],
    }));

  if (!tasks.length) {
    tasks = defaultPlanFor(userMessage);
  }

  // Drop unknown dependency ids
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    t.dependencies = t.dependencies.filter((d) => ids.has(d) && d !== t.id);
  }

  return {
    intent: plan?.intent || summarizeIntent(userMessage),
    strategy: plan?.strategy || "Execute planned agent graph",
    tasks,
  };
}

function summarizeIntent(message) {
  return String(message || "").slice(0, 160);
}

function defaultPlanFor(message) {
  const text = String(message || "").toLowerCase();
  const wantsCode =
    /\b(code|implement|build|create|write|fix|refactor|generate|app|api|function|class|component)\b/.test(
      text,
    );
  const wantsResearch =
    /\b(research|analyze|compare|explain|investigate|what is|how does|latest)\b/.test(text);

  if (wantsCode) {
    return [
      {
        id: "t1",
        agent: "research",
        description: "Collect requirements and relevant context for implementation",
        dependencies: [],
        priority: 1,
        complexity: "medium",
        requiredTools: ["memory", "documents", "workspace"],
        expectedOutputs: ["requirements"],
      },
      {
        id: "t2",
        agent: "architect",
        description: "Design the solution structure and interfaces",
        dependencies: ["t1"],
        priority: 2,
        complexity: "medium",
        requiredTools: ["memory", "workspace"],
        expectedOutputs: ["architecture"],
      },
      {
        id: "t3",
        agent: "coder",
        description: "Implement the solution according to the architecture",
        dependencies: ["t2"],
        priority: 3,
        complexity: "high",
        requiredTools: ["filesystem", "workspace", "memory"],
        expectedOutputs: ["code"],
      },
      {
        id: "t4",
        agent: "tester",
        description: "Validate the implementation and list remaining issues",
        dependencies: ["t3"],
        priority: 4,
        complexity: "medium",
        requiredTools: ["terminal", "filesystem", "memory"],
        expectedOutputs: ["test-report"],
      },
      {
        id: "t5",
        agent: "reviewer",
        description: "Review outputs and produce the final user-facing answer",
        dependencies: ["t4"],
        priority: 5,
        complexity: "low",
        requiredTools: ["memory"],
        expectedOutputs: ["final-answer"],
      },
    ];
  }

  if (wantsResearch) {
    return [
      {
        id: "t1",
        agent: "research",
        description: "Research the topic thoroughly",
        dependencies: [],
        priority: 1,
        complexity: "medium",
        requiredTools: ["memory", "documents", "search"],
        expectedOutputs: ["findings"],
      },
      {
        id: "t2",
        agent: "reviewer",
        description: "Synthesize research into a clear final answer",
        dependencies: ["t1"],
        priority: 2,
        complexity: "low",
        requiredTools: ["memory"],
        expectedOutputs: ["final-answer"],
      },
    ];
  }

  return [
    {
      id: "t1",
      agent: "reviewer",
      description: "Answer the user request directly and completely",
      dependencies: [],
      priority: 1,
      complexity: "low",
      requiredTools: ["memory", "documents"],
      expectedOutputs: ["final-answer"],
    },
  ];
}

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* continue */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* continue */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      return null;
    }
  }
  return null;
}

async function createPlan(ctx) {
  ctx.emit?.(STREAM_EVENTS.LOG, {
    level: "info",
    agent: "planner",
    message: "Planning task graph…",
  });

  const context = await contextManager.build(ctx.userId, ctx.userMessage, {
    conversationId: ctx.conversationId,
    projectId: ctx.projectId,
    documentId: ctx.documentId,
    skillPrompt: ctx.skillPrompt,
    workflowPrompt: ctx.workflowPrompt,
    webContext: ctx.webContext,
    agentType: "planner",
    agentExecutionId: ctx.executionId,
    tokenBudget: 3500,
  });

  ctx.emit?.(STREAM_EVENTS.CONTEXT_BUILT, {
    agent: "planner",
    tokens: context.usedTokens,
    sessionId: context.sessionId,
    allocation: context.allocation,
    compressionRatio: context.compressionRatio,
    sections: (context.sections || []).map((s) => ({
      label: s.label,
      tokens: s.tokens,
      score: s.score,
      reason: s.reason,
    })),
    observability: context.observability,
    reasoningPath: context.reasoningPath,
  });

  let plan;
  try {
    const response = await chat({
      messages: [
        { role: "system", content: PLANNER_SYSTEM },
        {
          role: "user",
          content: `USER REQUEST:\n${ctx.userMessage}\n\nCONTEXT:\n${context.text}\n\nCreate the task graph JSON now.`,
        },
      ],
      settings: ctx.settings || {},
      temperature: 0.2,
      maxTokens: 2048,
      signal: ctx.signal,
    });

    if (response.usage) {
      const persistence = require("./persistence");
      await persistence.accumulateUsage(ctx.executionId, response.usage);
    }

    plan = sanitizePlan(extractJson(response.content), ctx.userMessage);
  } catch (error) {
    ctx.emit?.(STREAM_EVENTS.LOG, {
      level: "warn",
      agent: "planner",
      message: `Planner LLM failed, using heuristic plan: ${error.message}`,
    });
    plan = sanitizePlan({ tasks: defaultPlanFor(ctx.userMessage) }, ctx.userMessage);
  }

  try {
    await memoryService.create(ctx.userId, {
      content: `Plan: ${plan.intent}\nTasks: ${plan.tasks.map((t) => `${t.id}:${t.agent}`).join(", ")}`,
      scope: "AGENT",
      conversationId: ctx.conversationId || null,
      projectId: ctx.projectId || null,
      agentType: "planner",
      source: "agent:planner",
      importance: 0.7,
      tags: ["agent", "planner", "plan"],
    });
    ctx.emit?.(STREAM_EVENTS.MEMORY_WRITE, { agent: "planner" });
  } catch {
    /* ignore */
  }

  ctx.emit?.(STREAM_EVENTS.PLAN_CREATED, {
    intent: plan.intent,
    strategy: plan.strategy,
    tasks: plan.tasks,
  });

  return plan;
}

module.exports = {
  createPlan,
  sanitizePlan,
  defaultPlanFor,
  extractJson,
};
