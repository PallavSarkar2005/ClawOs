const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  canTransition,
  stateForAgent,
  isTerminal,
} = require("../../runtime/state-machine");
const { EXECUTION_STATES, AGENT_TYPES } = require("../../runtime/constants");
const { estimateTokens, packSections, truncateToBudget } = require("../../runtime/token");
const { estimateCost } = require("../../runtime/cost");
const { isRetryable, withRetry, withTimeout } = require("../../runtime/retry.engine");
const { sanitizePlan, defaultPlanFor, extractJson } = require("../../runtime/planner");
const { getToolSchemas, listTools } = require("../../runtime/tools");

describe("state machine", () => {
  it("allows QUEUED → PLANNING", () => {
    assert.equal(canTransition(EXECUTION_STATES.QUEUED, EXECUTION_STATES.PLANNING), true);
  });

  it("rejects COMPLETED → CODING", () => {
    assert.equal(canTransition(EXECUTION_STATES.COMPLETED, EXECUTION_STATES.CODING), false);
  });

  it("maps agents to states", () => {
    assert.equal(stateForAgent(AGENT_TYPES.CODER), EXECUTION_STATES.CODING);
    assert.equal(stateForAgent(AGENT_TYPES.RESEARCH), EXECUTION_STATES.RESEARCHING);
  });

  it("detects terminal states", () => {
    assert.equal(isTerminal(EXECUTION_STATES.COMPLETED), true);
    assert.equal(isTerminal(EXECUTION_STATES.PLANNING), false);
  });
});

describe("token + cost", () => {
  it("estimates tokens", () => {
    assert.ok(estimateTokens("abcd") >= 1);
  });

  it("truncates to budget", () => {
    const r = truncateToBudget("x".repeat(1000), 10);
    assert.equal(r.tokens, 10);
    assert.ok(r.text.length <= 45);
  });

  it("packs sections under budget", () => {
    const packed = packSections(
      [
        { label: "A", text: "hello world", budget: 100 },
        { label: "B", text: "more text here", budget: 100 },
      ],
      20,
    );
    assert.ok(packed.usedTokens <= 20);
    assert.ok(packed.sections.length >= 1);
  });

  it("estimates cost", () => {
    const cost = estimateCost(1000, 1000);
    assert.ok(cost > 0);
  });
});

describe("retry engine", () => {
  it("retries retryable failures", async () => {
    let n = 0;
    const result = await withRetry(
      async () => {
        n += 1;
        if (n < 3) {
          const err = new Error("temporarily unavailable");
          err.status = 503;
          throw err;
        }
        return "ok";
      },
      { maxRetries: 3, baseDelayMs: 1 },
    );
    assert.equal(result, "ok");
    assert.equal(n, 3);
  });

  it("does not retry cancel", async () => {
    await assert.rejects(
      () =>
        withRetry(
          async () => {
            throw Object.assign(new Error("Cancelled"), { code: "CANCELLED" });
          },
          { maxRetries: 3, baseDelayMs: 1 },
        ),
      /Cancelled/,
    );
  });

  it("times out", async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => {}), 20, "test"),
      /timed out/,
    );
  });

  it("classifies retryable errors", () => {
    assert.equal(isRetryable({ status: 429 }), true);
    assert.equal(isRetryable({ code: "ABORT" }), false);
  });
});

describe("planner", () => {
  it("builds code plan heuristically", () => {
    const tasks = defaultPlanFor("Build a React app with login");
    assert.ok(tasks.some((t) => t.agent === "coder"));
    assert.ok(tasks.some((t) => t.agent === "reviewer"));
  });

  it("builds research plan", () => {
    const tasks = defaultPlanFor("Research and analyze vector databases");
    assert.ok(tasks.some((t) => t.agent === "research"));
  });

  it("sanitizes invalid agents", () => {
    const plan = sanitizePlan(
      {
        intent: "x",
        tasks: [
          { id: "t1", agent: "hacker", description: "nope" },
          { id: "t2", agent: "coder", description: "yes", dependencies: ["missing"] },
        ],
      },
      "write code",
    );
    assert.ok(plan.tasks.every((t) => ["research", "architect", "coder", "tester", "reviewer"].includes(t.agent)));
    assert.deepEqual(plan.tasks.find((t) => t.id === "t2")?.dependencies, []);
  });

  it("extracts JSON from fences", () => {
    const j = extractJson('```json\n{"tasks":[]}\n```');
    assert.deepEqual(j, { tasks: [] });
  });
});

describe("tools", () => {
  it("lists structured tools", () => {
    const names = listTools();
    assert.ok(names.includes("filesystem"));
    assert.ok(names.includes("terminal"));
    assert.ok(names.includes("memory"));
    assert.ok(names.includes("search"));
    assert.ok(names.includes("browser"));
  });

  it("filters schemas", () => {
    const schemas = getToolSchemas(["memory", "search"]);
    assert.equal(schemas.length, 2);
  });
});
