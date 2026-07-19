/**
 * Temporary filesystem helpers for deterministic workspace tests.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const roots = new Set();

function createTempDir(prefix = "clawos-") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.add(dir);
  return dir;
}

function writeTree(root, tree) {
  for (const [rel, content] of Object.entries(tree)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (content === null) {
      fs.mkdirSync(full, { recursive: true });
    } else {
      fs.writeFileSync(full, content, "utf8");
    }
  }
  return root;
}

function createSampleProject(prefix = "clawos-proj-") {
  const root = createTempDir(prefix);
  writeTree(root, {
    "package.json": JSON.stringify(
      { name: "sample-app", version: "1.0.0", main: "src/index.js" },
      null,
      2,
    ),
    "README.md": "# Sample App\n\nIntegration test fixture.\n",
    "src/index.js": [
      "const { greet } = require('./lib/greet');",
      "function main() {",
      "  console.log(greet('OpenClaw'));",
      "}",
      "module.exports = { main };",
      "if (require.main === module) main();",
      "",
    ].join("\n"),
    "src/lib/greet.js": [
      "function greet(name) {",
      "  return `Hello, ${name}!`;",
      "}",
      "module.exports = { greet };",
      "",
    ].join("\n"),
    "src/lib/math.js": [
      "function add(a, b) { return a + b; }",
      "function mul(a, b) { return a * b; }",
      "module.exports = { add, mul };",
      "",
    ].join("\n"),
    "tests/greet.test.js": [
      "const assert = require('assert');",
      "const { greet } = require('../src/lib/greet');",
      "assert.equal(greet('X'), 'Hello, X!');",
      "",
    ].join("\n"),
  });
  return root;
}

function cleanupTempDirs() {
  for (const dir of roots) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  roots.clear();
}

function uniqueName(prefix = "item") {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

module.exports = {
  createTempDir,
  writeTree,
  createSampleProject,
  cleanupTempDirs,
  uniqueName,
};
