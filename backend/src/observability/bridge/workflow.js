const { engine, TRACE_KIND, SPAN_KIND, TIMELINE_EVENTS, TRACE_STATUS } = require("../engine");
const { STREAM_EVENTS } = require("../../workflows/constants");

/**
 * Bridge Workflow Engine emit/subscribe into Observability.
 */
function wrapEmit(originalEmit) {
  return function obsEmit(executionId, event, data = {}) {
    const payload = originalEmit(executionId, event, data);
    try {
      handleWorkflowEvent(payload);
    } catch (err) {
      if (process.env.OBS_DEBUG) console.warn("[obs] workflow bridge:", err.message);
    }
    return payload;
  };
}

function beginWorkflowExecution(execution, meta = {}) {
  const handle = engine.startExecutionTrace({
    kind: TRACE_KIND.WORKFLOW,
    name: `workflow.${execution.workflowId || "run"}`,
    userId: execution.userId || meta.userId,
    projectId: meta.projectId,
    workflowId: execution.workflowId,
    workflowExecutionId: execution.id,
    attributes: {
      inputs: meta.inputs ? Object.keys(meta.inputs) : [],
    },
  });

  engine.recordWorkflow(handle.traceId, {
    workflowId: execution.workflowId,
    workflowExecutionId: execution.id,
    dag: meta.dag || {},
    currentNodeKeys: [],
    completedNodes: [],
    failedNodes: [],
    queuedNodes: meta.queuedNodes || [],
    executionTimeline: [],
    status: "running",
    userId: handle.userId,
  });

  return handle;
}

function handleWorkflowEvent(payload) {
  const executionId = payload.executionId;
  if (!executionId) return;
  let handle = engine.resolveTraceForWorkflow(executionId);
  if (!handle && payload.event === STREAM_EVENTS.EXECUTION_STARTED) {
    handle = engine.startExecutionTrace({
      kind: TRACE_KIND.WORKFLOW,
      name: "workflow.run",
      workflowExecutionId: executionId,
    });
  }
  if (!handle) return;
  const { traceId } = handle;
  const event = payload.event;

  handle._wf = handle._wf || {
    completed: [],
    failed: [],
    queued: [],
    current: [],
    timeline: [],
    checkpoints: [],
    approvals: [],
    retries: 0,
    nodeSpans: new Map(),
  };
  const st = handle._wf;

  const pushTl = (entry) => {
    st.timeline.push({ at: payload.at || new Date().toISOString(), ...entry });
  };

  switch (event) {
    case STREAM_EVENTS.EXECUTION_STARTED:
      engine.timeline(traceId, TIMELINE_EVENTS.WORKFLOW, { label: "started" });
      break;

    case STREAM_EVENTS.EXECUTION_QUEUED:
      st.queued = payload.nodeKeys || st.queued;
      break;

    case STREAM_EVENTS.NODE_STARTED: {
      const key = payload.nodeKey || payload.key || payload.nodeId;
      if (key) {
        st.current = [key];
        st.queued = st.queued.filter((k) => k !== key);
        const span = engine.startSpan(traceId, {
          name: `node.${key}`,
          kind: SPAN_KIND.WORKFLOW_NODE,
          attributes: { nodeType: payload.nodeType || payload.type, nodeKey: key },
        });
        if (span) st.nodeSpans.set(key, span.spanId);
        pushTl({ event: "NODE_STARTED", nodeKey: key, nodeType: payload.nodeType || payload.type });
      }
      break;
    }

    case STREAM_EVENTS.NODE_COMPLETED: {
      const key = payload.nodeKey || payload.key || payload.nodeId;
      if (key) {
        st.completed.push(key);
        st.current = st.current.filter((k) => k !== key);
        const spanId = st.nodeSpans.get(key);
        if (spanId) engine.endSpan(traceId, spanId, { status: TRACE_STATUS.OK });
        pushTl({
          event: "NODE_COMPLETED",
          nodeKey: key,
          durationMs: payload.durationMs,
        });
      }
      break;
    }

    case STREAM_EVENTS.NODE_FAILED: {
      const key = payload.nodeKey || payload.key || payload.nodeId;
      if (key) {
        st.failed.push(key);
        st.current = st.current.filter((k) => k !== key);
        st.retries += 1;
        engine.tracer.incrementRetries(traceId);
        const spanId = st.nodeSpans.get(key);
        if (spanId) {
          engine.endSpan(traceId, spanId, {
            status: TRACE_STATUS.ERROR,
            error: payload.error,
          });
        }
        pushTl({ event: "NODE_FAILED", nodeKey: key, error: payload.error });
      }
      break;
    }

    case STREAM_EVENTS.NODE_SKIPPED:
    case STREAM_EVENTS.NODE_WAITING:
      pushTl({ event, nodeKey: payload.nodeKey });
      break;

    case STREAM_EVENTS.CHECKPOINT:
      st.checkpoints.push({
        at: payload.at,
        nodeKey: payload.nodeKey,
      });
      engine.timeline(traceId, TIMELINE_EVENTS.CHECKPOINT, {
        label: "checkpoint",
        nodeKey: payload.nodeKey,
      });
      break;

    case STREAM_EVENTS.APPROVAL_REQUIRED:
      st.approvals.push({ at: payload.at, nodeKey: payload.nodeKey, data: payload });
      engine.timeline(traceId, TIMELINE_EVENTS.APPROVAL, {
        label: "approval_required",
        nodeKey: payload.nodeKey,
      });
      break;

    case STREAM_EVENTS.EXECUTION_COMPLETED:
    case STREAM_EVENTS.EXECUTION_FAILED:
    case STREAM_EVENTS.EXECUTION_CANCELLED: {
      const status =
        event === STREAM_EVENTS.EXECUTION_COMPLETED
          ? TRACE_STATUS.OK
          : event === STREAM_EVENTS.EXECUTION_CANCELLED
            ? TRACE_STATUS.CANCELLED
            : TRACE_STATUS.ERROR;
      engine.recordWorkflow(traceId, {
        workflowId: payload.workflowId || handle.workflowId,
        workflowExecutionId: executionId,
        currentNodeKeys: st.current,
        completedNodes: st.completed,
        failedNodes: st.failed,
        queuedNodes: st.queued,
        executionTimeline: st.timeline,
        checkpoints: st.checkpoints,
        approvals: st.approvals,
        retries: st.retries,
        status: status === TRACE_STATUS.OK ? "ok" : status,
        durationMs: payload.durationMs || handle.durationMs,
        error: payload.error,
        userId: handle.userId,
      });
      engine.endExecutionTrace(traceId, {
        status,
        error: payload.error,
        extras: { workflow: { executionId } },
      });
      break;
    }

    default:
      break;
  }

  if (
    [
      STREAM_EVENTS.NODE_STARTED,
      STREAM_EVENTS.NODE_COMPLETED,
      STREAM_EVENTS.NODE_FAILED,
      STREAM_EVENTS.CHECKPOINT,
    ].includes(event)
  ) {
    engine.recordWorkflow(traceId, {
      workflowId: handle.workflowId,
      workflowExecutionId: executionId,
      currentNodeKeys: st.current,
      completedNodes: st.completed,
      failedNodes: st.failed,
      queuedNodes: st.queued,
      executionTimeline: st.timeline,
      checkpoints: st.checkpoints,
      approvals: st.approvals,
      retries: st.retries,
      status: "running",
      userId: handle.userId,
    });
  }
}

module.exports = { wrapEmit, beginWorkflowExecution, handleWorkflowEvent };
