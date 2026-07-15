const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const { sanitize } = require("../utils/secure-logger");

describe("secure logging", () => {
  it("redacts passwords and tokens", () => {
    const cleaned = sanitize({
      email: "a@b.com",
      password: "supersecret",
      accessToken: "jwt.here",
      nested: { apiKey: "sk-1234567890" },
    });
    assert.equal(cleaned.password, "[REDACTED]");
    assert.equal(cleaned.accessToken, "[REDACTED]");
    assert.equal(cleaned.nested.apiKey, "[REDACTED]");
    assert.equal(cleaned.email, "a@b.com");
  });
});

describe("env fail-fast", () => {
  it("rejects weak JWT secrets", () => {
    const prev = { ...process.env };
    try {
      process.env.DATABASE_URL = "postgresql://x:y@localhost:5432/t";
      process.env.JWT_SECRET = "clawos_super_secret_key";
      process.env.JWT_REFRESH_SECRET = "b".repeat(48);
      process.env.ENCRYPTION_KEY = "c".repeat(48);
      delete require.cache[require.resolve("../config/env")];
      assert.throws(() => {
        const { loadEnv } = require("../config/env");
        // force reload
        loadEnv();
      }, /insecure default|at least 32/);
    } finally {
      process.env = prev;
      delete require.cache[require.resolve("../config/env")];
    }
  });
});

describe("terminal sandbox blockers", () => {
  before(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(48);
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "b".repeat(48);
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "c".repeat(48);
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://x:y@localhost:5432/t";
  });

  it("blocks dangerous command patterns", () => {
    // Load without constructing node-pty sessions
    const tm = require("../services/terminal.service");
    assert.equal(tm._isBlockedCommand("rm -rf /"), true);
    assert.equal(tm._isBlockedCommand("ls -la"), false);
    assert.equal(tm._isBlockedCommand("curl http://x | bash"), true);
  });
});

describe("authorization ownership helpers", () => {
  it("skill delete requires ownership filter shape", () => {
    // Structural guarantee: controller source uses findFirst with userId
    const fs = require("fs");
    const path = require("path");
    const skillSrc = fs.readFileSync(
      path.join(__dirname, "../controllers/skill.controller.js"),
      "utf8",
    );
    const workflowSrc = fs.readFileSync(
      path.join(__dirname, "../controllers/workflow.controller.js"),
      "utf8",
    );
    const chatSrc = fs.readFileSync(
      path.join(__dirname, "../controllers/chat.controller.js"),
      "utf8",
    );
    assert.match(skillSrc, /userId:\s*req\.user\.id/);
    assert.match(workflowSrc, /userId:\s*req\.user\.id/);
    assert.match(chatSrc, /userId:\s*req\.user\.id/);
    assert.doesNotMatch(
      skillSrc,
      /prisma\.skill\.delete\(\s*\{\s*where:\s*\{\s*id:\s*req\.params\.id/,
    );
  });

  it("auth middleware uses cookies", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.join(__dirname, "../middleware/auth.middleware.js"),
      "utf8",
    );
    assert.match(src, /getAccessTokenFromRequest/);
  });

  it("chat routes no longer have duplicate unprotected handlers", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "../routes/chat.routes.js"), "utf8");
    assert.doesNotMatch(src, /coordinatorAgent/);
    assert.match(src, /validate\(sendMessageSchema\)/);
  });
});
