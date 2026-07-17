const { EventEmitter } = require("events");
const { newTraceId, newSpanId, durationMs, nowIso } = require("./ids");
const { TRACE_STATUS, SPAN_KIND, TIMELINE_EVENTS } = require("./constants");
const persist = require("./persist");
const { redactValue } = require("./redact");

/**
 * In-memory active trace/span registry with fire-and-forget DB persistence.
 * Supports streaming incremental updates via EventEmitter.
 */
class Tracer extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
    this.active = new Map(); // traceId → handle
    this.byAgentExecution = new Map();
    this.byWorkflowExecution = new Map();
  }

  get(traceId) {
    return this.active.get(traceId) || null;
  }

  getByAgentExecution(executionId) {
    const tid = this.byAgentExecution.get(executionId);
    return tid ? this.active.get(tid) || null : null;
  }

  getByWorkflowExecution(executionId) {
    const tid = this.byWorkflowExecution.get(executionId);
    return tid ? this.active.get(tid) || null : null;
  }

  startTrace(options = {}) {
    const traceId = options.traceId || newTraceId();
    const rootSpanId = newSpanId();
    const startTime = new Date();
    const handle = {
      traceId,
      rootSpanId,
      userId: options.userId || null,
      projectId: options.projectId || null,
      conversationId: options.conversationId || null,
      workflowId: options.workflowId || null,
      workflowExecutionId: options.workflowExecutionId || null,
      agentExecutionId: options.agentExecutionId || null,
      kind: options.kind || "execution",
      name: options.name || "execution",
      status: TRACE_STATUS.RUNNING,
      startMs: startTime.getTime(),
      spans: new Map(),
      timeline: [],
      retries: 0,
      attributes: redactValue(options.attributes || {}),
    };

    handle.spans.set(rootSpanId, {
      spanId: rootSpanId,
      parentSpanId: null,
      name: options.name || "root",
      kind: SPAN_KIND.INTERNAL,
      status: TRACE_STATUS.RUNNING,
      startMs: handle.startMs,
      attributes: {},
      events: [],
      retries: 0,
    });

    this.active.set(traceId, handle);
    if (handle.agentExecutionId) {
      this.byAgentExecution.set(handle.agentExecutionId, traceId);
    }
    if (handle.workflowExecutionId) {
      this.byWorkflowExecution.set(handle.workflowExecutionId, traceId);
    }

    persist.fire(() =>
      persist.createTrace({
        traceId,
        name: handle.name,
        kind: handle.kind,
        userId: handle.userId,
        projectId: handle.projectId,
        conversationId: handle.conversationId,
        workflowId: handle.workflowId,
        workflowExecutionId: handle.workflowExecutionId,
        agentExecutionId: handle.agentExecutionId,
        rootSpanId,
        startTime,
        attributes: handle.attributes,
      }),
    );
    persist.fire(() =>
      persist.createSpan({
        spanId: rootSpanId,
        traceId,
        name: handle.name,
        kind: SPAN_KIND.INTERNAL,
        startTime,
      }),
    );

    this.#emit(handle, "trace.started", { traceId, rootSpanId });
    return handle;
  }

  startSpan(traceId, options = {}) {
    const handle = this.active.get(traceId);
    if (!handle) return null;
    const spanId = options.spanId || newSpanId();
    const startMs = Date.now();
    const span = {
      spanId,
      parentSpanId: options.parentSpanId || handle.rootSpanId,
      name: options.name || "span",
      kind: options.kind || SPAN_KIND.INTERNAL,
      status: TRACE_STATUS.RUNNING,
      startMs,
      attributes: redactValue(options.attributes || {}),
      events: [],
      retries: options.retries || 0,
    };
    handle.spans.set(spanId, span);

    persist.fire(() =>
      persist.createSpan({
        spanId,
        traceId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        kind: span.kind,
        attributes: span.attributes,
        retries: span.retries,
      }),
    );

    this.#emit(handle, "span.started", { traceId, spanId, name: span.name, kind: span.kind });
    return span;
  }

  endSpan(traceId, spanId, options = {}) {
    const handle = this.active.get(traceId);
    if (!handle) return null;
    const span = handle.spans.get(spanId);
    if (!span) return null;

    const endMs = Date.now();
    span.status = options.status || (options.error ? TRACE_STATUS.ERROR : TRACE_STATUS.OK);
    span.error = options.error || null;
    span.durationMs = durationMs(span.startMs, endMs);
    if (options.attributes) {
      span.attributes = { ...span.attributes, ...redactValue(options.attributes) };
    }
    if (options.retries != null) span.retries = options.retries;

    persist.fire(() =>
      persist.updateSpan(traceId, spanId, {
        status: span.status,
        endTime: new Date(endMs),
        durationMs: span.durationMs,
        error: span.error,
        retries: span.retries,
        attributes: span.attributes,
        events: span.events,
      }),
    );

    this.#emit(handle, "span.ended", {
      traceId,
      spanId,
      status: span.status,
      durationMs: span.durationMs,
    });
    return span;
  }

  addSpanEvent(traceId, spanId, name, attributes = {}) {
    const handle = this.active.get(traceId);
    const span = handle?.spans.get(spanId);
    if (!span) return;
    const event = { name, at: nowIso(), attributes: redactValue(attributes) };
    span.events.push(event);
    this.#emit(handle, "span.event", { traceId, spanId, event });
  }

  addTimeline(traceId, type, data = {}) {
    const handle = this.active.get(traceId);
    if (!handle) return;
    const event = {
      type: type || TIMELINE_EVENTS.COORDINATOR,
      at: nowIso(),
      ...redactValue(data),
    };
    handle.timeline.push(event);
    persist.fire(() => persist.appendTimeline(traceId, event));
    this.#emit(handle, "timeline", { traceId, event });
  }

  setAttribute(traceId, key, value) {
    const handle = this.active.get(traceId);
    if (!handle) return;
    handle.attributes[key] = redactValue(value);
  }

  incrementRetries(traceId) {
    const handle = this.active.get(traceId);
    if (!handle) return 0;
    handle.retries += 1;
    return handle.retries;
  }

  endTrace(traceId, options = {}) {
    const handle = this.active.get(traceId);
    if (!handle) return null;

    const endMs = Date.now();
    handle.status = options.status || (options.error ? TRACE_STATUS.ERROR : TRACE_STATUS.OK);
    handle.error = options.error || null;
    handle.durationMs = durationMs(handle.startMs, endMs);

    // Close open spans
    for (const [spanId, span] of handle.spans) {
      if (span.status === TRACE_STATUS.RUNNING) {
        this.endSpan(traceId, spanId, {
          status: handle.status === TRACE_STATUS.OK ? TRACE_STATUS.OK : handle.status,
          error: handle.error,
        });
      }
    }

    persist.fire(() =>
      persist.updateTrace(traceId, {
        status: handle.status,
        endTime: new Date(endMs),
        durationMs: handle.durationMs,
        error: handle.error,
        retries: handle.retries,
        attributes: handle.attributes,
        timeline: handle.timeline,
      }),
    );

    this.#emit(handle, "trace.ended", {
      traceId,
      status: handle.status,
      durationMs: handle.durationMs,
    });

    // Keep briefly for late bindings, then drop
    setTimeout(() => {
      this.active.delete(traceId);
      if (handle.agentExecutionId) this.byAgentExecution.delete(handle.agentExecutionId);
      if (handle.workflowExecutionId) this.byWorkflowExecution.delete(handle.workflowExecutionId);
    }, 60_000).unref?.();

    return handle;
  }

  buildSpanTree(traceId) {
    const handle = this.active.get(traceId);
    if (!handle) return null;
    const nodes = [...handle.spans.values()].map((s) => ({
      spanId: s.spanId,
      parentSpanId: s.parentSpanId,
      name: s.name,
      kind: s.kind,
      status: s.status,
      durationMs: s.durationMs ?? durationMs(s.startMs),
      retries: s.retries,
      error: s.error || null,
      attributes: s.attributes,
      events: s.events,
    }));
    const byParent = new Map();
    for (const n of nodes) {
      const key = n.parentSpanId || "root";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(n);
    }
    function nest(parentId) {
      return (byParent.get(parentId) || []).map((n) => ({
        ...n,
        children: nest(n.spanId),
      }));
    }
    return nest(null).length ? nest(null) : nest("root");
  }

  #emit(handle, event, data) {
    const payload = { event, traceId: handle.traceId, ts: nowIso(), ...data };
    this.emit(handle.traceId, payload);
    this.emit("stream", payload);
  }
}

const tracer = new Tracer();

module.exports = { Tracer, tracer };
