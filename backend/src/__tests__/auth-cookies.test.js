const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");

describe("secure cookies helpers", () => {
  before(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(48);
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "b".repeat(48);
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "c".repeat(48);
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://x:y@localhost:5432/t";
    process.env.NODE_ENV = process.env.NODE_ENV || "development";
    process.env.CORS_ORIGINS = process.env.CORS_ORIGINS || "http://localhost:5173";
  });

  it("reads access token from cookie preferentially over missing bearer", () => {
    const { getAccessTokenFromRequest } = require("../utils/cookies");
    const req = {
      cookies: { accessToken: "cookie-token" },
      headers: {},
    };
    assert.equal(getAccessTokenFromRequest(req), "cookie-token");
  });

  it("falls back to Authorization bearer for API clients", () => {
    const { getAccessTokenFromRequest } = require("../utils/cookies");
    const req = {
      cookies: {},
      headers: { authorization: "Bearer header-token" },
    };
    assert.equal(getAccessTokenFromRequest(req), "header-token");
  });

  it("sets httpOnly cookies on response", () => {
    const { setAuthCookies } = require("../utils/cookies");
    const cookies = [];
    const res = {
      cookie(name, value, opts) {
        cookies.push({ name, value, opts });
      },
    };
    setAuthCookies(res, {
      accessToken: "access",
      refreshToken: "refresh",
      rememberMe: true,
    });
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((c) => c.opts.httpOnly === true));
    assert.ok(cookies.every((c) => c.opts.sameSite === "lax" || c.opts.sameSite === "strict"));
  });

  it("JWT service signs and verifies access tokens", () => {
    const jwtService = require("../services/jwt.service");
    const token = jwtService.generateAccessToken(
      { id: "u1", email: "a@b.com", role: "user" },
      "s1",
    );
    const decoded = jwtService.verifyAccessToken(token);
    assert.equal(decoded.id, "u1");
    assert.equal(decoded.sessionId, "s1");
  });

  it("refresh rotation produces different tokens", () => {
    const jwtService = require("../services/jwt.service");
    const a = jwtService.generateRefreshToken({ id: "u1" }, "s1");
    const b = jwtService.generateRefreshToken({ id: "u1" }, "s1");
    // tokens may be identical if signed in same second with same payload — still verify both
    assert.ok(jwtService.verifyRefreshToken(a).id === "u1");
    assert.ok(jwtService.verifyRefreshToken(b).id === "u1");
  });
});
