const SESSION_STATUS = Object.freeze({
  PENDING: "pending",
  PLANNING: "planning",
  EXECUTING: "executing",
  IMPROVING: "improving",
  WAITING_APPROVAL: "waiting_approval",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const GOAL_STATUS = Object.freeze({
  ACTIVE: "active",
  PAUSED: "paused",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
});

const PLAN_STATUS = Object.freeze({
  DRAFT: "draft",
  READY: "ready",
  EXECUTING: "executing",
  REPLANNED: "replanned",
  COMPLETED: "completed",
  FAILED: "failed",
});

const TASK_STATUS = Object.freeze({
  PENDING: "pending",
  READY: "ready",
  RUNNING: "running",
  BLOCKED: "blocked",
  WAITING_APPROVAL: "waiting_approval",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
  CANCELLED: "cancelled",
});

const AUTONOMY_AGENTS = Object.freeze({
  PLANNER: "planner",
  RESEARCHER: "researcher",
  ARCHITECT: "architect",
  BACKEND: "backend_engineer",
  FRONTEND: "frontend_engineer",
  DATABASE: "database_engineer",
  DEVOPS: "devops_engineer",
  SECURITY: "security_engineer",
  QA: "qa_engineer",
  REVIEWER: "reviewer",
  DOCUMENTATION: "documentation_writer",
  RELEASE: "release_manager",
  PROJECT_MANAGER: "project_manager",
});

const PHASES = Object.freeze({
  RESEARCH: "research",
  ARCHITECTURE: "architecture",
  DATABASE: "database",
  BACKEND: "backend",
  FRONTEND: "frontend",
  TESTING: "testing",
  SECURITY_REVIEW: "security_review",
  DOCUMENTATION: "documentation",
  DEPLOYMENT: "deployment",
  VERIFICATION: "verification",
});

const ARTIFACT_KINDS = Object.freeze({
  PLAN: "plan",
  TASK: "task",
  DESIGN: "design_doc",
  CODE: "code",
  TEST_REPORT: "test_report",
  COVERAGE: "coverage",
  REVIEW: "review_report",
  BENCHMARK: "benchmark",
  BUILD_LOG: "build_log",
  RELEASE_NOTES: "release_notes",
  DECISION: "decision",
  CHECKPOINT: "checkpoint",
});

const APPROVAL_KINDS = Object.freeze({
  DELETE_FILES: "delete_files",
  DATABASE_MIGRATION: "database_migration",
  FORCE_PUSH: "force_push",
  PRODUCTION_DEPLOY: "production_deploy",
  DANGEROUS_TERMINAL: "dangerous_terminal",
  LARGE_REFACTOR: "large_refactor",
});

const QUALITY_THRESHOLDS = Object.freeze({
  REVIEW_SCORE: 0.7,
  MAX_CRITICAL_SECURITY: 0,
  MAX_ARCHITECTURE_VIOLATIONS: 0,
  MIN_TEST_PASS_RATE: 1.0,
});

const COMPLEXITY_MS = Object.freeze({
  low: 5 * 60_000,
  medium: 20 * 60_000,
  high: 60 * 60_000,
  very_high: 180 * 60_000,
});

const STREAM_EVENTS = Object.freeze({
  SESSION_STARTED: "autonomy_session_started",
  SESSION_PHASE: "autonomy_session_phase",
  GOAL_CREATED: "autonomy_goal_created",
  PLAN_CREATED: "autonomy_plan_created",
  PLAN_REPLANNED: "autonomy_plan_replanned",
  TASK_STARTED: "autonomy_task_started",
  TASK_COMPLETED: "autonomy_task_completed",
  TASK_FAILED: "autonomy_task_failed",
  AGENT_DELEGATED: "autonomy_agent_delegated",
  ARTIFACT_CREATED: "autonomy_artifact_created",
  DECISION_RECORDED: "autonomy_decision_recorded",
  APPROVAL_REQUIRED: "autonomy_approval_required",
  APPROVAL_RESOLVED: "autonomy_approval_resolved",
  BUILD_RESULT: "autonomy_build_result",
  TEST_RESULT: "autonomy_test_result",
  REVIEW_RESULT: "autonomy_review_result",
  CYCLE_STARTED: "autonomy_cycle_started",
  CYCLE_COMPLETED: "autonomy_cycle_completed",
  CHECKPOINT: "autonomy_checkpoint",
  PROGRESS: "autonomy_progress",
  SESSION_COMPLETED: "autonomy_session_completed",
  SESSION_FAILED: "autonomy_session_failed",
  SESSION_CANCELLED: "autonomy_session_cancelled",
  LOG: "autonomy_log",
});

const MAX_IMPROVEMENT_CYCLES = 8;
const CHECKPOINT_INTERVAL_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

module.exports = {
  SESSION_STATUS,
  GOAL_STATUS,
  PLAN_STATUS,
  TASK_STATUS,
  AUTONOMY_AGENTS,
  PHASES,
  ARTIFACT_KINDS,
  APPROVAL_KINDS,
  QUALITY_THRESHOLDS,
  COMPLEXITY_MS,
  STREAM_EVENTS,
  MAX_IMPROVEMENT_CYCLES,
  CHECKPOINT_INTERVAL_MS,
  HEARTBEAT_INTERVAL_MS,
};
