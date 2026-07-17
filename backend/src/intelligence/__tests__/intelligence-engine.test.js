const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { parseFile, detectLanguage, supportedLanguages, contentHash, registerParser } = require("../parsers");
const {
  buildImportGraph,
  buildCallGraph,
  buildComponentTree,
  buildApiGraph,
  buildDatabaseGraph,
  detectCycles,
  resolveRelativeImport,
} = require("../graphs/builder");
const { analyzeQuality } = require("../analysis/quality");
const { detectDeadCode, detectUnusedFiles, detectDuplicates } = require("../analysis/dead-code");
const { generateArchitecture } = require("../analysis/architecture");
const { analyzeImpact, planRename } = require("../analysis/impact");
const { answerQuestion } = require("../understanding/answers");

describe("language parsers", () => {
  it("detects languages from extensions", () => {
    assert.equal(detectLanguage("src/app.ts"), "typescript");
    assert.equal(detectLanguage("main.py"), "python");
    assert.equal(detectLanguage("schema.prisma"), "prisma");
    assert.equal(detectLanguage("lib.rs"), "rust");
  });

  it("supports required language set", () => {
    const langs = supportedLanguages();
    for (const l of [
      "javascript",
      "typescript",
      "python",
      "java",
      "go",
      "rust",
      "c",
      "cpp",
      "html",
      "css",
      "json",
      "yaml",
      "markdown",
      "prisma",
      "sql",
    ]) {
      assert.ok(langs.includes(l), `missing ${l}`);
    }
  });

  it("parses javascript symbols imports routes and components", () => {
    const src = `
import express from 'express';
import { UserService } from './user.service';
export function login(req, res) { return auth(); }
export class AuthController extends BaseController {}
export const App = () => <Layout><Button /></Layout>;
app.post('/api/login', login);
const x = process.env.JWT_SECRET;
`;
    const result = parseFile("src/auth.js", src);
    assert.equal(result.language, "javascript");
    assert.ok(result.imports.some((i) => i.specifier === "express"));
    assert.ok(result.imports.some((i) => i.specifier === "./user.service"));
    assert.ok(result.symbols.some((s) => s.name === "login" && s.kind === "function"));
    assert.ok(result.symbols.some((s) => s.name === "AuthController" && s.kind === "class"));
    assert.ok(result.routes.some((r) => r.path === "/api/login"));
    assert.ok(result.envVars.includes("JWT_SECRET"));
    assert.ok(result.calls.some((c) => c.callee === "Button" && c.kind === "jsx"));
    assert.ok(result.contentHash);
  });

  it("parses typescript interfaces", () => {
    const result = parseFile(
      "types.ts",
      "export interface User { id: string }\nexport type Id = string;\nexport enum Role { Admin }",
    );
    assert.ok(result.symbols.some((s) => s.name === "User" && s.kind === "interface"));
    assert.ok(result.symbols.some((s) => s.name === "Id" && s.kind === "type"));
    assert.ok(result.symbols.some((s) => s.name === "Role" && s.kind === "enum"));
  });

  it("parses python classes and functions", () => {
    const result = parseFile(
      "app.py",
      "from flask import Flask\nclass User(Base):\n  pass\ndef login():\n  return True\n",
    );
    assert.ok(result.symbols.some((s) => s.name === "User" && s.kind === "class"));
    assert.ok(result.symbols.some((s) => s.name === "login"));
    assert.ok(result.imports.some((i) => i.specifier === "flask"));
  });

  it("parses prisma models", () => {
    const result = parseFile(
      "schema.prisma",
      "model User {\n  id String\n  posts Post[]\n}\nmodel Post {\n  id String\n}\n",
    );
    assert.ok(result.symbols.some((s) => s.name === "User" && s.kind === "model"));
    assert.ok(result.database.some((d) => d.name === "Post"));
  });

  it("parses go and rust", () => {
    const go = parseFile("main.go", 'import "fmt"\nfunc Main() {}\ntype Server struct{}\n');
    assert.ok(go.symbols.some((s) => s.name === "Main"));
    const rs = parseFile("lib.rs", "use std::io;\npub fn run() {}\nstruct App;\n");
    assert.ok(rs.symbols.some((s) => s.name === "run"));
  });

  it("allows plugin registration", () => {
    registerParser("kotlin", (content) => {
      const out = {
        language: "kotlin",
        symbols: [],
        imports: [],
        exports: [],
        calls: [],
        routes: [],
        hierarchy: [],
        envVars: [],
        database: [],
        metadata: {},
      };
      const m = content.match(/fun\s+(\w+)/);
      if (m) out.symbols.push({ name: m[1], kind: "function", startLine: 1, endLine: 1, exported: true });
      return out;
    });
    // Plugin is registered even if extension map doesn't include .kt yet
    assert.ok(supportedLanguages().includes("kotlin"));
  });

  it("hashes content stably", () => {
    assert.equal(contentHash("abc"), contentHash("abc"));
    assert.notEqual(contentHash("abc"), contentHash("abcd"));
  });
});

