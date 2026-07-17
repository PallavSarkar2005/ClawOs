/**
 * Repository understanding — answers architectural questions from real index data.
 */

const AUTH_HINTS = /\b(auth|login|signup|sign-?in|sign-?up|jwt|session|passport|oauth|password|token|credential)\b/i;
const JWT_HINTS = /\bjwt|jsonwebtoken|Bearer|accessToken|refreshToken\b/i;

function answerQuestion(question, ctx) {
  const q = String(question || "").toLowerCase();
  const {
    files = [],
    symbols = [],
    deps = [],
    routes = [],
    references = [],
    architecture = null,
    components = null,
    database = null,
    apiGraph = null,
  } = ctx;

  if (/where.*auth|authentication|auth flow/i.test(q)) {
    return findAuthentication(files, symbols, routes, deps);
  }
  if (/how.*login|login work/i.test(q)) {
    return explainLogin(files, symbols, routes, deps);
  }
  if (/jwt|which files.*jwt|use jwt/i.test(q)) {
    return findJwtUsage(files, symbols, references, deps);
  }
  if (/depend.*api|what depends|who (uses|calls|imports)/i.test(q)) {
    const target = extractTarget(q, files, symbols);
    return dependencyImpact(target, deps, references);
  }
  if (/where.*called|call(ed|s)?|find references|who calls/i.test(q)) {
    const target = extractTarget(q, files, symbols);
    return findCallSites(target, references, symbols);
  }
  if (/react.*page|which.*component|uses this component/i.test(q)) {
    const target = extractTarget(q, files, symbols);
    return componentUsage(target, components, references, symbols);
  }
  if (/database|table|prisma|which services.*table/i.test(q)) {
    const target = extractTarget(q, files, symbols);
    return databaseAccess(target, database, files, symbols, deps);
  }
  if (/architecture|show arch|overview|tech stack/i.test(q)) {
    return {
      type: "architecture",
      answer: architecture?.summary || "Architecture not yet indexed.",
      architecture,
      techStack: architecture?.techStack,
      layers: architecture?.layers,
    };
  }

  // Generic semantic search over symbols/files
  const hits = [
    ...symbols
      .filter((s) => s.name.toLowerCase().includes(q.split(/\s+/).pop() || ""))
      .slice(0, 15)
      .map((s) => ({ kind: "symbol", name: s.name, path: s.filePath, line: s.startLine })),
    ...files
      .filter((f) => (f.path || "").toLowerCase().includes(q.replace(/[^a-z0-9/_-]/g, "")))
      .slice(0, 10)
      .map((f) => ({ kind: "file", path: f.path })),
  ];

  return {
    type: "search",
    answer: hits.length ? `Found ${hits.length} related items.` : "No matching repository evidence.",
    hits,
  };
}

function findAuthentication(files, symbols, routes, deps) {
  const authFiles = files.filter((f) => AUTH_HINTS.test(f.path || "") || AUTH_HINTS.test(f.name || ""));
  const authSymbols = symbols.filter((s) => AUTH_HINTS.test(s.name) || AUTH_HINTS.test(s.signature || ""));
  const authRoutes = routes.filter((r) => AUTH_HINTS.test(r.path) || AUTH_HINTS.test(r.file || ""));

  const related = new Set(authFiles.map((f) => f.path));
  for (const f of authFiles) {
    for (const d of deps.filter((x) => x.fromPath === f.path || x.toPath === f.path)) {
      related.add(d.fromPath);
      related.add(d.toPath);
    }
  }

  return {
    type: "authentication",
    answer: authFiles.length
      ? `Authentication appears concentrated in ${authFiles.length} file(s): ${authFiles
          .slice(0, 5)
          .map((f) => f.path)
          .join(", ")}.`
      : authSymbols.length
        ? `Found ${authSymbols.length} auth-related symbols.`
        : "No clear authentication module detected yet.",
    files: authFiles.map((f) => f.path),
    symbols: authSymbols.slice(0, 30).map((s) => ({ name: s.name, path: s.filePath, line: s.startLine, kind: s.kind })),
    routes: authRoutes.slice(0, 20),
    relatedFiles: [...related].slice(0, 40),
  };
}

function explainLogin(files, symbols, routes, deps) {
  const loginRoutes = routes.filter((r) => /login|sign-?in|auth/i.test(r.path));
  const loginSymbols = symbols.filter((s) => /login|signIn|authenticate|verifyPassword/i.test(s.name));
  const loginFiles = files.filter((f) => /login|auth/i.test(f.path || ""));

  const flow = [];
  if (loginRoutes.length) flow.push({ step: 1, name: "HTTP route", detail: loginRoutes[0] });
  if (loginSymbols.length) {
    flow.push({
      step: 2,
      name: "Handler/symbol",
      detail: { name: loginSymbols[0].name, path: loginSymbols[0].filePath, line: loginSymbols[0].startLine },
    });
  }
  const jwtSym = symbols.find((s) => /jwt|token|session/i.test(s.name));
  if (jwtSym) flow.push({ step: 3, name: "Token/session", detail: { name: jwtSym.name, path: jwtSym.filePath } });

  return {
    type: "login_flow",
    answer: flow.length
      ? `Login flow inferred across ${flow.length} stage(s) from indexed routes and symbols.`
      : "Could not infer a login flow from current index.",
    flow,
    files: loginFiles.map((f) => f.path),
    symbols: loginSymbols.slice(0, 20).map((s) => ({ name: s.name, path: s.filePath, line: s.startLine })),
    routes: loginRoutes,
  };
}

