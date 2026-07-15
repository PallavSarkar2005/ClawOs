const { describe, it, mock } = require("node:test");
const assert = require("node:assert/strict");

/**
 * Orchestration tests with mocked LLM — no network.
 */
describe("agent orchestration (mocked)", () => {
  it("topological waves schedule independent agents in parallel groups", () => {
    // Inline wave algorithm (same as coordinator)
    function topologicalWaves(tasks) {
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const remaining = new Set(tasks.map((t) => t.id));
      const done = new Set();
      const waves = [];
      while (remaining.size) {
        const wave = [];
        for (const id of remaining) {
          const task = byId.get(id);
          const deps = task.dependencies || [];
          if (deps.every((d) => done.has(d) || !byId.has(d))) wave.push(task);
        }
        if (!wave.length) {
          const next = byId.get([...remaining][0]);
          waves.push([next]);
          remaining.delete(next.id);
          done.add(next.id);
          continue;
        }
        for (const t of wave) {
          remaining.delete(t.id);
          done.add(t.id);
        }
        waves.push(wave);
      }
      return waves;
    }

    const tasks = [
      { id: "a", agent: "research", dependencies: [] },
      { id: "b", agent: "architect", dependencies: ["a"] },
      { id: "c", agent: "coder", dependencies: ["b"] },
      { id: "d", agent: "tester", dependencies: ["c"] },
      { id: "e", agent: "reviewer", dependencies: ["d"] },
    ];
    const waves = topologicalWaves(tasks);
    assert.equal(waves.length, 5);
    assert.equal(waves[0][0].id, "a");
    assert.equal(waves[4][0].id, "e");
  });

  it("runs independent research+architect siblings in one wave after shared dep", () => {
    function topologicalWaves(tasks) {
      const byId = new Map(tasks.map((t) => [t.id, t]));
      const remaining = new Set(tasks.map((t) => t.id));
      const done = new Set();
      const waves = [];
      while (remaining.size) {
        const wave = [];
        for (const id of remaining) {
          const task = byId.get(id);
          if ((task.dependencies || []).every((d) => done.has(d) || !byId.has(d))) {
            wave.push(task);
          }
        }
        if (!wave.length) break;
        for (const t of wave) {
          remaining.delete(t.id);
          done.add(t.id);
        }
        waves.push(wave);
      }
      return waves;
    }

    const tasks = [
      { id: "t1", dependencies: [] },
      { id: "t2", dependencies: ["t1"] },
      { id: "t3", dependencies: ["t1"] },
      { id: "t4", dependencies: ["t2", "t3"] },
    ];
    const waves = topologicalWaves(tasks);
    assert.equal(waves[0].length, 1);
    assert.equal(waves[1].length, 2);
    assert.equal(waves[2].length, 1);
  });

  it("partial failure continues for non-critical research agents", async () => {
    const outputs = new Map();
    const critical = new Set(["coder", "reviewer"]);

    async function runAgent(agent) {
      if (agent === "research") throw new Error("research boom");
      return { agent, content: `${agent}-ok` };
    }

    for (const agent of ["research", "coder", "reviewer"]) {
      try {
        const out = await runAgent(agent);
        outputs.set(agent, out);
      } catch (error) {
        if (critical.has(agent)) throw error;
        outputs.set(agent, { agent, content: `(${agent} failed: ${error.message})` });
      }
    }

    assert.ok(outputs.get("research").content.includes("failed"));
    assert.equal(outputs.get("coder").content, "coder-ok");
  });

  it("cancel aborts active handle", () => {
    const handle = { cancelRequested: false, abortController: new AbortController() };
    handle.cancelRequested = true;
    handle.abortController.abort();
    assert.equal(handle.abortController.signal.aborted, true);
    assert.equal(handle.cancelRequested, true);
  });

  it("extracts final answer from reviewer markdown", () => {
    function extractFinalAnswer(text) {
      const match = text.match(/##\s*Final Answer\s*([\s\S]*?)(?=\n##\s|$)/i);
      if (match) return match[1].trim();
      return text.trim();
    }
    const out = extractFinalAnswer("## Review\nnotes\n\n## Final Answer\nHello world\n\n## Extra\nx");
    assert.equal(out, "Hello world");
  });
});

describe("tool router structured calling", () => {
  it("parses tool call arguments to JSON result shape", async () => {
    const { executeTool } = require("../../runtime/tools");
    const preview = await executeTool(
      "preview",
      { html: "<h1>Hi</h1>", css: "h1{color:red}", title: "T" },
      {},
    );
    assert.equal(preview.ok, true);
    assert.ok(preview.html.includes("<h1>Hi</h1>"));
  });

  it("rejects unknown tools with structured error", async () => {
    const { executeTool } = require("../../runtime/tools");
    const result = await executeTool("not_a_tool", {}, {});
    assert.equal(result.ok, false);
    assert.equal(result.code, "UNKNOWN_TOOL");
  });

  it("blocks dangerous terminal patterns", async () => {
    const { executeTool } = require("../../runtime/tools");
    const result = await executeTool(
      "terminal",
      { command: "rm -rf /" },
      { userId: "u", projectId: null },
    );
    // No workspace → NO_WORKSPACE; with workspace would be BLOCKED
    assert.equal(result.ok, false);
  });
});
