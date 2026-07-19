/**
 * Observability bridge for autonomous sessions.
 */

const { engine, TRACE_KIND, TIMELINE_EVENTS, TRACE_STATUS } = require("../../observability/engine");
const { STREAM_EVENTS } = require("../constants");

const sessionTraces = new Map();

function beginSessionTrace(input, sessionId) {
  const handle = engine.startExecutionTrace({
    kind: TRACE_KIND.EXECUTION,
    name: "autonomy.session",
    userId: input.userId,
    projectId: input.projectId,
    conversationId: input.conversationId,
    attributes: {
      autonomySessionId: sessionId,
      goalId: input.goalId,
      intent: String(input.description || input.title || "").slice(0, 200),
    },
  });
  sessionTraces.set(sessionId, handle);
  engine.timeline(handle.traceId, TIMELINE_EVENTS.COORDINATOR, {
    label: "autonomy_session_started",
    sessionId,
  });
  return handle;
}

function handleAutonomyEvent(payload) {
  const sessionId = payload.sessionId;
  if (!sessionId) return;
  const handle = sessionTraces.get(sessionId);
  if (!handle) return;
  const { traceId } = handle;

  switch (payload.event) {
    case STREAM_EVENTS.PLAN_CREATED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: "plan_created",
        tasks: payload.tasks?.length,
        milestones: payload.milestones?.length,
      });
      break;
    case STREAM_EVENTS.TASK_STARTED:
      engine.timeline(traceId, TIMELINE_EVENTS.AGENT, {
        label: "task_started",
        agent: payload.agent,
        taskId: payload.taskId,
      });
      break;
    case STREAM_EVENTS.TASK_COMPLETED:
      engine.timeline(traceId, TIMELINE_EVENTS.AGENT, {
        label: "task_completed",
        agent: payload.agent,
        taskId: payload.taskId,
        durationMs: payload.durationMs,
      });
      break;
    case STREAM_EVENTS.TASK_FAILED:
      engine.timeline(traceId, TIMELINE_EVENTS.ERROR, {
        label: "task_failed",
        agent: payload.agent,
        error: payload.error,
      });
      break;
    case STREAM_EVENTS.DECISION_RECORDED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: "decision",
        kind: payload.kind,
        confidence: payload.confidence,
      });
      break;
    case STREAM_EVENTS.APPROVAL_REQUIRED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: "approval_required",
        kind: payload.kind,
        risk: payload.risk,
      });
      break;
    case STREAM_EVENTS.BUILD_RESULT:
      engine.timeline(traceId, TIMELINE_EVENTS.TOOL_CALL, {
        label: `build:${payload.status}`,
        buildId: payload.buildId,
      });
      break;
    case STREAM_EVENTS.TEST_RESULT:
      engine.timeline(traceId, TIMELINE_EVENTS.TOOL_CALL, {
        label: `test:${payload.status}`,
        passed: payload.passed,
        failed: payload.failed,
      });
      break;
    case STREAM_EVENTS.REVIEW_RESULT:
      engine.timeline(traceId, TIMELINE_EVENTS.AGENT, {
        label: `review:${payload.status}`,
        score: payload.score,
      });
      break;
    case STREAM_EVENTS.CYCLE_STARTED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: `cycle_start:${payload.cycleNumber}`,
      });
      break;
    case STREAM_EVENTS.CYCLE_COMPLETED:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: `cycle_done:${payload.cycleNumber}`,
        ok: payload.ok,
        score: payload.score,
      });
      break;
    case STREAM_EVENTS.CHECKPOINT:
      engine.timeline(traceId, TIMELINE_EVENTS.COORDINATOR, {
        label: "checkpoint",
        progress: payload.progress,
      });
      break;
    case STREAM_EVENTS.SESSION_COMPLETED:
      engine.endExecutionTrace(traceId, { status: TRACE_STATUS.OK });
      sessionTraces.delete(sessionId);
      break;
    case STREAM_EVENTS.SESSION_FAILED:
      engine.endExecutionTrace(traceId, { status: TRACE_STATUS.ERROR, error: payload.error });
      sessionTraces.delete(sessionId);
      break;
    case STREAM_EVENTS.SESSION_CANCELLED:
      engine.endExecutionTrace(traceId, { status: TRACE_STATUS.CANCELLED });
      sessionTraces.delete(sessionId);
      break;
    default:
      break;
  }
}

function attachAutonomyEmitter(emitter) {
  if (!emitter || emitter.__obsAutonomyAttached) return;
  emitter.__obsAutonomyAttached = true;
  emitter.on("event", (payload) => {
    try {
      handleAutonomyEvent(payload);
    } catch (err) {
      if (process.env.OBS_DEBUG) console.warn("[obs] autonomy bridge:", err.message);
    }
  });
}

module.exports = {
  beginSessionTrace,
  handleAutonomyEvent,
  attachAutonomyEmitter,
  sessionTraces,
};
