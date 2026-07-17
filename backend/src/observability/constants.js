const TRACE_KIND = {
  EXECUTION: "execution",
  WORKFLOW: "workflow",
  TOOL: "tool",
  LLM: "llm",
  CONTEXT: "context",
  KNOWLEDGE: "knowledge",
  REPOSITORY: "repository",
  USER_ACTION: "user_action",
  MEMORY: "memory",
};

const SPAN_KIND = {
  INTERNAL: "internal",
  AGENT: "agent",
  TOOL: "tool",
  LLM: "llm",
  CONTEXT: "context",
  KNOWLEDGE: "knowledge",
  WORKFLOW: "workflow",
  WORKFLOW_NODE: "workflow_node",
  REPOSITORY: "repository",
  STREAM: "stream",
  MEMORY: "memory",
  PROMPT: "prompt",
};

const TRACE_STATUS = {
  RUNNING: "running",
  OK: "ok",
  ERROR: "error",
  CANCELLED: "cancelled",
  TIMEOUT: "timeout",
};

const ALERT_TYPE = {
  HIGH_LATENCY: "high_latency",
  FAILED_WORKFLOW: "failed_workflow",
  FAILED_TOOL: "failed_tool",
  REPEATED_RETRIES: "repeated_retries",
  LARGE_TOKEN_USAGE: "large_token_usage",
  REPOSITORY_FAILURE: "repository_failure",
  EMBEDDING_FAILURE: "embedding_failure",
  WORKER_FAILURE: "worker_failure",
};

const ALERT_SEVERITY = {
  INFO: "info",
  WARNING: "warning",
  ERROR: "error",
  CRITICAL: "critical",
};

const THRESHOLDS = {
  HIGH_LATENCY_MS: 30_000,
  LARGE_TOKENS: 50_000,
  RETRY_ALERT: 3,
  P95_ALERT_MS: 15_000,
  EMBEDDING_LATENCY_MS: 10_000,
  TOOL_LATENCY_MS: 20_000,
  WORKFLOW_LATENCY_MS: 120_000,
};

const RETENTION = {
  TRACE_DAYS: 30,
  METRIC_DAYS: 90,
  ALERT_DAYS: 60,
  SNAPSHOT_DAYS: 14,
  COMPRESS_AFTER_DAYS: 7,
};

const METRIC_NAMES = {
  SUCCESS_RATE: "success_rate",
  FAILURE_RATE: "failure_rate",
  RETRY_RATE: "retry_rate",
  AVG_LATENCY: "avg_latency_ms",
  P95_LATENCY: "p95_latency_ms",
  P99_LATENCY: "p99_latency_ms",
  WORKFLOW_DURATION: "workflow_duration_ms",
  TOOL_DURATION: "tool_duration_ms",
  AGENT_DURATION: "agent_duration_ms",
  REPO_INDEX_TIME: "repo_index_ms",
  EMBEDDING_LATENCY: "embedding_latency_ms",
  PROMPT_TOKENS: "prompt_tokens",
  COMPLETION_TOKENS: "completion_tokens",
  TOTAL_TOKENS: "total_tokens",
  ESTIMATED_COST: "estimated_cost",
  REQUESTS_PER_MINUTE: "requests_per_minute",
  STREAMING_LATENCY: "streaming_latency_ms",
  PROVIDER_LATENCY: "provider_latency_ms",
};

const TIMELINE_EVENTS = {
  USER_MESSAGE: "user_message",
  COORDINATOR: "coordinator",
  CONTEXT_RETRIEVAL: "context_retrieval",
  KNOWLEDGE_RETRIEVAL: "knowledge_retrieval",
  WORKSPACE_ANALYSIS: "workspace_analysis",
  TOOL_CALL: "tool_call",
  WORKFLOW: "workflow",
  LLM: "llm",
  STREAMING: "streaming",
  RESPONSE: "response",
  AGENT: "agent",
  MEMORY: "memory",
  ERROR: "error",
  RETRY: "retry",
  CHECKPOINT: "checkpoint",
  APPROVAL: "approval",
};

module.exports = {
  TRACE_KIND,
  SPAN_KIND,
  TRACE_STATUS,
  ALERT_TYPE,
  ALERT_SEVERITY,
  THRESHOLDS,
  RETENTION,
  METRIC_NAMES,
  TIMELINE_EVENTS,
};
