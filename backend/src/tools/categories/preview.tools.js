/**
 * Preview tools — start, stop, refresh, health, logs.
 */

const { defineTool, ok, fail } = require("../sdk/define-tool");

/** projectId → preview session */
const previews = new Map();

function getPreview(projectId) {
  return previews.get(projectId) || null;
}

const previewTools = [
  defineTool({
    id: "preview.start",
    name: "Start Preview",
    description: "Build and start a live HTML/CSS/JS preview payload",
    category: "preview",
    version: "1.0.0",
    permissions: ["preview:write"],
    timeout: 10000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        html: { type: "string" },
        css: { type: "string" },
        javascript: { type: "string" },
        js: { type: "string" },
        title: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      const html = args.html || "";
      const css = args.css || "";
      const js = args.javascript || args.js || "";
      const title = args.title || "Preview";
      const document = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${title}</title><style>${css}</style></head><body>${html}<script>${js}</script></body></html>`;
      const session = {
        id: `prev_${Date.now()}`,
        projectId: ctx.projectId || null,
        title,
        html: document,
        css,
        javascript: js,
        status: "running",
        startedAt: new Date().toISOString(),
        refreshedAt: new Date().toISOString(),
        logs: [{ level: "info", message: "Preview started", at: new Date().toISOString() }],
      };
      if (ctx.projectId) previews.set(ctx.projectId, session);
      return ok(session);
    },
  }),

  defineTool({
    id: "preview.stop",
    name: "Stop Preview",
    description: "Stop the active preview session",
    category: "preview",
    version: "1.0.0",
    permissions: ["preview:write"],
    timeout: 5000,
    retries: 0,
    schema: { type: "object", properties: {}, required: [] },
    async executor(_args, ctx) {
      const session = getPreview(ctx.projectId);
      if (!session) return fail("No active preview", "NOT_FOUND");
      session.status = "stopped";
      session.logs.push({ level: "info", message: "Preview stopped", at: new Date().toISOString() });
      return ok({ id: session.id, stopped: true });
    },
  }),

  defineTool({
    id: "preview.refresh",
    name: "Refresh Preview",
    description: "Refresh preview content with optional new HTML/CSS/JS",
    category: "preview",
    version: "1.0.0",
    permissions: ["preview:write"],
    timeout: 10000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        html: { type: "string" },
        css: { type: "string" },
        javascript: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      let session = getPreview(ctx.projectId);
      if (!session) {
        return previewTools.find((t) => t.id === "preview.start").executor(args, ctx);
      }
      if (args.html != null || args.css != null || args.javascript != null) {
        const html = args.html ?? "";
        const css = args.css ?? session.css;
        const js = args.javascript ?? session.javascript;
        session.html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${session.title}</title><style>${css}</style></head><body>${html}<script>${js}</script></body></html>`;
        session.css = css;
        session.javascript = js;
      }
      session.refreshedAt = new Date().toISOString();
      session.status = "running";
      session.logs.push({ level: "info", message: "Preview refreshed", at: session.refreshedAt });
      return ok(session);
    },
  }),

  defineTool({
    id: "preview.health",
    name: "Preview Health",
    description: "Check preview session health/status",
    category: "preview",
    version: "1.0.0",
    permissions: ["preview:read"],
    timeout: 5000,
    retries: 0,
    cacheable: true,
    cacheTtlMs: 1000,
    schema: { type: "object", properties: {}, required: [] },
    async executor(_args, ctx) {
      const session = getPreview(ctx.projectId);
      if (!session) return ok({ healthy: false, status: "none" });
      return ok({
        healthy: session.status === "running",
        status: session.status,
        id: session.id,
        refreshedAt: session.refreshedAt,
      });
    },
  }),

  defineTool({
    id: "preview.logs",
    name: "Preview Logs",
    description: "Get preview session logs",
    category: "preview",
    version: "1.0.0",
    permissions: ["preview:read"],
    timeout: 5000,
    retries: 0,
    schema: {
      type: "object",
      properties: { limit: { type: "number" } },
      required: [],
    },
    async executor(args, ctx) {
      const session = getPreview(ctx.projectId);
      if (!session) return fail("No active preview", "NOT_FOUND");
      return ok({ logs: (session.logs || []).slice(-(args.limit || 50)) });
    },
  }),

  defineTool({
    id: "preview",
    name: "Preview",
    description: "Build a live HTML/CSS/JS preview payload from content",
    category: "preview",
    version: "1.0.0",
    permissions: ["preview:execute"],
    timeout: 10000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        html: { type: "string" },
        css: { type: "string" },
        javascript: { type: "string" },
        title: { type: "string" },
        action: { type: "string", enum: ["start", "stop", "refresh", "health", "logs"] },
      },
      required: [],
    },
    async executor(args, ctx) {
      const action = args.action || "start";
      const tool = previewTools.find((t) => t.id === `preview.${action}`);
      if (!tool) return fail(`Unknown preview action: ${action}`, "BAD_ACTION");
      return tool.executor(args, ctx);
    },
  }),
];

module.exports = { previewTools, previews };
