"use strict";

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { isRedisAvailable, redisPing, REDIS_URL } = require("../helpers/redis");

describe("Integration — Redis availability", () => {
  let available = false;

  before(async () => {
    require("../setup/env");
    available = await isRedisAvailable();
  });

  it("detects Redis at REDIS_URL / localhost:6379", async () => {
    assert.equal(typeof available, "boolean");
    if (!available) {
      assert.ok(
        false,
        `Redis unavailable at ${REDIS_URL}. Start with: docker run -d --name clawos-redis -p 6379:6379 redis:7`,
      );
    }
  });

  it("responds to PING", async () => {
    if (!available) return;
    const reply = await redisPing();
    assert.match(reply, /\+PONG/i);
  });
});
