const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluate,
  interpolate,
  resolveValue,
} = require("../expression/engine");
const { VariableStore } = require("../variables/store");
const {
  normalizeDefinition,
  detectCycles,
  topologicalWaves,
  getStartNodes,
} = require("../dag/graph");
const { validateDefinition } = require("../validation/validator");
const { canTransition, isTerminal } = require("../engine/state-machine");
const { EXECUTION_STATUS, NODE_TYPES } = require("../constants");
const { WorkerPool, ConcurrencyController } = require("../engine/concurrency");
const { runSandboxed } = require("../security/sandbox");
const { parseCron, nextCronRun, matchesCron } = require("../scheduler/cron");
const { autoLayout } = require("../memory/persist");
const { executeNode } = require("../nodes/handlers");

describe("expression engine", () => {
  test("boolean logic and math", () => {
    assert.equal(evaluate("1 + 2 * 3"), 7);
    assert.equal(evaluate("true && false"), false);
    assert.equal(evaluate("10 > 5 and 1 < 2"), true);
    assert.equal(evaluate('lower("Hi")'), "hi");
    assert.equal(evaluate("Math.max(1, 5, 3)"), 5);
  });

  test("variable interpolation and JSON get", () => {
    const vars = { inputs: { name: "Ada" }, count: 2 };
    assert.equal(interpolate("Hello {{inputs.name}} x{{count}}", vars), "Hello Ada x2");
    assert.equal(resolveValue("{{inputs.name}}", vars), "Ada");
    assert.deepEqual(resolveValue({ a: "{{count}}" }, vars), { a: 2 });
  });

  test("date and coalesce", () => {
    const iso = evaluate('Date.format(Date.now(), "iso")');
    assert.ok(typeof iso === "string" && iso.includes("T"));
    assert.equal(evaluate('coalesce(null, "", "x")'), "x");
  });
});

describe("variable store", () => {
  test("layers and node outputs", () => {
    const store = new VariableStore({ inputs: { q: "test" }, workflow: { a: 1 } });
    store.setNodeOutput("n1", { reply: "ok" });
    assert.equal(store.get("inputs.q"), "test");
    assert.equal(store.get("nodes.n1.reply"), "ok");
    assert.equal(store.resolve("{{nodes.n1.reply}}"), "ok");
    const snap = store.toPersistence();
    assert.equal(snap.nodes.n1.reply, "ok");
  });
});

