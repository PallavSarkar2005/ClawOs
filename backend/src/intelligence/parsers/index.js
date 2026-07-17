/**
 * Language parser plugin registry — Phase 6 Workspace Intelligence.
 * Each parser extracts symbols, imports, exports, calls, routes, etc. from source text.
 */

const crypto = require("crypto");

const EXT_LANGUAGE = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "css",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".md": "markdown",
  ".mdx": "markdown",
  ".prisma": "prisma",
  ".sql": "sql",
};

/** @type {Map<string, Function>} */
const plugins = new Map();

function registerParser(language, parseFn) {
  plugins.set(language, parseFn);
}

function detectLanguage(filePath) {
  const lower = String(filePath || "").toLowerCase();
  const idx = lower.lastIndexOf(".");
  if (idx < 0) return "unknown";
  return EXT_LANGUAGE[lower.slice(idx)] || "unknown";
}

function contentHash(content) {
  return crypto.createHash("sha256").update(String(content || "")).digest("hex").slice(0, 32);
}

function lineOf(content, index) {
  return content.slice(0, Math.max(0, index)).split("\n").length;
}

function pushSymbol(out, partial) {
  out.symbols.push({
    name: partial.name,
    kind: partial.kind,
    signature: partial.signature || null,
    startLine: partial.startLine || 1,
    endLine: partial.endLine || partial.startLine || 1,
    exported: Boolean(partial.exported),
    visibility: partial.visibility || "public",
    parentSymbol: partial.parentSymbol || null,
    documentation: partial.documentation || null,
    typeInfo: partial.typeInfo || null,
    metadata: partial.metadata || {},
  });
}

