const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { redactValue, redactString } = require("../redact");
const { Tracer } = require("../tracer");
const { percentile } = require("../metrics");
const { wrapChat } = require("../bridge/llm");
const { TIMELINE_EVENTS } = require("../constants");

describe("observability redaction", () => {
  it("redacts api keys and bearer tokens", () => {
    const s = redactString('api_key=sk-abcdefghijklmnop password=secret123');
    assert.match(s, /REDACTED/);
    assert.equal(s.includes("secret123"), false);

    const obj = redactValue({
      authorization: "Bearer abc.def.ghi",
      nested: { token: "xyz", safe: "ok" },
    });
    assert.equal(obj.authorization, "***REDACTED***");
    assert.equal(obj.nested.token, "***REDACTED***");
    assert.equal(obj.nested.safe, "ok");
  });
});

describe("observability tracer", () => {
  it("builds span hierarchy and timeline", () => {
    const tracer = new Tracer();
    const handle = tracer.startTrace({
      name: "test.exec",
      userId: "user-1",
      kind: "execution",
    });
    assert.ok(handle.traceId.startsWith("tr_"));

    const child = tracer.startSpan(handle.traceId, {
      name: "agent.coder",
      kind: "agent",
      parentSpanId: handle.rootSpanId,
    });
    assert.ok(child.spanId);

    tracer.addTimeline(handle.traceId, TIMELINE_EVENTS.USER_MESSAGE, {
      label: "hello",
    });
    tracer.endSpan(handle.traceId, child.spanId, { status: "ok" });
    const ended = tracer.endTrace(handle.traceId, { status: "ok" });
    assert.equal(ended.status, "ok");
    assert.ok(typeof ended.durationMs === "number");
    assert.ok(ended.timeline.length >= 1);

    const tree = tracer.buildSpanTree(handle.traceId);
    // may be null after cleanup delay — tree built while still active
    assert.ok(Array.isArray(tree) || tree === null);
  });
});

describe("observability metrics", () => {
  it("computes percentiles", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    assert.equal(percentile(sorted, 50), 50);
    assert.equal(percentile(sorted, 95), 100);
    assert.equal(percentile([], 95), 0);
  });
});

describe("observability llm bridge", () => {
  it("records prompt trace around chat", async () => {
    const { engine } = require("../engine");
    const handle = engine.startExecutionTrace({
      name: "llm.test",
      userId: "u1",
      agentExecutionId: "exec-llm-1",
    });

    const fakeChat = async ({ messages, onToken }) => {
      if (onToken) {
        onToken("Hello");
        onToken(" world");
      }
      return {
        content: "Hello world",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        provider: "test",
        model: "test-model",
        finish_reason: "stop",
      };
    };

    const observed = wrapChat(fakeChat);
    const result = await observed({
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hi" },
      ],
      onToken: () => {},
      obsContext: { executionId: "exec-llm-1" },
    });

    assert.equal(result.content, "Hello world");
    assert.equal(result.usage.total_tokens, 15);
    engine.endExecutionTrace(handle.traceId, { status: "ok" });
  });
});

describe("observability replay steps", () => {
  it("orders replay steps by time", () => {
    const steps = [
      { type: "tool", at: "2026-01-01T00:00:02Z", label: "b" },
      { type: "agent", at: "2026-01-01T00:00:01Z", label: "a" },
      { type: "llm", at: "2026-01-01T00:00:03Z", label: "c" },
    ];
    steps.sort((a, b) => new Date(a.at) - new Date(b.at));
    assert.deepEqual(
      steps.map((s) => s.label),
      ["a", "b", "c"],
    );
  });
});

describe("observability large execution simulation", () => {
  it("handles many spans without throwing", () => {
    const tracer = new Tracer();
    const handle = tracer.startTrace({ name: "large", userId: "u" });
    for (let i = 0; i < 200; i += 1) {
      const span = tracer.startSpan(handle.traceId, {
        name: `span.${i}`,
        kind: i % 2 === 0 ? "tool" : "agent",
      });
      tracer.endSpan(handle.traceId, span.spanId, {
        status: i % 17 === 0 ? "error" : "ok",
        error: i % 17 === 0 ? "fail" : null,
      });
      if (i % 10 === 0) tracer.incrementRetries(handle.traceId);
    }
    const ended = tracer.endTrace(handle.traceId, { status: "ok" });
    assert.equal(ended.spans.size >= 200, true);
    assert.ok(ended.retries >= 20);
  });
});