function findJwtUsage(files, symbols, references, deps) {
  const jwtFiles = files.filter((f) => JWT_HINTS.test(f.path || ""));
  const jwtSymbols = symbols.filter(
    (s) => JWT_HINTS.test(s.name) || JWT_HINTS.test(s.signature || ""),
  );
  const jwtRefs = references.filter((r) => JWT_HINTS.test(r.name || "") || JWT_HINTS.test(r.context || ""));
  const pkgDeps = deps.filter((d) => /jsonwebtoken|jose|jwt/i.test(d.specifier || d.toPath || ""));

  const fileSet = new Set([
    ...jwtFiles.map((f) => f.path),
    ...jwtSymbols.map((s) => s.filePath),
    ...jwtRefs.map((r) => r.context).filter(Boolean),
    ...pkgDeps.map((d) => d.fromPath),
  ]);

  return {
    type: "jwt",
    answer: fileSet.size
      ? `JWT-related usage found in ${fileSet.size} file(s).`
      : "No JWT usage detected in the index.",
    files: [...fileSet],
    symbols: jwtSymbols.slice(0, 30).map((s) => ({ name: s.name, path: s.filePath, line: s.startLine })),
    packageImports: pkgDeps.map((d) => ({ from: d.fromPath, package: d.specifier || d.toPath })),
  };
}

function extractTarget(q, files, symbols) {
  // Try quoted name first
  const quoted = q.match(/['"`]([^'"`]+)['"`]/);
  if (quoted) return { name: quoted[1], path: null };

  for (const s of symbols) {
    if (q.includes(s.name.toLowerCase()) && s.name.length > 2) {
      return { name: s.name, path: s.filePath };
    }
  }
  for (const f of files) {
    const base = (f.path || "").split("/").pop();
    if (base && q.includes(base.toLowerCase())) return { name: null, path: f.path };
  }
  const tokens = q.split(/\W+/).filter((t) => t.length > 3);
  return { name: tokens[tokens.length - 1] || null, path: null };
}

function dependencyImpact(target, deps, references) {
  if (target.path) {
    const dependents = deps.filter((d) => d.toPath === target.path).map((d) => d.fromPath);
    return {
      type: "dependency_impact",
      answer: `${dependents.length} file(s) depend on ${target.path}.`,
      target,
      dependents,
    };
  }
  if (target.name) {
    const refs = references.filter((r) => r.name === target.name);
    return {
      type: "dependency_impact",
      answer: `${refs.length} reference(s) to ${target.name}.`,
      target,
      references: refs.slice(0, 50),
    };
  }
  return { type: "dependency_impact", answer: "Specify a file or symbol.", target };
}

function findCallSites(target, references, symbols) {
  const name = target.name;
  if (!name) return { type: "calls", answer: "Specify a function/symbol name." };
  const refs = references.filter((r) => r.name === name && (r.kind === "call" || r.kind === "jsx"));
  const defs = symbols.filter((s) => s.name === name);
  return {
    type: "calls",
    answer: `"${name}" is called from ${refs.length} site(s); defined in ${defs.length} place(s).`,
    definitions: defs.map((s) => ({ path: s.filePath, line: s.startLine, kind: s.kind })),
    callSites: refs.slice(0, 100).map((r) => ({ path: r.context, line: r.line, kind: r.kind })),
  };
}

function componentUsage(target, components, references, symbols) {
  const name = target.name;
  if (!name) return { type: "component_usage", answer: "Specify a component name." };
  const jsxRefs = references.filter((r) => r.name === name && r.kind === "jsx");
  const pages = jsxRefs
    .map((r) => r.context)
    .filter((p) => p && (/\/pages?\//i.test(p) || /Page\.(jsx|tsx)$/i.test(p)));
  return {
    type: "component_usage",
    answer: `Component "${name}" is used in ${jsxRefs.length} JSX site(s)${pages.length ? ` across ${[...new Set(pages)].length} page file(s)` : ""}.`,
    usages: jsxRefs.slice(0, 50),
    pages: [...new Set(pages)],
    componentNode: (components?.nodes || []).find((n) => n.label === name) || null,
  };
}

function databaseAccess(target, database, files, symbols, deps) {
  const modelName = target.name;
  const models = database?.nodes || [];
  const model = models.find((m) => m.label === modelName || m.id === modelName);
  const relatedFiles = files.filter(
    (f) =>
      (modelName && (f.path || "").toLowerCase().includes(modelName.toLowerCase())) ||
      /prisma|repository|model/i.test(f.path || ""),
  );
  const relatedSymbols = symbols.filter(
    (s) => modelName && (s.name.includes(modelName) || (s.signature || "").includes(modelName)),
  );
  const services = relatedFiles.filter((f) => /service|repository|controller/i.test(f.path || ""));

  return {
    type: "database_access",
    answer: model
      ? `Model/table "${model.label}" found with ${model.fields?.length || 0} field hint(s); ${services.length} service-like file(s) touch related paths.`
      : modelName
        ? `No exact model "${modelName}" in database graph; showing related files.`
        : `Database graph has ${models.length} model(s).`,
    model: model || null,
    models: models.slice(0, 50),
    services: services.map((f) => f.path),
    symbols: relatedSymbols.slice(0, 30).map((s) => ({ name: s.name, path: s.filePath })),
  };
}

module.exports = {
  answerQuestion,
  findAuthentication,
  explainLogin,
  findJwtUsage,
};
