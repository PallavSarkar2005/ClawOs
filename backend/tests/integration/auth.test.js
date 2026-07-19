"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { boot, beforeEachClean, shutdown, getApi, getPrisma } = require("../helpers/harness");
const { registerUser, loginUser, registerAndLogin } = require("../helpers/auth");
const { strongPassword, weakPassword } = require("../helpers/fixtures");
const { recordPerformance } = require("../helpers/report");

describe("Integration — Authentication", () => {
  before(async () => {
    await boot();
  });
  after(async () => {
    await shutdown();
  });
  beforeEach(async () => {
    await beforeEachClean();
  });

  it("registers a new user", async () => {
    const api = getApi();
    const jar = api.jar();
    const { res, email } = await registerUser(api, jar);
    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, email);
    const dbUser = await getPrisma().user.findUnique({ where: { email } });
    assert.ok(dbUser);
    assert.ok(dbUser.passwordHash);
  });

  it("rejects weak passwords and mismatched confirmation", async () => {
    const api = getApi();
    const jar = api.jar();
    const weak = await api.post(
      "/api/auth/register",
      {
        name: "Weak",
        email: "weak@test.openclaw.local",
        password: weakPassword,
        confirmPassword: weakPassword,
        acceptTerms: true,
      },
      { jar },
    );
    assert.equal(weak.status, 400);

    const mismatch = await api.post(
      "/api/auth/register",
      {
        name: "Mismatch",
        email: "mismatch@test.openclaw.local",
        password: strongPassword,
        confirmPassword: "Different1!",
        acceptTerms: true,
      },
      { jar },
    );
    assert.equal(mismatch.status, 400);
  });

  it("logs in and sets httpOnly auth cookies", async () => {
    const api = getApi();
    const started = Date.now();
    const session = await registerAndLogin(api);
    recordPerformance("auth.login", Date.now() - started);
    assert.ok(session.accessToken);
    assert.ok(session.refreshToken);
    const me = await api.get("/api/auth/me", { jar: session.jar });
    assert.equal(me.status, 200);
    assert.equal(me.body.email, session.email);
  });

  it("refreshes tokens via refresh cookie", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    assert.ok(session.refreshToken);
    // JWT iat is second-granularity; wait so rotated refresh token differs
    await new Promise((r) => setTimeout(r, 1100));
    const refresh = await api.post("/api/auth/refresh", {}, { jar: session.jar });
    assert.equal(refresh.status, 200, refresh.text);
    assert.equal(refresh.body.success, true);
    assert.ok(session.jar.get("accessToken"));
    const me = await api.get("/api/auth/me", { jar: session.jar });
    assert.equal(me.status, 200);
  });

  it("logs out and revokes session cookies", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const logout = await api.post("/api/auth/logout", {}, { jar: session.jar });
    assert.equal(logout.status, 200);
    const me = await api.get("/api/auth/me", { jar: session.jar });
    assert.equal(me.status, 401);
  });

  it("rejects invalid JWT and forged tokens", async () => {
    const api = getApi();
    const forged = jwt.sign(
      { id: "fake", email: "x@y.z", role: "admin" },
      "wrong-secret-that-is-long-enough-123456",
      { expiresIn: "1h" },
    );
    const res = await api.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${forged}` },
    });
    assert.equal(res.status, 401);

    const garbage = await api.get("/api/auth/me", {
      headers: { Authorization: "Bearer not-a-jwt" },
    });
    assert.equal(garbage.status, 401);
  });

  it("rejects expired access tokens", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const expired = jwt.sign(
      {
        id: session.user.id,
        email: session.email,
        role: "user",
        sessionId: "expired-session",
      },
      process.env.JWT_SECRET,
      { expiresIn: -10 },
    );
    const res = await api.get("/api/auth/me", {
      headers: { Authorization: `Bearer ${expired}` },
    });
    assert.equal(res.status, 401);
  });

  it("enforces session revocation", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const sessions = await api.get("/api/auth/sessions", { jar: session.jar });
    assert.equal(sessions.status, 200);
    // logout-everywhere revokes current session + tokens
    const revoke = await api.post("/api/auth/logout-everywhere", {}, { jar: session.jar });
    assert.ok([200, 204].includes(revoke.status), revoke.text);
    const me = await api.get("/api/auth/me", { jar: session.jar });
    assert.ok([401, 403].includes(me.status));
  });

  it("blocks protected routes without auth", async () => {
    const api = getApi();
    const res = await api.get("/api/projects");
    assert.equal(res.status, 401);
  });

  it("rejects wrong password login", async () => {
    const api = getApi();
    const jar = api.jar();
    const { email } = await registerUser(api, jar);
    const bad = await loginUser(api, jar, email, "WrongPass1!");
    assert.equal(bad.status, 401);
  });

  it("validates JWT from Authorization bearer header", async () => {
    const api = getApi();
    const session = await registerAndLogin(api);
    const emptyJar = api.jar();
    const res = await api.get("/api/auth/me", {
      jar: emptyJar,
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.email, session.email);
  });
});
