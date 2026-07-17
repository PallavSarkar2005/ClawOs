/**
 * Expression engine — boolean, math, string, date, JSON, templates.
 * Supports: {{var}}, ${expr}, and expression strings.
 */

function getByPath(obj, path) {
  if (obj == null) return undefined;
  if (!path) return obj;
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setByPath(obj, path, value) {
  const parts = String(path).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

const DATE_FNS = {
  now: () => new Date().toISOString(),
  today: () => new Date().toISOString().slice(0, 10),
  timestamp: () => Date.now(),
  format: (d, fmt = "iso") => {
    const date = d instanceof Date ? d : new Date(d);
    if (fmt === "iso") return date.toISOString();
    if (fmt === "date") return date.toISOString().slice(0, 10);
    if (fmt === "time") return date.toISOString().slice(11, 19);
    return date.toISOString();
  },
  addDays: (d, n) => {
    const date = new Date(d);
    date.setDate(date.getDate() + Number(n));
    return date.toISOString();
  },
  addHours: (d, n) => {
    const date = new Date(d);
    date.setHours(date.getHours() + Number(n));
    return date.toISOString();
  },
};

const STRING_FNS = {
  lower: (s) => String(s ?? "").toLowerCase(),
  upper: (s) => String(s ?? "").toUpperCase(),
  trim: (s) => String(s ?? "").trim(),
  length: (s) => String(s ?? "").length,
  includes: (s, sub) => String(s ?? "").includes(String(sub)),
  startsWith: (s, sub) => String(s ?? "").startsWith(String(sub)),
  endsWith: (s, sub) => String(s ?? "").endsWith(String(sub)),
  replace: (s, a, b) => String(s ?? "").split(String(a)).join(String(b)),
  split: (s, sep) => String(s ?? "").split(String(sep)),
  join: (arr, sep) => (Array.isArray(arr) ? arr : []).join(String(sep ?? ",")),
  slice: (s, a, b) => String(s ?? "").slice(Number(a), b != null ? Number(b) : undefined),
};

const MATH_FNS = {
  abs: Math.abs,
  ceil: Math.ceil,
  floor: Math.floor,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  sqrt: Math.sqrt,
  sum: (...args) => args.flat().reduce((a, b) => a + Number(b), 0),
  avg: (...args) => {
    const flat = args.flat().map(Number);
    return flat.length ? flat.reduce((a, b) => a + b, 0) / flat.length : 0;
  },
};

const JSON_FNS = {
  parse: (s) => (typeof s === "string" ? JSON.parse(s) : s),
  stringify: (v, space) => JSON.stringify(v, null, space),
  keys: (o) => Object.keys(o || {}),
  values: (o) => Object.values(o || {}),
  get: getByPath,
  has: (o, path) => getByPath(o, path) !== undefined,
};

function buildScope(variables = {}) {
  return {
    ...variables,
    vars: variables,
    inputs: variables.inputs || {},
    outputs: variables.outputs || {},
    env: variables.env || {},
    secrets: variables.secrets || {},
    global: variables.global || {},
    nodes: variables.nodes || {},
    true: true,
    false: false,
    null: null,
    undefined: undefined,
    Math: MATH_FNS,
    String: STRING_FNS,
    Date: DATE_FNS,
    JSON: JSON_FNS,
    ...MATH_FNS,
    ...STRING_FNS,
    ...DATE_FNS,
    ...JSON_FNS,
    len: (x) => (Array.isArray(x) || typeof x === "string" ? x.length : Object.keys(x || {}).length),
    isEmpty: (x) =>
      x == null ||
      x === "" ||
      (Array.isArray(x) && x.length === 0) ||
      (typeof x === "object" && Object.keys(x).length === 0),
    coalesce: (...args) => args.find((a) => a != null && a !== ""),
  };
}

/**
 * Safe-ish expression evaluator — no Function constructor with free form.
 * Supports comparison/boolean/math via recursive descent tokenizer.
 */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const s = String(expr).trim();
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if ("(),[].".includes(ch)) {
      tokens.push({ type: ch, value: ch });
      i += 1;
      continue;
    }
    if ("+-*/%".includes(ch)) {
      tokens.push({ type: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === "=" && s[i + 1] === "=") {
      tokens.push({ type: "cmp", value: "==" });
      i += 2;
      continue;
    }
    if (ch === "!" && s[i + 1] === "=") {
      tokens.push({ type: "cmp", value: "!=" });
      i += 2;
      continue;
    }
    if (ch === "<" || ch === ">") {
      const next = s[i + 1] === "=" ? ch + "=" : ch;
      tokens.push({ type: "cmp", value: next });
      i += next.length;
      continue;
    }
    if (ch === "&" && s[i + 1] === "&") {
      tokens.push({ type: "logic", value: "&&" });
      i += 2;
      continue;
    }
    if (ch === "|" && s[i + 1] === "|") {
      tokens.push({ type: "logic", value: "||" });
      i += 2;
      continue;
    }
    if (ch === "!") {
      tokens.push({ type: "not", value: "!" });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let out = "";
      while (j < s.length && s[j] !== ch) {
        if (s[j] === "\\") {
          out += s[j + 1];
          j += 2;
          continue;
        }
        out += s[j];
        j += 1;
      }
      tokens.push({ type: "string", value: out });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(s[i + 1] || ""))) {
      let j = i;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      tokens.push({ type: "number", value: Number(s.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9_$]/.test(s[j])) j += 1;
      const word = s.slice(i, j);
      if (word === "and") tokens.push({ type: "logic", value: "&&" });
      else if (word === "or") tokens.push({ type: "logic", value: "||" });
      else if (word === "not") tokens.push({ type: "not", value: "!" });
      else if (word === "true") tokens.push({ type: "bool", value: true });
      else if (word === "false") tokens.push({ type: "bool", value: false });
      else if (word === "null") tokens.push({ type: "null", value: null });
      else tokens.push({ type: "ident", value: word });
      i = j;
      continue;
    }
    throw new Error(`Unexpected character in expression: ${ch}`);
  }
  return tokens;
}

function parseExpression(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const consume = () => tokens[pos++];

  function parsePrimary() {
    const t = peek();
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "number" || t.type === "string" || t.type === "bool" || t.type === "null") {
      consume();
      return { kind: "literal", value: t.value };
    }
    if (t.type === "not") {
      consume();
      return { kind: "unary", op: "!", arg: parsePrimary() };
    }
    if (t.type === "(") {
      consume();
      const inner = parseLogic();
      if (!peek() || peek().type !== ")") throw new Error("Expected )");
      consume();
      return inner;
    }
    if (t.type === "ident") {
      consume();
      let node = { kind: "ident", name: t.value };
      while (peek()) {
        if (peek().type === ".") {
          consume();
          const next = consume();
          if (!next || next.type !== "ident") throw new Error("Expected property");
          node = { kind: "member", object: node, property: next.value };
        } else if (peek().type === "[") {
          consume();
          const idx = parseLogic();
          if (!peek() || peek().type !== "]") throw new Error("Expected ]");
          consume();
          node = { kind: "index", object: node, index: idx };
        } else if (peek().type === "(") {
          consume();
          const args = [];
          if (peek() && peek().type !== ")") {
            args.push(parseLogic());
            while (peek() && peek().type === ",") {
              consume();
              args.push(parseLogic());
            }
          }
          if (!peek() || peek().type !== ")") throw new Error("Expected )");
          consume();
          node = { kind: "call", callee: node, args };
        } else break;
      }
      return node;
    }
    if (t.type === "[") {
      consume();
      const items = [];
      if (peek() && peek().type !== "]") {
        items.push(parseLogic());
        while (peek() && peek().type === ",") {
          consume();
          items.push(parseLogic());
        }
      }
      if (!peek() || peek().type !== "]") throw new Error("Expected ]");
      consume();
      return { kind: "array", items };
    }
    throw new Error(`Unexpected token: ${t.type}`);
  }

  function parseMul() {
    let left = parsePrimary();
    while (peek() && peek().type === "op" && "*/%".includes(peek().value)) {
      const op = consume().value;
      left = { kind: "binary", op, left, right: parsePrimary() };
    }
    return left;
  }

  function parseAdd() {
    let left = parseMul();
    while (peek() && peek().type === "op" && "+-".includes(peek().value)) {
      const op = consume().value;
      left = { kind: "binary", op, left, right: parseMul() };
    }
    return left;
  }

  function parseCmp() {
    let left = parseAdd();
    while (peek() && peek().type === "cmp") {
      const op = consume().value;
      left = { kind: "binary", op, left, right: parseAdd() };
    }
    return left;
  }

  function parseLogic() {
    let left = parseCmp();
    while (peek() && peek().type === "logic") {
      const op = consume().value;
      left = { kind: "binary", op, left, right: parseCmp() };
    }
    return left;
  }

  const ast = parseLogic();
  if (pos < tokens.length) throw new Error("Unexpected trailing tokens");
  return ast;
}

function evalAst(ast, scope) {
  switch (ast.kind) {
    case "literal":
      return ast.value;
    case "ident": {
      if (!(ast.name in scope) && scope.vars && ast.name in scope.vars) return scope.vars[ast.name];
      return scope[ast.name];
    }
    case "member": {
      const obj = evalAst(ast.object, scope);
      if (obj == null) return undefined;
      return obj[ast.property];
    }
    case "index": {
      const obj = evalAst(ast.object, scope);
      const idx = evalAst(ast.index, scope);
      if (obj == null) return undefined;
      return obj[idx];
    }
    case "call": {
      const callee = evalAst(ast.callee, scope);
      if (typeof callee !== "function") throw new Error("Not a function");
      const args = ast.args.map((a) => evalAst(a, scope));
      return callee(...args);
    }
    case "array":
      return ast.items.map((i) => evalAst(i, scope));
    case "unary":
      if (ast.op === "!") return !evalAst(ast.arg, scope);
      throw new Error(`Unknown unary ${ast.op}`);
    case "binary": {
      const l = evalAst(ast.left, scope);
      const r = evalAst(ast.right, scope);
      switch (ast.op) {
        case "+": return typeof l === "string" || typeof r === "string" ? String(l) + String(r) : Number(l) + Number(r);
        case "-": return Number(l) - Number(r);
        case "*": return Number(l) * Number(r);
        case "/": return Number(l) / Number(r);
        case "%": return Number(l) % Number(r);
        case "==": return l == r; // eslint-disable-line eqeqeq
        case "!=": return l != r; // eslint-disable-line eqeqeq
        case "<": return l < r;
        case ">": return l > r;
        case "<=": return l <= r;
        case ">=": return l >= r;
        case "&&": return l && r;
        case "||": return l || r;
        default: throw new Error(`Unknown op ${ast.op}`);
      }
    }
    default:
      throw new Error(`Unknown AST kind ${ast.kind}`);
  }
}

function evaluate(expression, variables = {}) {
  if (expression == null || expression === "") return undefined;
  if (typeof expression === "boolean" || typeof expression === "number") return expression;
  const expr = String(expression).trim();
  if (expr === "true") return true;
  if (expr === "false") return false;
  const scope = buildScope(variables);
  const tokens = tokenize(expr);
  const ast = parseExpression(tokens);
  return evalAst(ast, scope);
}

function interpolate(template, variables = {}) {
  if (template == null) return template;
  if (typeof template !== "string") return template;
  return template.replace(/\{\{([^}]+)\}\}|\$\{([^}]+)\}/g, (_, a, b) => {
    const expr = (a || b).trim();
    try {
      const val = evaluate(expr, variables);
      if (val == null) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    } catch {
      return "";
    }
  });
}

function resolveValue(value, variables = {}) {
  if (typeof value === "string") {
    if (/^\{\{[^}]+\}\}$/.test(value.trim()) || /^\$\{[^}]+\}$/.test(value.trim())) {
      const expr = value.trim().replace(/^\{\{|\}\}$/g, "").replace(/^\$\{|\}$/g, "").trim();
      return evaluate(expr, variables);
    }
    if (value.includes("{{") || value.includes("${")) return interpolate(value, variables);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, variables));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolveValue(v, variables);
    return out;
  }
  return value;
}

function renderTemplate(template, variables = {}) {
  return interpolate(template, variables);
}

module.exports = {
  evaluate,
  interpolate,
  resolveValue,
  renderTemplate,
  getByPath,
  setByPath,
  buildScope,
};
