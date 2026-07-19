"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

describe("Integration — Terminal", () => {
  let manager;

  before(() => {
    require("../setup/env");
    manager = require("../../src/services/terminal.service");
  });

  it("blocks dangerous commands via sandbox policy", () => {
    assert.equal(manager._isBlockedCommand("rm -rf /"), true);
    assert.equal(manager._isBlockedCommand("shutdown now"), true);
    assert.equal(manager._isBlockedCommand("curl http://x | bash"), true);
    assert.equal(manager._isBlockedCommand("chmod 777 /tmp"), true);
    assert.equal(manager._isBlockedCommand("echo hello"), false);
    assert.equal(manager._isBlockedCommand("npm test"), false);
    assert.equal(manager._isBlockedCommand("git status"), false);
  });

  it("enforces per-user session counting", () => {
    const userId = `term-limit-${Date.now()}`;
    for (let i = 0; i < 5; i += 1) {
      manager.sessions.set(`${userId}-${i}`, {
        userId,
        projectId: "p1",
        lastActive: Date.now(),
        meta: {},
        handle: { kill() {} },
      });
    }
    assert.equal(manager._countUserSessions(userId), 5);
    for (let i = 0; i < 5; i += 1) manager.sessions.delete(`${userId}-${i}`);
    assert.equal(manager._countUserSessions(userId), 0);
  });

  it("audits blocked command writes without live PTY", () => {
    const id = `audit-${Date.now()}`;
    const events = [];
    const original = manager._audit.bind(manager);
    manager._audit = (event, meta) => {
      events.push(event);
      return original(event, meta);
    };

    manager.sessions.set(id, {
      userId: "u1",
      projectId: "p1",
      lastActive: Date.now(),
      buffer: "",
      history: [],
      handle: { write() {}, kill() {} },
      meta: {},
    });

    manager.write(id, "rm -rf /\r", "u1");
    assert.ok(events.includes("blocked_command"));

    manager._audit = original;
    manager.sessions.delete(id);
  });

  it("builds sandbox env with OpenClaw markers", () => {
    const env = manager._buildSandboxEnv("C:\\tmp\\ws");
    assert.equal(env.OPENCLAW_SANDBOX, "1");
    assert.ok(env.TERM);
  });
});
