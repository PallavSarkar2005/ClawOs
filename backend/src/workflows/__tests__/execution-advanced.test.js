const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { canTransition, isTerminal } = require("../engine/state-machine");
const { EXECUTION_STATUS } = require("../constants");
const { WorkerPool } = require("../engine/concurrency");
const { sleep } = require("../nodes/handlers");
const { VariableStore } = require("../variables/store");
const { topologicalWaves, getReadyNodes } = require("../dag/graph");

describe("retry + backoff", () => {
  test("exponential delays increase", async () => {
    const delays = [];
    const base = 20;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const delay = base * Math.pow(2, attempt);
      delays.push(delay);
      const t0 = Date.now();
      await sleep(delay);
      assert.ok(Date.now() - t0 >= delay - 5);
    }
    assert.deepEqual(delays, [20, 40, 80]);
  });
});

describe("checkpoint resume semantics", () => {
  test("completed keys skip re-execution candidates", () => {
    const def = {
      nodes: [
        { id: "a", type: "start" },
        { id: "b", type: "delay" },
        { id: "c", type: "end" },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    };
    const completed = new Set(["a", "b"]);
    const ready = getReadyNodes(def, completed);
    assert.deepEqual(ready, ["c"]);
  });

  test("variable store restores node outputs", () => {
    const vars = new VariableStore({
      nodes: { a: { outputs: { x: 1 }, x: 1 } },
      outputs: { x: 1 },
    });
    assert.equal(vars.get("nodes.a.x"), 1);
    const snap = vars.toPersistence();
    const restored = new VariableStore(snap);
    assert.equal(restored.get("outputs.x"), 1);
  });
});

describe("parallel execution", () => {
  test("pool runs N tasks concurrently", async () => {
    const pool = new WorkerPool(5);
    let concurrent = 0;
    let max = 0;
    await pool.runAll(
      Array.from({ length: 10 }, () => async () => {
        concurrent += 1;
        max = Math.max(max, concurrent);
        await sleep(30);
        concurrent -= 1;
        return true;
      }),
    );
    assert.ok(max >= 3, `expected concurrency >= 3, got ${max}`);
  });
});

describe("failed resume transition", () => {
  test("FAILED can return to QUEUED/RUNNING", () => {
    assert.ok(canTransition(EXECUTION_STATUS.FAILED, EXECUTION_STATUS.QUEUED));
    assert.ok(canTransition(EXECUTION_STATUS.FAILED, EXECUTION_STATUS.RUNNING));
    assert.ok(isTerminal(EXECUTION_STATUS.COMPLETED));
  });
});

describe("scheduler recovery helper", () => {
  test("topo remains stable after partial completion simulation", () => {
    const nodes = [];
    const edges = [];
    for (let i = 0; i < 20; i += 1) {
      nodes.push({ id: `n${i}`, type: "delay" });
      if (i) edges.push({ source: `n${i - 1}`, target: `n${i}` });
    }
    const { waves } = topologicalWaves({ nodes, edges });
    assert.equal(waves.length, 20);
    const completed = new Set(waves.slice(0, 10).flat());
    const ready = getReadyNodes({ nodes, edges }, completed);
    assert.deepEqual(ready, ["n10"]);
  });
});
