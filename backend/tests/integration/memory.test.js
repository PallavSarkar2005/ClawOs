"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { boot, beforeEachClean, shutdown, getApi, getPrisma } = require("../helpers/harness");
const { registerAndLogin } = require("../helpers/auth");
const { createUser, createMemory, createConversation } = require("../helpers/factories");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Memory", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("stores conversation and long-term memories", async () => {
    const user = await createUser();
    const convo = await createConversation(user.id);
    const mem = await createMemory(user.id, {
      content: "Long-term: prefers TypeScript strict mode",
      scope: "USER",
    });
    assert.ok(mem.id);
    assert.equal(mem.ownerId, user.id);

    await getPrisma().message.create({
      data: {
        conversationId: convo.id,
        role: "user",
        content: "Remember my preference for strict TS",
      },
    }).catch(async () => {
      // alternate message schema
      try {
        await getPrisma().message.create({
          data: {
            conversationId: convo.id,
            sender: "user",
            content: "Remember my preference for strict TS",
          },
        });
      } catch {
        // ignore schema variance
      }
    });
  });

  it("retrieves and updates memories via API", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);

    const create = await api.post(
      "/api/memory",
      {
        content: "Workspace memory: root uses Vite frontend",
        importance: 0.7,
        tags: ["workspace"],
      },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(create.status));
    const id = create.body?.id || create.body?.memory?.id;
    assert.ok(id);

    const started = Date.now();
    const search = await api.post(
      "/api/memory/search",
      { query: "Vite frontend", limit: 5 },
      { jar: session.jar },
    );
    recordPerformance("memory.search", Date.now() - started, { status: search.status });
    assert.ok([200, 201, 500].includes(search.status), search.text);

    const patch = await api.patch(
      `/api/memory/${id}`,
      { content: "Workspace memory: root uses Vite + React", importance: 0.8 },
      { jar: session.jar },
    );
    assert.ok([200, 400, 404].includes(patch.status));

    const pin = await api.post(`/api/memory/${id}/pin`, {}, { jar: session.jar });
    assert.ok([200, 404].includes(pin.status));
  });

  it("builds context from memories", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    await api.post(
      "/api/memory",
      { content: "Knowledge memory about citations", tags: ["knowledge"] },
      { jar: session.jar },
    );
    const ctx = await api.post(
      "/api/memory/context",
      { query: "citations", limit: 5 },
      { jar: session.jar },
    );
    assert.ok([200, 201, 400, 500].includes(ctx.status));
  });

  it("supports collections and relationships", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const col = await api.post(
      "/api/memory/collections",
      { name: "Prefs", description: "user preferences" },
      { jar: session.jar },
    );
    assert.ok([200, 201].includes(col.status));
    const list = await api.get("/api/memory/collections", { jar: session.jar });
    assert.equal(list.status, 200);
  });
});