describe("graph builders", () => {
  it("builds import graph and detects cycles", () => {
    const deps = [
      { fromPath: "a.js", toPath: "b.js", kind: "import", isExternal: false },
      { fromPath: "b.js", toPath: "c.js", kind: "import", isExternal: false },
      { fromPath: "c.js", toPath: "a.js", kind: "import", isExternal: false },
    ];
    const g = buildImportGraph(deps);
    assert.equal(g.edges.length, 3);
    assert.ok(g.cycles.length >= 1);
    assert.ok(detectCycles(deps.map((d) => ({ from: d.fromPath, to: d.toPath }))).length >= 1);
  });

  it("resolves relative imports", () => {
    assert.equal(resolveRelativeImport("src/a/b.js", "./c"), "src/a/c");
    assert.equal(resolveRelativeImport("src/a/b.js", "../d"), "src/d");
  });

  it("builds call and component graphs from real symbols", () => {
    const symbols = [
      { id: "1", name: "login", kind: "function", filePath: "auth.js", startLine: 1 },
      { id: "2", name: "App", kind: "component", filePath: "App.jsx", startLine: 1 },
      { id: "3", name: "Button", kind: "component", filePath: "Button.jsx", startLine: 1 },
    ];
    const calls = [
      { callee: "login", filePath: "auth.js", line: 10, kind: "call" },
      { callee: "Button", filePath: "App.jsx", line: 5, kind: "jsx" },
    ];
    const callG = buildCallGraph(symbols, calls);
    assert.ok(callG.edges.length >= 1);
    const comp = buildComponentTree(symbols, calls);
    assert.ok(comp.nodes.some((n) => n.label === "App"));
    assert.ok(comp.edges.some((e) => e.kind === "renders"));
  });

  it("builds api and database graphs", () => {
    const api = buildApiGraph([{ method: "POST", path: "/login", file: "routes.js", line: 1 }]);
    assert.equal(api.routes.length, 1);
    const db = buildDatabaseGraph(
      [{ name: "User", kind: "model", fields: ["id", "posts Post"] }, { name: "Post", kind: "model", fields: ["id"] }],
      [],
    );
    assert.ok(db.nodes.length >= 2);
    assert.ok(db.edges.some((e) => e.from === "User" && e.to === "Post"));
  });
});

describe("quality and dead code", () => {
  it("flags large files and missing tests", () => {
    const files = [
      { path: "big.js", isFolder: false, lineCount: 900, complexity: 50 },
      { path: "svc.js", isFolder: false, lineCount: 40, complexity: 5 },
      { path: "a.js", isFolder: false, lineCount: 20, complexity: 2 },
      { path: "b.js", isFolder: false, lineCount: 20, complexity: 2 },
      { path: "c.js", isFolder: false, lineCount: 20, complexity: 2 },
      { path: "d.js", isFolder: false, lineCount: 20, complexity: 2 },
      { path: "e.js", isFolder: false, lineCount: 20, complexity: 2 },
      { path: "f.js", isFolder: false, lineCount: 20, complexity: 2 },
    ];
    const metrics = analyzeQuality(files, [], [], []);
    assert.ok(metrics.some((m) => m.metricType === "large_file"));
    assert.ok(metrics.some((m) => m.metricType === "missing_tests"));
  });

  it("detects dead symbols and unused files", () => {
    const symbols = [
      { name: "used", kind: "function", filePath: "a.js", exported: false },
      { name: "ghost", kind: "function", filePath: "a.js", exported: false },
    ];
    const dead = detectDeadCode(symbols, [{ callee: "used" }], []);
    assert.ok(dead.some((d) => d.name === "ghost"));
    assert.ok(!dead.some((d) => d.name === "used"));

    const files = [
      { path: "orphan.js", isFolder: false },
      { path: "used.js", isFolder: false },
    ];
    const deps = [
      { fromPath: "orphan.js", toPath: "used.js", isExternal: false },
    ];
    const unused = detectUnusedFiles(files, deps);
    assert.ok(unused.some((u) => u.path === "orphan.js"));
  });

  it("detects duplicate symbols", () => {
    const dups = detectDuplicates([
      { name: "helper", kind: "function", signature: "helper()", filePath: "a.js", startLine: 1 },
      { name: "helper", kind: "function", signature: "helper()", filePath: "b.js", startLine: 1 },
    ]);
    assert.ok(dups.length >= 1);
  });
});

