const EXECUTION_STATES = Object.freeze({
  QUEUED: "QUEUED",
  PLANNING: "PLANNING",
  RESEARCHING: "RESEARCHING",
  ARCHITECTING: "ARCHITECTING",
  CODING: "CODING",
  TESTING: "TESTING",
  REVIEWING: "REVIEWING",
  FIXING: "FIXING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
});

const TERMINAL_STATES = new Set([
  EXECUTION_STATES.COMPLETED,
  EXECUTION_STATES.FAILED,
  EXECUTION_STATES.CANCELLED,
]);

const AGENT_TYPES = Object.freeze({
  COORDINATOR: "coordinator",
  PLANNER: "planner",
  RESEARCH: "research",
  ARCHITECT: "architect",
  CODER: "coder",
  TESTER: "tester",
  REVIEWER: "reviewer",
});

const AGENT_TO_STATE = Object.freeze({
  [AGENT_TYPES.PLANNER]: EXECUTION_STATES.PLANNING,
  [AGENT_TYPES.RESEARCH]: EXECUTION_STATES.RESEARCHING,
  [AGENT_TYPES.ARCHITECT]: EXECUTION_STATES.ARCHITECTING,
  [AGENT_TYPES.CODER]: EXECUTION_STATES.CODING,
  [AGENT_TYPES.TESTER]: EXECUTION_STATES.TESTING,
  [AGENT_TYPES.REVIEWER]: EXECUTION_STATES.REVIEWING,
});

const STEP_STATUS = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
});

const STREAM_EVENTS = Object.freeze({
  EXECUTION_STARTED: "execution_started",
  STATE_CHANGED: "state_changed",
  PLAN_CREATED: "plan_created",
  AGENT_STARTED: "agent_started",
  AGENT_TOKEN: "agent_token",
  AGENT_REASONING: "agent_reasoning",
  AGENT_COMPLETED: "agent_completed",
  AGENT_FAILED: "agent_failed",
  TOOL_STARTED: "tool_started",
  TOOL_COMPLETED: "tool_completed",
  TOOL_FAILED: "tool_failed",
  MEMORY_READ: "memory_read",
  MEMORY_WRITE: "memory_write",
  CONTEXT_BUILT: "context_built",
  METRICS: "metrics",
  LOG: "log",
  FINAL_RESPONSE: "final_response",
  EXECUTION_COMPLETED: "execution_completed",
  EXECUTION_FAILED: "execution_failed",
  EXECUTION_CANCELLED: "execution_cancelled",
  ERROR: "error",
});

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_STEP_TIMEOUT_MS = 120_000;
const DEFAULT_TOKEN_BUDGET = 6000;

const COST_PER_1K = Object.freeze({
  prompt: 0.00015,
  completion: 0.0006,
});

module.exports = {
  EXECUTION_STATES,
  TERMINAL_STATES,
  AGENT_TYPES,
  AGENT_TO_STATE,
  STEP_STATUS,
  STREAM_EVENTS,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_STEP_TIMEOUT_MS,
  DEFAULT_TOKEN_BUDGET,
  COST_PER_1K,
};