describe("DAG", () => {
  const def = {
    nodes: [
      { id: "a", type: "start" },
      { id: "b", type: "llm" },
      { id: "c", type: "end" },
    ],
    edges: [
      { id: "e1", source: "a", target: "b" },
      { id: "e2", source: "b", target: "c" },
    ],
  };

  test("topo waves and starts", () => {
    const { waves, hasCycle } = topologicalWaves(def);
    assert.equal(hasCycle, false);
    assert.deepEqual(waves, [["a"], ["b"], ["c"]]);
    assert.deepEqual(getStartNodes(def), ["a"]);
  });

  test("detects illegal cycles", () => {
    const cyclic = {
      nodes: [
        { id: "a", type: "llm" },
        { id: "b", type: "llm" },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    };
    assert.ok(detectCycles(cyclic).length > 0);
    const v = validateDefinition(cyclic);
    assert.equal(v.ok, false);
  });

  test("auto layout assigns positions", () => {
    const laid = autoLayout(def);
    assert.ok(laid.nodes.every((n) => typeof n.position.x === "number"));
  });
});

describe("validation", () => {
  test("requires nodes", () => {
    const v = validateDefinition({ nodes: [], edges: [] });
    assert.equal(v.ok, false);
  });

  test("accepts valid workflow", () => {
    const v = validateDefinition({
      nodes: [
        { id: "s", type: NODE_TYPES.START, position: { x: 0, y: 0 } },
        { id: "e", type: NODE_TYPES.END, position: { x: 1, y: 0 } },
      ],
      edges: [{ id: "e1", source: "s", target: "e" }],
    });
    assert.equal(v.ok, true);
  });
});

describe("state machine", () => {
  test("transitions", () => {
    assert.ok(canTransition(EXECUTION_STATUS.QUEUED, EXECUTION_STATUS.RUNNING));
    assert.ok(!canTransition(EXECUTION_STATUS.COMPLETED, EXECUTION_STATUS.RUNNING));
    assert.ok(isTerminal(EXECUTION_STATUS.FAILED));
  });
});

describe("concurrency + worker pool", () => {
  test("worker pool runs parallel tasks", async () => {
    const pool = new WorkerPool(3);
    const order = [];
    await pool.runAll([
      async () => { await new Promise((r) => setTimeout(r, 20)); order.push(1); return 1; },
      async () => { order.push(2); return 2; },
      async () => { order.push(3); return 3; },
    ]);
    assert.ok(order.includes(1) && order.includes(2) && order.includes(3));
  });

  test("rate limit gate", () => {
    const c = new ConcurrencyController({ maxGlobal: 1, maxPerUser: 1, rateLimitPerMinute: 2 });
    assert.ok(c.acquire("e1", "u1").ok);
    assert.equal(c.acquire("e2", "u1").ok, false);
    c.release("e1");
    assert.ok(c.acquire("e3", "u1").ok);
  });
});

describe("sandbox", () => {
  test("runs custom script", () => {
    const r = runSandboxed(`
      function run(inputs) { return { sum: inputs.a + inputs.b }; }
    `, { inputs: { a: 2, b: 3 } });
    assert.equal(r.result.sum, 5);
  });

  test("blocks require", () => {
    assert.throws(() => runSandboxed("require('fs')"), /Disallowed/);
  });
});

describe("scheduler cron", () => {
  test("parses and matches", () => {
    const cron = parseCron("*/5 * * * *");
    assert.ok(cron.minute.has(0) && cron.minute.has(5));
    const next = nextCronRun("0 * * * *", new Date("2026-01-01T10:30:00Z"), "UTC");
    assert.equal(next.getUTCMinutes(), 0);
    assert.ok(matchesCron("30 10 * * *", new Date("2026-01-01T10:30:00Z"), "UTC"));
  });
});

describe("node handlers", () => {
  function ctx(extra = {}) {
    const vars = new VariableStore({ inputs: { message: "hi", severity: true } });
    return {
      executionId: "exec-1",
      userId: "user-1",
      variables: vars,
      vars,
      signal: undefined,
      emit: () => {},
      ...extra,
    };
  }

  test("start / end / condition / delay", async () => {
    const start = await executeNode({ id: "s", type: "start", config: {} }, ctx());
    assert.equal(start.outputs.started, true);

    const cond = await executeNode(
      { id: "c", type: "condition", config: { expression: "inputs.severity == true" } },
      ctx(),
    );
    assert.equal(cond.branch, "true");

    const delay = await executeNode({ id: "d", type: "delay", config: { ms: 10 } }, ctx());
    assert.equal(delay.outputs.delayedMs, 10);

    const end = await executeNode({ id: "e", type: "end", config: {} }, ctx());
    assert.equal(end.terminal, true);
  });

  test("custom script node", async () => {
    const r = await executeNode(
      {
        id: "code",
        type: "custom_script",
        config: { code: "function run(inputs){ return { ok: true, n: 1 }; }" },
      },
      ctx(),
    );
    assert.equal(r.outputs.result.ok, true);
  });

  test("loop iterations", async () => {
    const node = {
      id: "loop",
      type: "loop",
      config: { items: ["a", "b"], maxIterations: 10 },
    };
    const c = ctx();
    const r1 = await executeNode(node, c);
    assert.equal(r1.branch, "body");
    assert.equal(r1.outputs.item, "a");
    const r2 = await executeNode(node, c);
    assert.equal(r2.outputs.item, "b");
    const r3 = await executeNode(node, c);
    assert.equal(r3.branch, "done");
  });

  test("approval waits then resolves", async () => {
    const pending = await executeNode(
      { id: "ap", type: "approval", config: { message: "Go?" } },
      ctx(),
    );
    assert.equal(pending.awaitingApproval, true);

    const decided = await executeNode(
      { id: "ap", type: "approval", config: {} },
      ctx({ approvalDecision: { approved: true, decidedBy: "u1" } }),
    );
    assert.equal(decided.branch, "approved");
  });
});

describe("large workflow benchmark", () => {
  test("topo waves for 200-node chain", () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 200; i += 1) {
      nodes.push({ id: `n${i}`, type: i === 0 ? "start" : i === 199 ? "end" : "delay" });
      if (i > 0) edges.push({ id: `e${i}`, source: `n${i - 1}`, target: `n${i}` });
    }
    const t0 = Date.now();
    const { waves, hasCycle } = topologicalWaves({ nodes, edges });
    const ms = Date.now() - t0;
    assert.equal(hasCycle, false);
    assert.equal(waves.length, 200);
    assert.ok(ms < 500, `topo took ${ms}ms`);
  });

  test("parallel wave of 50 independent nodes", () => {
    const nodes = [{ id: "s", type: "start" }, { id: "e", type: "end" }];
    const edges = [];
    for (let i = 0; i < 50; i += 1) {
      nodes.push({ id: `p${i}`, type: "notification" });
      edges.push({ id: `es${i}`, source: "s", target: `p${i}` });
      edges.push({ id: `ee${i}`, source: `p${i}`, target: "e" });
    }
    const { waves } = topologicalWaves({ nodes, edges });
    assert.equal(waves[0][0], "s");
    assert.equal(waves[1].length, 50);
    assert.deepEqual(waves[2], ["e"]);
  });
});

describe("normalize definition", () => {
  test("accepts from/to aliases", () => {
    const def = normalizeDefinition({
      nodes: [{ key: "a", type: "start" }],
      edges: [{ from: "a", to: "a" }],
    });
    assert.equal(def.nodes[0].id, "a");
    assert.equal(def.edges[0].source, "a");
  });
});
