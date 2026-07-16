/**
 * Permission checks + audit trail for every tool call.
 */

const prisma = require("../../database/prisma");

const ROLE_PERMISSIONS = {
  admin: ["*"],
  user: [
    "filesystem:read",
    "filesystem:write",
    "filesystem:delete",
    "filesystem:execute",
    "terminal:execute",
    "terminal:control",
    "git:read",
    "git:write",
    "git:execute",
    "workspace:read",
    "workspace:write",
    "memory:read",
    "memory:write",
    "memory:delete",
    "documents:read",
    "documents:write",
    "documents:execute",
    "browser:read",
    "browser:execute",
    "preview:read",
    "preview:write",
    "preview:execute",
    "search:execute",
    "mcp:execute",
    "plugin:execute",
  ],
  readonly: [
    "filesystem:read",
    "git:read",
    "workspace:read",
    "memory:read",
    "documents:read",
    "browser:read",
    "preview:read",
  ],
};

function expandPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.user;
}

function hasPermission(granted, required) {
  if (!required?.length) return true;
  const set = new Set(granted || []);
  if (set.has("*")) return true;
  return required.every((perm) => {
    if (set.has(perm)) return true;
    const [ns] = String(perm).split(":");
    return set.has(`${ns}:*`) || set.has("*");
  });
}

/**
 * Resolve effective permissions for a call context.
 */
async function resolvePermissions(ctx = {}) {
  const role = ctx.role || ctx.userRole || "user";
  let granted = expandPermissions(role);

  if (ctx.permissions && Array.isArray(ctx.permissions)) {
    granted = [...new Set([...granted, ...ctx.permissions])];
  }

  if (ctx.allowedTools?.length) {
    const cats = new Set(ctx.allowedTools);
    granted = granted.filter((p) => {
      if (p === "*") return true;
      const ns = p.split(":")[0];
      return cats.has(ns) || [...cats].some((c) => c === ns || c.startsWith(`${ns}.`));
    });
  }

  return granted;
}

function auditAsync(data) {
  Promise.resolve()
    .then(() =>
      prisma.toolPermission.create({
        data: {
          toolId: data.toolId,
          userId: data.userId || null,
          agentType: data.agentType || null,
          executionId: data.executionId || null,
          required: data.required,
          granted: data.granted,
          allowed: data.allowed,
          metadata: { source: data.source },
        },
      }),
    )
    .catch(() => {});
}

/**
 * Check tool permissions before execution.
 */
async function checkPermissions(tool, ctx = {}) {
  const granted = await resolvePermissions(ctx);
  const required = tool.permissions || [];
  const allowed = hasPermission(granted, required);

  const audit = {
    toolId: tool.id,
    required,
    granted,
    allowed,
    userId: ctx.userId || null,
    agentType: ctx.agentType || null,
    executionId: ctx.executionId || null,
    source: tool.source,
    at: new Date().toISOString(),
  };

  auditAsync(audit);

  if (!allowed) {
    const err = new Error(`Permission denied for tool ${tool.id}`);
    err.code = "PERMISSION_DENIED";
    err.audit = audit;
    throw err;
  }

  return audit;
}

module.exports = {
  ROLE_PERMISSIONS,
  expandPermissions,
  hasPermission,
  resolvePermissions,
  checkPermissions,
};