function parseJavaScriptFamily(content, filePath, language) {
  const out = emptyResult(language);
  const isTs = language === "typescript";

  // Imports
  const importRe =
    /(?:^|\n)\s*(?:import\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\)|export\s+(?:type\s+)?\*\s+from\s+['"]([^'"]+)['"])/g;
  let m;
  while ((m = importRe.exec(content))) {
    const spec = m[1] || m[2] || m[3];
    if (!spec) continue;
    out.imports.push({
      specifier: spec,
      line: lineOf(content, m.index),
      isExternal: !spec.startsWith(".") && !spec.startsWith("/"),
      kind: "import",
    });
  }

  // Exports
  const exportRe =
    /(?:^|\n)\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = exportRe.exec(content))) {
    out.exports.push({ name: m[1], line: lineOf(content, m.index), kind: "export" });
  }
  const namedExportRe = /(?:^|\n)\s*export\s*\{([^}]+)\}/g;
  while ((m = namedExportRe.exec(content))) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) out.exports.push({ name, line: lineOf(content, m.index), kind: "export" });
    }
  }

  // Functions
  const fnRe =
    /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
  while ((m = fnRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: `function ${m[1]}(${m[2]})`,
      startLine: lineOf(content, m.index),
      exported: /export/.test(m[0]),
    });
  }

  // Arrow / const functions
  const arrowRe =
    /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g;
  while ((m = arrowRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: m[0].trim().slice(0, 120),
      startLine: lineOf(content, m.index),
      exported: /export/.test(m[0]),
    });
  }

  // Classes
  const classRe =
    /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?(?:\s+implements\s+([^{]+))?/g;
  while ((m = classRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "class",
      signature: m[0].trim().slice(0, 160),
      startLine: lineOf(content, m.index),
      exported: /export/.test(m[0]),
      metadata: { extends: m[2] || null, implements: m[3] ? m[3].split(",").map((s) => s.trim()) : [] },
    });
    if (m[2]) {
      out.hierarchy.push({ child: m[1], parent: m[2], kind: "extends" });
    }
    if (m[3]) {
      for (const iface of m[3].split(",")) {
        out.hierarchy.push({ child: m[1], parent: iface.trim(), kind: "implements" });
      }
    }
  }

  if (isTs) {
    const ifaceRe =
      /(?:^|\n)\s*(?:export\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([^{=]+))?/g;
    while ((m = ifaceRe.exec(content))) {
      const kind = m[0].includes("interface") ? "interface" : "type";
      pushSymbol(out, {
        name: m[1],
        kind,
        signature: m[0].trim().slice(0, 120),
        startLine: lineOf(content, m.index),
        exported: /export/.test(m[0]),
      });
      if (m[2] && kind === "interface") {
        for (const p of m[2].split(",")) {
          out.hierarchy.push({ child: m[1], parent: p.trim(), kind: "extends" });
        }
      }
    }
    const enumRe = /(?:^|\n)\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/g;
    while ((m = enumRe.exec(content))) {
      pushSymbol(out, {
        name: m[1],
        kind: "enum",
        startLine: lineOf(content, m.index),
        exported: /export/.test(m[0]),
      });
    }
  }

  // React components (PascalCase function/const returning JSX-ish)
  const compRe =
    /(?:^|\n)\s*(?:export\s+(?:default\s+)?)?(?:function|const)\s+([A-Z][A-Za-z0-9_]*)\s*(?:=\s*(?:React\.)?(?:memo\()?|(?:\())/g;
  while ((m = compRe.exec(content))) {
    if (!out.symbols.some((s) => s.name === m[1] && s.kind === "component")) {
      pushSymbol(out, {
        name: m[1],
        kind: "component",
        startLine: lineOf(content, m.index),
        exported: /export/.test(m[0]),
        metadata: { framework: "react" },
      });
    }
  }

  // Hooks
  const hookRe =
    /(?:^|\n)\s*(?:export\s+)?(?:function|const)\s+(use[A-Z][A-Za-z0-9_]*)/g;
  while ((m = hookRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "hook",
      startLine: lineOf(content, m.index),
      exported: /export/.test(m[0]),
    });
  }

  // JSX usage of components
  const jsxRe = /<([A-Z][A-Za-z0-9_]*)\b/g;
  while ((m = jsxRe.exec(content))) {
    out.calls.push({
      callee: m[1],
      line: lineOf(content, m.index),
      kind: "jsx",
    });
  }

  // Function calls
  const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  const skip = new Set([
    "if", "for", "while", "switch", "catch", "function", "return", "typeof", "new", "await", "import", "require",
  ]);
  while ((m = callRe.exec(content))) {
    if (skip.has(m[1])) continue;
    out.calls.push({ callee: m[1], line: lineOf(content, m.index), kind: "call" });
  }

  // Express / router routes
  const routeRe =
    /(?:app|router|Route)\.(get|post|put|patch|delete|use|all)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = routeRe.exec(content))) {
    out.routes.push({
      method: m[1].toUpperCase(),
      path: m[2],
      line: lineOf(content, m.index),
      file: filePath,
    });
  }

  // React Router
  const rrRe = /<(?:Route|Routes)\b[^>]*\bpath\s*=\s*['"`]([^'"`]+)['"`]/gi;
  while ((m = rrRe.exec(content))) {
    out.routes.push({
      method: "PAGE",
      path: m[1],
      line: lineOf(content, m.index),
      file: filePath,
      kind: "react-router",
    });
  }

  // Env vars
  const envRe = /(?:process\.env\.|import\.meta\.env\.)([A-Z0-9_]+)/g;
  while ((m = envRe.exec(content))) {
    out.envVars.push(m[1]);
  }

  // Variables (top-level const/let/var that aren't functions)
  const varRe = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?!.*=>)/g;
  while ((m = varRe.exec(content))) {
    if (!out.symbols.some((s) => s.name === m[1])) {
      pushSymbol(out, {
        name: m[1],
        kind: "variable",
        startLine: lineOf(content, m.index),
        exported: /export/.test(m[0]),
      });
    }
  }

  return out;
}

function parsePython(content, filePath) {
  const out = emptyResult("python");
  let m;

  const importRe = /(?:^|\n)\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/g;
  while ((m = importRe.exec(content))) {
    const spec = m[1] || m[2];
    out.imports.push({
      specifier: spec,
      line: lineOf(content, m.index),
      isExternal: !spec.startsWith("."),
      kind: "import",
    });
  }

  const classRe = /(?:^|\n)\s*class\s+(\w+)(?:\s*\(([^)]*)\))?:/g;
  while ((m = classRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "class",
      signature: m[0].trim(),
      startLine: lineOf(content, m.index),
      metadata: { bases: m[2] ? m[2].split(",").map((s) => s.trim()) : [] },
    });
    if (m[2]) {
      for (const b of m[2].split(",")) {
        const base = b.trim().split(".")[0];
        if (base && base !== "object") out.hierarchy.push({ child: m[1], parent: base, kind: "extends" });
      }
    }
  }

  const fnRe = /(?:^|\n)\s*(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/g;
  while ((m = fnRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: `def ${m[1]}(${m[2]})`,
      startLine: lineOf(content, m.index),
    });
  }

  const callRe = /\b([a-zA-Z_][\w]*)\s*\(/g;
  const skip = new Set(["print", "len", "range", "str", "int", "list", "dict", "set", "type", "super"]);
  while ((m = callRe.exec(content))) {
    if (skip.has(m[1])) continue;
    out.calls.push({ callee: m[1], line: lineOf(content, m.index), kind: "call" });
  }

  const routeRe = /@(?:app|router|bp)\.(get|post|put|patch|delete)\s*\(\s*['"]([^'"]+)['"]/gi;
  while ((m = routeRe.exec(content))) {
    out.routes.push({ method: m[1].toUpperCase(), path: m[2], line: lineOf(content, m.index), file: filePath });
  }

  return out;
}

function parseJava(content, filePath) {
  const out = emptyResult("java");
  let m;

  const importRe = /(?:^|\n)\s*import\s+(?:static\s+)?([\w.]+)\s*;/g;
  while ((m = importRe.exec(content))) {
    out.imports.push({ specifier: m[1], line: lineOf(content, m.index), isExternal: true, kind: "import" });
  }

  const classRe =
    /(?:^|\n)\s*(?:public\s+|private\s+|protected\s+)?(?:abstract\s+|final\s+)?(class|interface|enum)\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([^{]+))?/g;
  while ((m = classRe.exec(content))) {
    pushSymbol(out, {
      name: m[2],
      kind: m[1] === "interface" ? "interface" : m[1] === "enum" ? "enum" : "class",
      startLine: lineOf(content, m.index),
      exported: /public/.test(m[0]),
      metadata: { extends: m[3] || null },
    });
    if (m[3]) out.hierarchy.push({ child: m[2], parent: m[3], kind: "extends" });
    if (m[4]) {
      for (const i of m[4].split(",")) {
        out.hierarchy.push({ child: m[2], parent: i.trim(), kind: "implements" });
      }
    }
  }

  const methodRe =
    /(?:^|\n)\s*(?:public|private|protected)\s+(?:static\s+)?(?:[\w<>[\],\s]+)\s+(\w+)\s*\(([^)]*)\)/g;
  while ((m = methodRe.exec(content))) {
    if (["if", "for", "while", "switch", "catch"].includes(m[1])) continue;
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: m[0].trim().slice(0, 120),
      startLine: lineOf(content, m.index),
    });
  }

  return out;
}

function parseGo(content, filePath) {
  const out = emptyResult("go");
  let m;

  const importRe = /(?:^|\n)\s*import\s+(?:\(\s*([\s\S]*?)\)|"([^"]+)")/g;
  while ((m = importRe.exec(content))) {
    if (m[2]) {
      out.imports.push({ specifier: m[2], line: lineOf(content, m.index), isExternal: !m[2].startsWith("."), kind: "import" });
    } else if (m[1]) {
      for (const line of m[1].split("\n")) {
        const im = line.match(/"([^"]+)"/);
        if (im) out.imports.push({ specifier: im[1], line: lineOf(content, m.index), isExternal: true, kind: "import" });
      }
    }
  }

  const fnRe = /(?:^|\n)\s*func\s+(?:\([\w\s*]+\)\s+)?(\w+)\s*\(([^)]*)\)/g;
  while ((m = fnRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: `func ${m[1]}(${m[2]})`,
      startLine: lineOf(content, m.index),
      exported: /^[A-Z]/.test(m[1]),
    });
  }

  const typeRe = /(?:^|\n)\s*type\s+(\w+)\s+(struct|interface)/g;
  while ((m = typeRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: m[2] === "interface" ? "interface" : "class",
      startLine: lineOf(content, m.index),
      exported: /^[A-Z]/.test(m[1]),
    });
  }

  return out;
}

function parseRust(content, filePath) {
  const out = emptyResult("rust");
  let m;

  const useRe = /(?:^|\n)\s*use\s+([\w:]+)(?:\s*::\s*\{[^}]+\})?\s*;/g;
  while ((m = useRe.exec(content))) {
    out.imports.push({ specifier: m[1], line: lineOf(content, m.index), isExternal: true, kind: "import" });
  }

  const fnRe = /(?:^|\n)\s*(?:pub(?:\([^)]+\))?\s+)?(?:async\s+)?fn\s+(\w+)\s*(?:<[^>]+>)?\s*\(([^)]*)\)/g;
  while ((m = fnRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: `fn ${m[1]}(${m[2]})`,
      startLine: lineOf(content, m.index),
      exported: /pub/.test(m[0]),
    });
  }

  const structRe = /(?:^|\n)\s*(?:pub\s+)?(?:struct|enum|trait)\s+(\w+)/g;
  while ((m = structRe.exec(content))) {
    const kind = m[0].includes("trait") ? "interface" : m[0].includes("enum") ? "enum" : "class";
    pushSymbol(out, {
      name: m[1],
      kind,
      startLine: lineOf(content, m.index),
      exported: /pub/.test(m[0]),
    });
  }

  const implRe = /(?:^|\n)\s*impl(?:\s*<[^>]+>)?\s+(?:(\w+)\s+for\s+)?(\w+)/g;
  while ((m = implRe.exec(content))) {
    if (m[1]) out.hierarchy.push({ child: m[2], parent: m[1], kind: "implements" });
  }

  return out;
}

function parseCpp(content, filePath) {
  const out = emptyResult(filePath.endsWith(".c") || filePath.endsWith(".h") ? "c" : "cpp");
  let m;

  const includeRe = /#\s*include\s*[<"]([^>"]+)[>"]/g;
  while ((m = includeRe.exec(content))) {
    out.imports.push({
      specifier: m[1],
      line: lineOf(content, m.index),
      isExternal: m[0].includes("<"),
      kind: "include",
    });
  }

  const classRe = /(?:^|\n)\s*(?:class|struct)\s+(\w+)(?:\s*:\s*(?:public|private|protected)\s+(\w+))?/g;
  while ((m = classRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "class",
      startLine: lineOf(content, m.index),
    });
    if (m[2]) out.hierarchy.push({ child: m[1], parent: m[2], kind: "extends" });
  }

  const fnRe = /(?:^|\n)\s*(?:[\w:&*<>]+\s+)+(\w+)\s*\(([^;{]*)\)\s*(?:const)?\s*[{;]/g;
  while ((m = fnRe.exec(content))) {
    if (["if", "for", "while", "switch", "return"].includes(m[1])) continue;
    pushSymbol(out, {
      name: m[1],
      kind: "function",
      signature: m[0].trim().slice(0, 120),
      startLine: lineOf(content, m.index),
    });
  }

  return out;
}

function parseHtml(content, filePath) {
  const out = emptyResult("html");
  let m;
  const scriptRe = /<script[^>]*\bsrc\s*=\s*['"]([^'"]+)['"]/gi;
  while ((m = scriptRe.exec(content))) {
    out.imports.push({ specifier: m[1], line: lineOf(content, m.index), isExternal: /^https?:/.test(m[1]), kind: "script" });
  }
  const linkRe = /<link[^>]*\bhref\s*=\s*['"]([^'"]+)['"]/gi;
  while ((m = linkRe.exec(content))) {
    out.imports.push({ specifier: m[1], line: lineOf(content, m.index), isExternal: /^https?:/.test(m[1]), kind: "link" });
  }
  const idRe = /\bid\s*=\s*['"]([^'"]+)['"]/gi;
  while ((m = idRe.exec(content))) {
    pushSymbol(out, { name: m[1], kind: "element", startLine: lineOf(content, m.index) });
  }
  return out;
}

function parseCss(content) {
  const out = emptyResult("css");
  let m;
  const importRe = /@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/g;
  while ((m = importRe.exec(content))) {
    out.imports.push({ specifier: m[1], line: lineOf(content, m.index), isExternal: true, kind: "import" });
  }
  const selRe = /(?:^|\n)\s*([.#]?[A-Za-z_][\w-]*)\s*\{/g;
  while ((m = selRe.exec(content))) {
    pushSymbol(out, { name: m[1], kind: "selector", startLine: lineOf(content, m.index) });
  }
  return out;
}

function parseJson(content, filePath) {
  const out = emptyResult("json");
  try {
    const data = JSON.parse(content);
    if (filePath.endsWith("package.json")) {
      const deps = { ...(data.dependencies || {}), ...(data.devDependencies || {}) };
      for (const [name, version] of Object.entries(deps)) {
        out.imports.push({ specifier: name, version, isExternal: true, kind: "package" });
      }
      out.metadata.packageName = data.name;
      out.metadata.scripts = Object.keys(data.scripts || {});
    }
    if (Array.isArray(data)) {
      pushSymbol(out, { name: "root", kind: "array", startLine: 1 });
    } else if (data && typeof data === "object") {
      for (const key of Object.keys(data).slice(0, 200)) {
        pushSymbol(out, { name: key, kind: "property", startLine: 1 });
      }
    }
  } catch {
    out.metadata.parseError = true;
  }
  return out;
}

function parseYaml(content) {
  const out = emptyResult("yaml");
  let m;
  const keyRe = /(?:^|\n)\s*([A-Za-z_][\w-]*)\s*:/g;
  while ((m = keyRe.exec(content))) {
    pushSymbol(out, { name: m[1], kind: "property", startLine: lineOf(content, m.index) });
  }
  return out;
}

function parseMarkdown(content) {
  const out = emptyResult("markdown");
  let m;
  const headingRe = /(?:^|\n)(#{1,6})\s+(.+)/g;
  while ((m = headingRe.exec(content))) {
    pushSymbol(out, {
      name: m[2].trim(),
      kind: "heading",
      startLine: lineOf(content, m.index),
      metadata: { level: m[1].length },
    });
  }
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  while ((m = linkRe.exec(content))) {
    out.imports.push({ specifier: m[2], line: lineOf(content, m.index), isExternal: /^https?:/.test(m[2]), kind: "link" });
  }
  return out;
}

function parsePrisma(content) {
  const out = emptyResult("prisma");
  let m;
  const modelRe = /(?:^|\n)\s*model\s+(\w+)\s*\{([^}]*)\}/g;
  while ((m = modelRe.exec(content))) {
    pushSymbol(out, {
      name: m[1],
      kind: "model",
      startLine: lineOf(content, m.index),
      metadata: { fields: m[2].split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 50) },
    });
    out.database.push({ name: m[1], kind: "model", fields: m[2] });
  }
  const enumRe = /(?:^|\n)\s*enum\s+(\w+)\s*\{/g;
  while ((m = enumRe.exec(content))) {
    pushSymbol(out, { name: m[1], kind: "enum", startLine: lineOf(content, m.index) });
  }
  return out;
}

function parseSql(content) {
  const out = emptyResult("sql");
  let m;
  const tableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"'[]?(\w+)[`"'\]]?/gi;
  while ((m = tableRe.exec(content))) {
    pushSymbol(out, { name: m[1], kind: "table", startLine: lineOf(content, m.index) });
    out.database.push({ name: m[1], kind: "table" });
  }
  const fkRe = /FOREIGN\s+KEY\s*\([^)]+\)\s*REFERENCES\s+[`"'[]?(\w+)/gi;
  while ((m = fkRe.exec(content))) {
    out.database.push({ name: m[1], kind: "reference" });
  }
  return out;
}

function emptyResult(language) {
  return {
    language,
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
}

// Register built-in parsers
registerParser("javascript", (c, p) => parseJavaScriptFamily(c, p, "javascript"));
registerParser("typescript", (c, p) => parseJavaScriptFamily(c, p, "typescript"));
registerParser("python", parsePython);
registerParser("java", parseJava);
registerParser("go", parseGo);
registerParser("rust", parseRust);
registerParser("c", parseCpp);
registerParser("cpp", parseCpp);
registerParser("html", parseHtml);
registerParser("css", parseCss);
registerParser("json", parseJson);
registerParser("yaml", parseYaml);
registerParser("markdown", parseMarkdown);
registerParser("prisma", parsePrisma);
registerParser("sql", parseSql);

function parseFile(filePath, content) {
  const language = detectLanguage(filePath);
  const parser = plugins.get(language);
  const result = parser
    ? parser(String(content || ""), filePath)
    : emptyResult(language);
  result.language = language;
  result.contentHash = contentHash(content);
  result.lineCount = String(content || "").split("\n").length;
  result.sizeBytes = Buffer.byteLength(String(content || ""), "utf8");
  // Deduplicate calls (keep first 500)
  const seenCalls = new Set();
  result.calls = result.calls.filter((c) => {
    const key = `${c.callee}:${c.line}:${c.kind}`;
    if (seenCalls.has(key)) return false;
    seenCalls.add(key);
    return true;
  }).slice(0, 500);
  result.envVars = [...new Set(result.envVars)];
  return result;
}

function supportedLanguages() {
  return [...plugins.keys()].sort();
}

module.exports = {
  registerParser,
  detectLanguage,
  contentHash,
  parseFile,
  supportedLanguages,
  EXT_LANGUAGE,
  plugins,
};
