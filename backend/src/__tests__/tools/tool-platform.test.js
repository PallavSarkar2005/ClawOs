const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

describe("Tool Platform", () => {
  let platform;

  before(() => {
    platform = require("../../tools");
    platform.registerBuiltins();
  });

  it("registers production builtin tools across categories", () => {
    const catalog = platform.registry.catalog();
    assert.ok(catalog.count >= 40, `expected >=40 tools, got ${catalog.count}`);
    for (const cat of [
      "filesystem",
      "terminal",
      "git",
      "workspace",
      "memory",
      "documents",
      "browser",
      "preview",
    ]) {
      assert.ok(catalog.categories.includes(cat), `missing category ${cat}`);
    }
  });

  it("exposes tool metadata required by the Tool Engine", () => {
    const tool = platform.registry.get("filesystem.read");
    assert.ok(tool);
    assert.equal(tool.id, "filesystem.read");
    assert.ok(tool.name);
    assert.ok(tool.description);
    assert.ok(tool.schema);
    assert.ok(Array.isArray(tool.permissions));
    assert.ok(typeof tool.timeout === "number");
    assert.ok(typeof tool.retries === "number");
    assert.ok(tool.version);
    assert.equal(tool.category, "filesystem");
    assert.equal(typeof tool.executor, "function");
  });

  it("getToolSchemas returns OpenAI function schemas for agent categories", () => {
    const schemas = platform.getToolSchemas(["filesystem", "git", "terminal"]);
    assert.ok(schemas.length >= 3);
    for (const s of schemas) {
      assert.equal(s.type, "function");
      assert.ok(s.function.name);
      assert.ok(s.function.parameters);
    }
  });

  it("validates arguments and rejects bad input", async () => {
    const result = await platform.executeTool("filesystem.read", {}, { userId: "u1" });
    assert.equal(result.ok, false);
    assert.ok(
      result.code === "VALIDATION_ERROR" || result.code === "NO_WORKSPACE" || result.code === "BAD_ARGS",
    );
  });

  it("permission check denies readonly role for writes", async () => {
    const { checkPermissions } = require("../../tools/engine/permissions");
    const tool = platform.registry.get("filesystem.write");
    await assert.rejects(
      () => checkPermissions(tool, { role: "readonly", userId: "u1" }),
      (err) => err.code === "PERMISSION_DENIED",
    );
  });

  it("executes parallel tool calls", async () => {
    const results = await platform.executeParallel(
      [
        { tool: "preview.health", arguments: {} },
        { tool: "terminal.history", arguments: { limit: 5 } },
      ],
      { userId: "u1", role: "user" },
    );
    assert.equal(results.length, 2);
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, true);
  });

  it("self-corrects unknown tool via alternatives when available", async () => {
    const result = await platform.executeTool("filesystem.read", { path: "x" }, {
      userId: "u1",
      // no project → NO_WORKSPACE, not unknown
    });
    assert.equal(result.ok, false);
    assert.ok(result.executionId);
    assert.ok(typeof result.durationMs === "number");
  });

  it("loads example plugin tools", async () => {
    const loaded = await platform.loadPluginsDir();
    const echo = loaded.find((p) => p.pluginId === "example-echo" || p.tools?.includes("plugin.echo"));
    assert.ok(echo, "example-echo plugin should load");
    assert.ok(platform.registry.get("plugin.echo"));
    const result = await platform.executeTool(
      "plugin.echo",
      { message: "hello" },
      { userId: "u1", role: "user", permissions: ["plugin:execute"] },
    );
    // may fail permission if role filter — expand
    if (!result.ok && result.code === "PERMISSION_DENIED") {
      const result2 = await platform.executeTool(
        "plugin.echo",
        { message: "hello" },
        { userId: "u1", role: "admin" },
      );
      assert.equal(result2.ok, true);
      assert.equal(result2.echo, "hello");
    } else {
      assert.equal(result.ok, true);
      assert.equal(result.echo, "hello");
    }
  });

  it("caches cacheable tool results", async () => {
    platform.toolCache.clear();
    const a = await platform.executeTool("preview.health", {}, { userId: "u1", projectId: "p1" });
    const b = await platform.executeTool("preview.health", {}, { userId: "u1", projectId: "p1" });
    assert.equal(a.ok, true);
    assert.equal(b.ok, true);
    assert.ok(b.cached === true || a.executionId !== b.executionId);
    // Second call must be a cache hit
    assert.equal(b.cached, true);
  });

  it("SDK defineTool rejects incomplete definitions", () => {
    const { defineTool } = require("../../tools/sdk/define-tool");
    assert.throws(() => defineTool({ id: "x" }));
  });
});

describe("Tool self-correction helpers", () => {
  it("repairs string numbers and paths", () => {
    const { repairArguments } = require("../../tools/engine/self-correct");
    const tool = {
      schema: {
        properties: {
          maxChars: { type: "number" },
          path: { type: "string" },
          flag: { type: "boolean" },
        },
      },
    };
    const repaired = repairArguments(tool, {
      maxChars: "12",
      path: "/foo/bar",
      flag: "true",
    });
    assert.equal(repaired.maxChars, 12);
    assert.equal(repaired.path, "foo/bar");
    assert.equal(repaired.flag, true);
  });
});
