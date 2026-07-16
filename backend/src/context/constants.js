/** Phase 4 — Context Engine constants */

const CONTEXT_SOURCES = Object.freeze({
  CONVERSATION: "conversation",
  CONVERSATION_SUMMARY: "conversation_summary",
  SEMANTIC_MEMORY: "semantic_memory",
  LONG_TERM_MEMORY: "long_term_memory",
  SHORT_TERM_MEMORY: "short_term_memory",
  DOCUMENTS: "documents",
  PROJECT_FILES: "project_files",
  REPOSITORY: "repository",
  GIT_HISTORY: "git_history",
  EXECUTION_HISTORY: "execution_history",
  TOOL_OUTPUTS: "tool_outputs",
  USER_PROFILE: "user_profile",
  WORKFLOWS: "workflows",
  SKILLS: "skills",
  SETTINGS: "settings",
  PRIOR_AGENTS: "prior_agents",
  WEB: "web",
  PINNED: "pinned",
});

const ITEM_TYPES = Object.freeze({
  MESSAGE: "message",
  MEMORY: "memory",
  CHUNK: "chunk",
  DOCUMENT: "document",
  FILE: "file",
  SYMBOL: "symbol",
  ROUTE: "route",
  SCHEMA: "schema",
  ENV: "env",
  README: "readme",
  DIFF: "diff",
  EXECUTION: "execution",
  TOOL_CALL: "tool_call",
  PLAN: "plan",
  PREFERENCE: "preference",
  SKILL: "skill",
  WORKFLOW: "workflow",
  SETTING: "setting",
  SUMMARY: "summary",
  GIT: "git",
  ARCHITECTURE: "architecture",
});

/** Per-agent source priority weights (higher = preferred). */
const AGENT_PROFILES = Object.freeze({
  planner: {
    sources: {
      conversation: 1.2,
      conversation_summary: 1.3,
      user_profile: 1.1,
      workflows: 1.2,
      skills: 1.0,
      long_term_memory: 1.0,
      execution_history: 0.9,
      documents: 0.7,
      repository: 0.6,
      project_files: 0.5,
    },
    focus: "high-level goals, constraints, and prior outcomes",
  },
  research: {
    sources: {
      documents: 1.4,
      semantic_memory: 1.2,
      conversation: 0.9,
      repository: 0.8,
      web: 1.3,
      project_files: 0.7,
      long_term_memory: 1.0,
    },
    focus: "documentation, references, and research material",
  },
  architect: {
    sources: {
      repository: 1.4,
      project_files: 1.3,
      architecture: 1.5,
      documents: 1.0,
      execution_history: 0.8,
      conversation: 0.8,
      git_history: 0.9,
    },
    focus: "project structure, dependencies, and architecture",
  },
  coder: {
    sources: {
      project_files: 1.5,
      repository: 1.4,
      prior_agents: 1.2,
      execution_history: 1.0,
      tool_outputs: 1.1,
      conversation: 0.8,
      documents: 0.7,
      git_history: 0.8,
    },
    focus: "relevant code, symbols, and implementation context",
  },
  tester: {
    sources: {
      project_files: 1.3,
      execution_history: 1.5,
      tool_outputs: 1.4,
      prior_agents: 1.2,
      repository: 1.0,
      conversation: 0.7,
    },
    focus: "tests, failures, and reproduction context",
  },
  reviewer: {
    sources: {
      git_history: 1.4,
      repository: 1.3,
      prior_agents: 1.3,
      architecture: 1.2,
      project_files: 1.1,
      documents: 0.9,
      conversation: 0.8,
    },
    focus: "diffs, architecture, and review criteria",
  },
  coordinator: {
    sources: {
      conversation: 1.1,
      conversation_summary: 1.2,
      semantic_memory: 1.0,
      documents: 1.0,
      project_files: 0.9,
      execution_history: 0.9,
      user_profile: 1.0,
    },
    focus: "balanced overview across all context sources",
  },
});

/** Default model context windows (tokens). */
const MODEL_LIMITS = Object.freeze({
  "meta-llama/llama-3.3-70b-instruct": 128000,
  "llama-3.3-70b-versatile": 128000,
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "claude-3-5-sonnet": 200000,
  "claude-sonnet-4": 200000,
  default: 128000,
});

/** Reserved budget fractions of the usable context window. */
const DEFAULT_BUDGET_SPLIT = Object.freeze({
  system: 0.08,
  planner: 0.05,
  tools: 0.12,
  retrieved: 0.4,
  conversation: 0.15,
  response: 0.2,
});

const RANKING_WEIGHTS = Object.freeze({
  similarity: 0.28,
  recency: 0.12,
  importance: 0.12,
  frequency: 0.06,
  confidence: 0.08,
  agentRelevance: 0.12,
  projectRelevance: 0.08,
  pinned: 0.06,
  collectionWeight: 0.04,
  executionSuccess: 0.04,
});

module.exports = {
  CONTEXT_SOURCES,
  ITEM_TYPES,
  AGENT_PROFILES,
  MODEL_LIMITS,
  DEFAULT_BUDGET_SPLIT,
  RANKING_WEIGHTS,
};
