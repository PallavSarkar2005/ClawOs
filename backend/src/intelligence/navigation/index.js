/**
 * Code navigation — go to definition, find references, call/type hierarchy, search.
 */

const prisma = require("../../database/prisma");

async function goToDefinition(repositoryId, { name, path, line }) {
  const where = { repositoryId, name };
  if (path) {
    const file = await prisma.repositoryFile.findFirst({
      where: { repositoryId, path },
    });
    if (file) where.fileId = file.id;
  }

  const symbols = await prisma.symbol.findMany({
    where,
    include: { file: true },
    orderBy: { startLine: "asc" },
    take: 20,
  });

  if (line && symbols.length > 1) {
    symbols.sort(
      (a, b) => Math.abs(a.startLine - line) - Math.abs(b.startLine - line),
    );
  }

  return symbols.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    path: s.file.path,
    line: s.startLine,
    endLine: s.endLine,
    signature: s.signature,
    exported: s.exported,
  }));
}

async function findReferences(repositoryId, { name, symbolId }) {
  const where = { repositoryId };
  if (symbolId) where.toSymbolId = symbolId;
  else if (name) where.name = name;

  const refs = await prisma.reference.findMany({
    where,
    include: { file: true, toSymbol: true, fromSymbol: true },
    take: 200,
  });

  return refs.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    path: r.file?.path || r.context,
    line: r.line,
    column: r.column,
    toSymbol: r.toSymbol?.name,
    fromSymbol: r.fromSymbol?.name,
  }));
}

async function peekDefinition(repositoryId, query) {
  const defs = await goToDefinition(repositoryId, query);
  if (!defs.length) return null;
  const top = defs[0];
  const file = await prisma.repositoryFile.findFirst({
    where: { repositoryId, path: top.path },
  });
  // Content lives on ProjectFile — resolve via projectFileId
  let snippet = null;
  if (file?.projectFileId) {
    const pf = await prisma.projectFile.findUnique({ where: { id: file.projectFileId } });
    if (pf?.content) {
      const lines = pf.content.split("\n");
      const start = Math.max(0, top.line - 1);
      const end = Math.min(lines.length, start + 15);
      snippet = lines.slice(start, end).join("\n");
    }
  }
  return { ...top, snippet };
}

async function implementationSearch(repositoryId, name) {
  const symbols = await prisma.symbol.findMany({
    where: {
      repositoryId,
      OR: [
        { name: { contains: name, mode: "insensitive" } },
        { signature: { contains: name, mode: "insensitive" } },
      ],
    },
    include: { file: true },
    take: 50,
  });
  return symbols.map((s) => ({
    id: s.id,
    name: s.name,
    kind: s.kind,
    path: s.file.path,
    line: s.startLine,
    signature: s.signature,
  }));
}

async function callHierarchy(repositoryId, name) {
  const symbols = await prisma.symbol.findMany({
    where: { repositoryId, name },
    include: { file: true },
  });
  const incoming = await prisma.reference.findMany({
    where: { repositoryId, name, kind: { in: ["call", "jsx"] } },
    include: { file: true, fromSymbol: true },
    take: 100,
  });
  const outgoing = await prisma.reference.findMany({
    where: {
      repositoryId,
      fromSymbolId: { in: symbols.map((s) => s.id) },
      kind: { in: ["call", "jsx"] },
    },
    include: { toSymbol: true, file: true },
    take: 100,
  });

  return {
    symbol: name,
    definitions: symbols.map((s) => ({ path: s.file.path, line: s.startLine, kind: s.kind })),
    callers: incoming.map((r) => ({
      path: r.file?.path || r.context,
      line: r.line,
      from: r.fromSymbol?.name,
    })),
    callees: outgoing.map((r) => ({
      path: r.file?.path,
      line: r.line,
      to: r.toSymbol?.name || r.name,
    })),
  };
}

