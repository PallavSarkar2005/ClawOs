const { NODE_TYPES } = require("../constants");

const BUILTIN_TEMPLATES = [
  {
    name: "Research → Code → Review",
    description: "Sequential multi-agent pipeline using Coordinator agents",
    category: "agents",
    tags: ["agents", "coding"],
    definition: {
      nodes: [
        { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 80, y: 200 }, config: {} },
        {
          id: "research",
          type: NODE_TYPES.RESEARCH_AGENT,
          label: "Research",
          position: { x: 280, y: 200 },
          config: { message: "{{inputs.message}}" },
        },
        {
          id: "coder",
          type: NODE_TYPES.CODER_AGENT,
          label: "Code",
          position: { x: 500, y: 200 },
          config: { message: "Implement based on: {{nodes.research.outputs.reply}}" },
        },
        {
          id: "review",
          type: NODE_TYPES.REVIEWER_AGENT,
          label: "Review",
          position: { x: 720, y: 200 },
          config: { message: "Review: {{nodes.coder.outputs.reply}}" },
        },
        { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 940, y: 200 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "start", target: "research" },
        { id: "e2", source: "research", target: "coder" },
        { id: "e3", source: "coder", target: "review" },
        { id: "e4", source: "review", target: "end" },
      ],
      groups: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    variables: { message: "" },
  },
  {
    name: "Knowledge RAG Answer",
    description: "Retrieve knowledge, build context, then LLM answer",
    category: "knowledge",
    tags: ["rag", "knowledge"],
    definition: {
      nodes: [
        { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 60, y: 180 }, config: {} },
        {
          id: "know",
          type: NODE_TYPES.KNOWLEDGE_RETRIEVAL,
          label: "Knowledge",
          position: { x: 260, y: 180 },
          config: { query: "{{inputs.query}}" },
        },
        {
          id: "ctx",
          type: NODE_TYPES.CONTEXT_RETRIEVAL,
          label: "Context",
          position: { x: 480, y: 180 },
          config: { query: "{{inputs.query}}" },
        },
        {
          id: "llm",
          type: NODE_TYPES.LLM,
          label: "Answer",
          position: { x: 700, y: 180 },
          config: {
            prompt: "Query: {{inputs.query}}\n\nKnowledge: {{nodes.know.outputs.results}}\n\nContext: {{nodes.ctx.outputs.text}}",
          },
        },
        { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 920, y: 180 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "start", target: "know" },
        { id: "e2", source: "know", target: "ctx" },
        { id: "e3", source: "ctx", target: "llm" },
        { id: "e4", source: "llm", target: "end" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    variables: { query: "" },
  },
  {
    name: "Conditional Notify",
    description: "Branch on condition then notify or skip",
    category: "ops",
    tags: ["condition", "notification"],
    definition: {
      nodes: [
        { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 60, y: 200 }, config: {} },
        {
          id: "cond",
          type: NODE_TYPES.CONDITION,
          label: "Check",
          position: { x: 280, y: 200 },
          config: { expression: "inputs.severity == true" },
        },
        {
          id: "notify",
          type: NODE_TYPES.NOTIFICATION,
          label: "Notify",
          position: { x: 520, y: 100 },
          config: { title: "Success", message: "{{inputs.message}}" },
        },
        {
          id: "skip",
          type: NODE_TYPES.NOTIFICATION,
          label: "Skipped",
          position: { x: 520, y: 300 },
          config: { title: "Skipped", message: "Condition false" },
        },
        { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 760, y: 200 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "start", target: "cond" },
        { id: "e2", source: "cond", target: "notify", sourceHandle: "true" },
        { id: "e3", source: "cond", target: "skip", sourceHandle: "false" },
        { id: "e4", source: "notify", target: "end" },
        { id: "e5", source: "skip", target: "end" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    variables: {},
  },
  {
    name: "Workspace Intelligence Brief",
    description: "Ask workspace intelligence then summarize with LLM",
    category: "intelligence",
    tags: ["repo", "intelligence"],
    definition: {
      nodes: [
        { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 60, y: 180 }, config: {} },
        {
          id: "intel",
          type: NODE_TYPES.WORKSPACE_INTELLIGENCE,
          label: "Ask Repo",
          position: { x: 280, y: 180 },
          config: { action: "ask", query: "{{inputs.query}}", projectId: "{{inputs.projectId}}" },
        },
        {
          id: "llm",
          type: NODE_TYPES.LLM,
          label: "Summarize",
          position: { x: 520, y: 180 },
          config: { prompt: "Summarize this repository insight:\n{{nodes.intel.outputs.result}}" },
        },
        { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 760, y: 180 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "start", target: "intel" },
        { id: "e2", source: "intel", target: "llm" },
        { id: "e3", source: "llm", target: "end" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    variables: {},
  },
  {
    name: "HTTP + Retry + Delay",
    description: "Call an HTTP endpoint with delay and retry policy node",
    category: "integrations",
    tags: ["http", "retry"],
    definition: {
      nodes: [
        { id: "start", type: NODE_TYPES.START, label: "Start", position: { x: 60, y: 180 }, config: {} },
        {
          id: "retry",
          type: NODE_TYPES.RETRY,
          label: "Retry Policy",
          position: { x: 240, y: 180 },
          config: { maxAttempts: 3, backoffMs: 800 },
        },
        {
          id: "http",
          type: NODE_TYPES.HTTP,
          label: "HTTP Request",
          position: { x: 440, y: 180 },
          config: { method: "GET", url: "{{inputs.url}}" },
          retryPolicy: { maxAttempts: 3, backoffMs: 800, exponential: true },
        },
        {
          id: "delay",
          type: NODE_TYPES.DELAY,
          label: "Delay",
          position: { x: 660, y: 180 },
          config: { ms: 500 },
        },
        { id: "end", type: NODE_TYPES.END, label: "End", position: { x: 860, y: 180 }, config: {} },
      ],
      edges: [
        { id: "e1", source: "start", target: "retry" },
        { id: "e2", source: "retry", target: "http" },
        { id: "e3", source: "http", target: "delay" },
        { id: "e4", source: "delay", target: "end" },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    },
    variables: { url: "https://httpbin.org/get" },
  },
];

function listBuiltinTemplates() {
  return BUILTIN_TEMPLATES.map((t, i) => ({
    id: `builtin-${i}`,
    ...t,
    isBuiltin: true,
  }));
}

module.exports = { BUILTIN_TEMPLATES, listBuiltinTemplates };
