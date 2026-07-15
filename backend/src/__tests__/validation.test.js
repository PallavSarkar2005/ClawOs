const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

describe("validation schemas", () => {
  let schemas;

  before(() => {
    // Ensure env for modules that need it
    process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(48);
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "b".repeat(48);
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "c".repeat(48);
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://x:y@localhost:5432/t";
    schemas = require("../validators/common.validator");
  });

  it("rejects sendMessage without conversationId", () => {
    const result = schemas.sendMessageSchema.safeParse({ message: "hi" });
    assert.equal(result.success, false);
  });

  it("accepts valid sendMessage", () => {
    const result = schemas.sendMessageSchema.safeParse({
      conversationId: "c1",
      message: "hello",
    });
    assert.equal(result.success, true);
  });

  it("rejects path traversal in file paths", () => {
    const result = schemas.filePathSchema.safeParse("../etc/passwd");
    assert.equal(result.success, false);
  });

  it("rejects invalid git branch names", () => {
    const result = schemas.gitCheckoutSchema.safeParse({ branch: "evil;rm -rf /" });
    assert.equal(result.success, false);
  });

  it("accepts createSkill payload", () => {
    const result = schemas.createSkillSchema.safeParse({
      name: "Helper",
      prompt: "Be helpful",
    });
    assert.equal(result.success, true);
  });
});

describe("validate middleware", () => {
  it("returns structured 400 errors", async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "a".repeat(48);
    process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "b".repeat(48);
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || "c".repeat(48);
    process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://x:y@localhost:5432/t";

    const { validate } = require("../middleware/validate.middleware");
    const { z } = require("zod");
    const mw = validate(z.object({ email: z.string().email() }));

    const req = { body: { email: "not-an-email" } };
    let statusCode = 0;
    let payload = null;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        payload = data;
        return data;
      },
    };

    await new Promise((resolve) => {
      mw(req, res, () => resolve());
      // if validation failed, next wasn't called
      setImmediate(resolve);
    });

    assert.equal(statusCode, 400);
    assert.ok(payload.errors);
    assert.ok(Array.isArray(payload.errors));
  });
});