async function typeHierarchy(repositoryId, name) {
  const symbols = await prisma.symbol.findMany({
    where: {
      repositoryId,
      OR: [{ name }, { metadata: { path: ["$", "extends"], equals: name } }],
      kind: { in: ["class", "interface", "type", "enum"] },
    },
    include: { file: true },
    take: 50,
  });

  const related = [];
  for (const s of symbols) {
    const meta = s.metadata || {};
    if (meta.extends) related.push({ from: s.name, to: meta.extends, kind: "extends" });
    for (const i of meta.implements || []) {
      related.push({ from: s.name, to: i, kind: "implements" });
    }
  }

  // Also search signature text
  const extendsHits = await prisma.symbol.findMany({
    where: {
      repositoryId,
      signature: { contains: name },
      kind: { in: ["class", "interface"] },
    },
    include: { file: true },
    take: 30,
  });

  return {
    symbol: name,
    types: [...symbols, ...extendsHits]
      .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        path: s.file.path,
        line: s.startLine,
        signature: s.signature,
      })),
    relations: related,
  };
}

async function breadcrumbs(repositoryId, filePath) {
  const parts = String(filePath || "").replace(/\\/g, "/").split("/").filter(Boolean);
  const crumbs = [];
  let acc = "";
  for (const part of parts) {
    acc = acc ? `${acc}/${part}` : part;
    crumbs.push({ label: part, path: acc });
  }
  const file = await prisma.repositoryFile.findFirst({
    where: { repositoryId, path: filePath },
    include: { symbols: { take: 20, orderBy: { startLine: "asc" } } },
  });
  return {
    path: filePath,
    crumbs,
    symbols: (file?.symbols || []).map((s) => ({ name: s.name, kind: s.kind, line: s.startLine })),
  };
}

async function workspaceSearch(repositoryId, query, options = {}) {
  const q = String(query || "").trim();
  if (!q) return { symbols: [], files: [], routes: [], latencyMs: 0 };
  const start = Date.now();
  const mode = options.mode || "hybrid";

  const [symbols, files, apiGraph] = await Promise.all([
    prisma.symbol.findMany({
      where: {
        repositoryId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { signature: { contains: q, mode: "insensitive" } },
        ],
      },
      include: { file: true },
      take: options.limit || 40,
    }),
    prisma.repositoryFile.findMany({
      where: {
        repositoryId,
        isFolder: false,
        OR: [
          { path: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
        ],
      },
      take: 30,
    }),
    prisma.apiGraph.findFirst({
      where: { repositoryId },
      orderBy: { computedAt: "desc" },
    }),
  ]);

  const routes = (Array.isArray(apiGraph?.routes) ? apiGraph.routes : [])
    .filter((r) => `${r.method} ${r.path} ${r.file}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 20);

  let semantic = [];
  if (mode === "semantic" || mode === "hybrid") {
    // Lexical semantic proxy over symbol docs/signatures
    semantic = symbols
      .map((s) => ({
        ...s,
        score: scoreSemantic(q, `${s.name} ${s.signature || ""} ${s.kind} ${s.file.path}`),
      }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score);
  }

  return {
    query: q,
    mode,
    symbols: (semantic.length ? semantic : symbols).map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      path: s.file.path,
      line: s.startLine,
      signature: s.signature,
      score: s.score,
    })),
    files: files.map((f) => ({ path: f.path, language: f.language, lines: f.lineCount })),
    routes,
    latencyMs: Date.now() - start,
  };
}

function scoreSemantic(query, text) {
  const qTokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  const t = text.toLowerCase();
  let score = 0;
  for (const tok of qTokens) {
    if (t.includes(tok)) score += 1;
  }
  if (t.includes(query.toLowerCase())) score += 2;
  return score / Math.max(1, qTokens.length);
}

module.exports = {
  goToDefinition,
  findReferences,
  peekDefinition,
  implementationSearch,
  callHierarchy,
  typeHierarchy,
  breadcrumbs,
  workspaceSearch,
};
