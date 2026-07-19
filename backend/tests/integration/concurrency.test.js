"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi, getPrisma } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");

describe("Integration — Concurrency", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("handles simultaneous API requests from multiple users", async () => {
    const api = getApi();
    const sessions = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        registerAndLogin(api, { name: `Concurrent ${i}` }),
      ),
    );

    const results = await Promise.all(
      sessions.map((s) =>
        api.post(
          "/api/memory",
          { content: `concurrent memory for ${s.email}`, tags: ["concurrency"] },
          { jar: s.jar },
        ),
      ),
    );

    assert.ok(results.every((r) => [200, 201].includes(r.status)));

    const emails = sessions.map((s) => s.email);
    const users = await getPrisma().user.findMany({
      where: { email: { in: emails } },
    });
    assert.equal(users.length, 5);

    const memories = await getPrisma().memory.findMany({
      where: { ownerId: { in: users.map((u) => u.id) } },
    });
    assert.ok(memories.length >= 5);
  });

  it("supports parallel project listing under load", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    await Promise.all(
      Array.from({ length: 3 }, (_, i) =>
        api.post(
          "/api/projects",
          {
            name: `P-${i}`,
            framework: "javascript",
            generate: false,
          },
          { jar: session.jar },
        ),
      ),
    );

    const lists = await Promise.all(
      Array.from({ length: 10 }, () => api.get("/api/projects", { jar: session.jar })),
    );
    assert.ok(lists.every((r) => r.status === 200));
    assert.ok(lists[0].body.length >= 3);
  });

  it("parallel workflow creates remain consistent", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const creates = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        api.post(
          "/api/workflows",
          {
            name: `W-${i}-${Date.now()}`,
            definition: {
              nodes: [
                { id: "start", type: "start", data: { label: "Start" } },
                { id: "end", type: "end", data: { label: "End" } },
              ],
              edges: [{ id: "e1", source: "start", target: "end" }],
            },
          },
          { jar: session.jar },
        ),
      ),
    );
    assert.ok(
      creates.every((r) => [200, 201].includes(r.status)),
      creates.map((r) => `${r.status}:${r.text}`).join(" | "),
    );
    const list = await api.get("/api/workflows", { jar: session.jar });
    assert.equal(list.status, 200);
    const items = list.body?.workflows || list.body;
    assert.ok(Array.isArray(items) && items.length >= 4);
  });
});
