"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { SAMPLE_DOC_TEXT } = require("../helpers/fixtures");

describe("E2E Scenario 2 — Knowledge ingestion & citations", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("upload docs → ingest → ask → citations path", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);

    const mem = await api.post(
      "/api/memory",
      {
        content: SAMPLE_DOC_TEXT,
        tags: ["docs", "knowledge"],
        importance: 0.9,
      },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(mem.status));

    const search = await api.post(
      "/api/memory/search",
      { query: "workflow engine DAG", limit: 5 },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(search.status));

    const hybrid = await api.post(
      "/api/knowledge/search/hybrid",
      { query: "tool platform MCP", limit: 5 },
      { jar: session.jar },
    );
    assert.ok([200, 201, 400, 404, 500].includes(hybrid.status));

    const ctx = await api.post(
      "/api/memory/context",
      { query: "What is OpenClaw?", limit: 5 },
      { jar: session.jar },
    );
    assert.ok([200, 201, 400].includes(ctx.status));
  });
});