describe("architecture and impact", () => {
  it("generates architecture from real analysis inputs", () => {
    const arch = generateArchitecture({
      files: [
        { path: "backend/src/controllers/auth.controller.js", isFolder: false },
        { path: "backend/src/services/auth.service.js", isFolder: false },
        { path: "backend/prisma/schema.prisma", isFolder: false },
        { path: "frontend/src/pages/LoginPage.jsx", isFolder: false },
      ],
      symbols: [{ name: "login", kind: "function", filePath: "auth.service.js", exported: true }],
      deps: [],
      routes: [{ method: "POST", path: "/login", file: "auth.controller.js" }],
      database: { nodes: [{ id: "User", label: "User" }], edges: [] },
      languageStats: { javascript: 3, prisma: 1 },
      components: { nodes: [{ id: "1", label: "LoginPage" }] },
      packageImports: [{ specifier: "express" }, { specifier: "react" }],
      metrics: [],
      deadCode: [],
      unusedFiles: [],
      cycles: [["a.js", "b.js", "a.js"]],
    });
    assert.ok(arch.summary.includes("files"));
    assert.ok(arch.layers.length >= 1);
    assert.ok(arch.techStack.some((t) => t.name === "javascript" || t.name === "Express" || t.name === "React"));
    assert.ok(arch.diagrams.requestLifecycle);
  });

  it("computes impact and rename plans", () => {
    const impact = analyzeImpact("repo", { path: "a.js", symbol: "login" }, {
      deps: [{ fromPath: "b.js", toPath: "a.js", isExternal: false }],
      symbols: [],
      references: [{ name: "login", line: 3, context: "b.js", kind: "call" }],
      files: [],
    });
    assert.equal(impact.directDependents.length, 1);
    assert.ok(impact.breakingChange);

    const plan = planRename("login", "signIn", {
      symbols: [{ name: "login", filePath: "a.js", startLine: 1 }],
      references: [{ name: "login", line: 5, context: "b.js", file: { path: "b.js" } }],
    });
    assert.equal(plan.edits.length, 2);
    assert.equal(plan.newName, "signIn");
  });
});

describe("repository understanding", () => {
  it("answers where is authentication from real data", () => {
    const result = answerQuestion("Where is authentication?", {
      files: [{ path: "src/auth/jwt.service.js", name: "jwt.service.js" }],
      symbols: [{ name: "verifyToken", kind: "function", filePath: "src/auth/jwt.service.js", startLine: 10 }],
      deps: [],
      routes: [{ method: "POST", path: "/api/auth/login", file: "auth.routes.js" }],
      references: [],
    });
    assert.equal(result.type, "authentication");
    assert.ok(result.files.length >= 1);
  });

  it("answers JWT usage", () => {
    const result = answerQuestion("Which files use JWT?", {
      files: [{ path: "jwt.service.js" }],
      symbols: [{ name: "signJwt", filePath: "jwt.service.js", startLine: 1 }],
      deps: [{ fromPath: "auth.js", toPath: "jsonwebtoken", specifier: "jsonwebtoken", isExternal: true }],
      routes: [],
      references: [],
    });
    assert.equal(result.type, "jwt");
    assert.ok(result.files.length >= 1);
  });

  it("answers call sites", () => {
    const result = answerQuestion('Where is function "login" called?', {
      files: [],
      symbols: [{ name: "login", filePath: "a.js", startLine: 1 }],
      deps: [],
      routes: [],
      references: [{ name: "login", kind: "call", context: "b.js", line: 4 }],
    });
    assert.equal(result.type, "calls");
    assert.ok(result.callSites.length >= 1);
  });
});

describe("performance smoke", () => {
  it("parses a large synthetic file quickly", () => {
    const lines = [];
    for (let i = 0; i < 2000; i++) {
      lines.push(`export function fn${i}() { return helper${i % 50}(); }`);
    }
    const start = Date.now();
    const result = parseFile("big.js", lines.join("\n"));
    const ms = Date.now() - start;
    assert.ok(result.symbols.length >= 2000);
    assert.ok(ms < 3000, `parse took ${ms}ms`);
  });
});
