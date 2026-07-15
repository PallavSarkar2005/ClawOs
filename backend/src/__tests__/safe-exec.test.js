const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseSafeCommand, assertInsideRoot, DANGEROUS_PATTERNS } = require("../utils/safe-exec");
const path = require("path");

describe("safe-exec", () => {
  it("parses allowed npm commands without shell", () => {
    const parsed = parseSafeCommand("npm run dev");
    assert.equal(parsed.file, "npm");
    assert.deepEqual(parsed.args, ["run", "dev"]);
  });

  it("rejects shell metacharacters", () => {
    assert.throws(() => parseSafeCommand("npm run dev; rm -rf /"), /disallowed/);
    assert.throws(() => parseSafeCommand("node index.js && cat /etc/passwd"), /disallowed/);
    assert.throws(() => parseSafeCommand("python $(whoami)"), /disallowed/);
  });

  it("rejects disallowed executables", () => {
    assert.throws(() => parseSafeCommand("bash -c whoami"), /not allowed/);
    assert.throws(() => parseSafeCommand("curl http://evil"), /not allowed/);
  });

  it("rejects path traversal in assertInsideRoot", () => {
    const root = path.join(process.cwd(), "tmp-workspace", "user", "project");
    assert.throws(
      () => assertInsideRoot(root, path.join(root, "..", "..", "etc")),
      /escapes/,
    );
  });

  it("allows paths inside root", () => {
    const root = path.join(process.cwd(), "tmp-workspace", "user", "project");
    const inside = assertInsideRoot(root, path.join(root, "src", "index.js"));
    assert.ok(inside.startsWith(path.resolve(root)));
  });
});
