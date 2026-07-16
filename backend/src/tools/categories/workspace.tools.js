/**
 * Workspace tools — projects, files, tabs, layout, search.
 */

const { defineTool, ok, fail } = require("../sdk/define-tool");
const prisma = require("../../database/prisma");

const workspaceState = new Map(); // projectId → { tabs, layout }

function getState(projectId) {
  if (!workspaceState.has(projectId)) {
    workspaceState.set(projectId, { tabs: [], layout: { sidebar: true, terminal: true, preview: false } });
  }
  return workspaceState.get(projectId);
}

const workspaceTools = [
  defineTool({
    id: "workspace.projects",
    name: "List Projects",
    description: "List user projects or get current project info",
    category: "workspace",
    version: "1.0.0",
    permissions: ["workspace:read"],
    timeout: 15000,
    retries: 1,
    cacheable: true,
    schema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        limit: { type: "number" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        if (args.projectId || ctx.projectId) {
          const id = args.projectId || ctx.projectId;
          const project = await prisma.project.findFirst({
            where: { id, userId: ctx.userId },
            include: { files: { select: { id: true } } },
          });
          if (!project) return fail("Project not found", "NOT_FOUND");
          return ok({
            id: project.id,
            name: project.name,
            framework: project.framework,
            status: project.status,
            fileCount: project.files.length,
          });
        }
        const projects = await prisma.project.findMany({
          where: { userId: ctx.userId },
          orderBy: { updatedAt: "desc" },
          take: args.limit || 20,
          select: { id: true, name: true, framework: true, status: true, updatedAt: true },
        });
        return ok({ projects });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "workspace.files",
    name: "Workspace Files",
    description: "List or get project files from the database workspace",
    category: "workspace",
    version: "1.0.0",
    permissions: ["workspace:read"],
    timeout: 15000,
    retries: 1,
    aliases: ["workspace.get_file", "workspace.list_files"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        fileId: { type: "string" },
        action: { type: "string", enum: ["list", "get"] },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        if (!ctx.projectId) return fail("No projectId", "NO_PROJECT");
        const project = await prisma.project.findFirst({
          where: { id: ctx.projectId, userId: ctx.userId },
          include: { files: { orderBy: { path: "asc" } } },
        });
        if (!project) return fail("Project not found", "NOT_FOUND");
        if (args.fileId || args.path || args.action === "get") {
          const file = project.files.find(
            (f) => f.id === args.fileId || f.path === args.path || f.name === args.path,
          );
          if (!file) return fail("File not found", "NOT_FOUND");
          return ok({
            id: file.id,
            path: file.path,
            name: file.name,
            content: (file.content || "").slice(0, 80_000),
          });
        }
        return ok({
          files: project.files.map((f) => ({
            id: f.id,
            name: f.name,
            path: f.path,
            isFolder: f.isFolder,
            size: (f.content || "").length,
          })),
        });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "workspace.tabs",
    name: "Workspace Tabs",
    description: "Get or update open editor tabs for the project",
    category: "workspace",
    version: "1.0.0",
    permissions: ["workspace:write"],
    timeout: 5000,
    retries: 0,
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "open", "close", "focus"] },
        path: { type: "string" },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      if (!ctx.projectId) return fail("No projectId", "NO_PROJECT");
      const state = getState(ctx.projectId);
      if (args.action === "list") return ok({ tabs: state.tabs });
      if (args.action === "open" && args.path) {
        if (!state.tabs.find((t) => t.path === args.path)) {
          state.tabs.push({ path: args.path, active: true });
        }
        state.tabs = state.tabs.map((t) => ({ ...t, active: t.path === args.path }));
        return ok({ tabs: state.tabs });
      }
      if (args.action === "close" && args.path) {
        state.tabs = state.tabs.filter((t) => t.path !== args.path);
        return ok({ tabs: state.tabs });
      }
      if (args.action === "focus" && args.path) {
        state.tabs = state.tabs.map((t) => ({ ...t, active: t.path === args.path }));
        return ok({ tabs: state.tabs });
      }
      return fail(`Unknown tabs action: ${args.action}`, "BAD_ACTION");
    },
  }),

  defineTool({
    id: "workspace.layout",
    name: "Workspace Layout",
    description: "Get or set IDE layout flags (sidebar, terminal, preview)",
    category: "workspace",
    version: "1.0.0",
    permissions: ["workspace:write"],
    timeout: 5000,
    retries: 0,
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["get", "set"] },
        layout: { type: "object" },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      if (!ctx.projectId) return fail("No projectId", "NO_PROJECT");
      const state = getState(ctx.projectId);
      if (args.action === "get") return ok({ layout: state.layout });
      if (args.action === "set" && args.layout) {
        state.layout = { ...state.layout, ...args.layout };
        return ok({ layout: state.layout });
      }
      return fail("Invalid layout action", "BAD_ACTION");
    },
  }),

  defineTool({
    id: "workspace.search",
    name: "Workspace Search",
    description: "Search project file names and contents in the database workspace",
    category: "workspace",
    version: "1.0.0",
    permissions: ["workspace:read"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
    async executor(args, ctx) {
      try {
        if (!ctx.projectId) return fail("No projectId", "NO_PROJECT");
        const project = await prisma.project.findFirst({
          where: { id: ctx.projectId, userId: ctx.userId },
          include: { files: true },
        });
        if (!project) return fail("Project not found", "NOT_FOUND");
        const q = String(args.query || "").toLowerCase();
        const max = args.maxResults || 30;
        const results = [];
        for (const f of project.files) {
          if (results.length >= max) break;
          if ((f.path || "").toLowerCase().includes(q) || (f.name || "").toLowerCase().includes(q)) {
            results.push({ path: f.path, match: "name" });
            continue;
          }
          if ((f.content || "").toLowerCase().includes(q)) {
            results.push({ path: f.path, match: "content" });
          }
        }
        return ok({ query: args.query, count: results.length, results });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "workspace",
    name: "Workspace",
    description: "Inspect project files and metadata from the database workspace",
    category: "workspace",
    version: "1.0.0",
    permissions: ["workspace:read"],
    timeout: 15000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["list_files", "get_file", "project_info", "list_diffs", "search", "tabs", "layout"],
        },
        path: { type: "string" },
        fileId: { type: "string" },
        query: { type: "string" },
        layout: { type: "object" },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      try {
        if (args.action === "project_info") {
          return workspaceTools.find((t) => t.id === "workspace.projects").executor(args, ctx);
        }
        if (args.action === "list_files" || args.action === "get_file") {
          return workspaceTools
            .find((t) => t.id === "workspace.files")
            .executor({ ...args, action: args.action === "get_file" ? "get" : "list" }, ctx);
        }
        if (args.action === "search") {
          return workspaceTools.find((t) => t.id === "workspace.search").executor(args, ctx);
        }
        if (args.action === "tabs") {
          return workspaceTools.find((t) => t.id === "workspace.tabs").executor({ action: "list" }, ctx);
        }
        if (args.action === "layout") {
          return workspaceTools.find((t) => t.id === "workspace.layout").executor({ action: "get", ...args }, ctx);
        }
        if (args.action === "list_diffs") {
          if (!ctx.projectId) return fail("No projectId", "NO_PROJECT");
          const project = await prisma.project.findFirst({
            where: { id: ctx.projectId, userId: ctx.userId },
            include: { diffs: { orderBy: { createdAt: "desc" }, take: 20 } },
          });
          if (!project) return fail("Project not found", "NOT_FOUND");
          return ok({
            diffs: project.diffs.map((d) => ({
              id: d.id,
              filePath: d.filePath,
              status: d.status,
              reason: d.reason,
            })),
          });
        }
        return fail(`Unknown workspace action: ${args.action}`, "BAD_ACTION");
      } catch (e) {
        return fail(e);
      }
    },
  }),
];

module.exports = { workspaceTools };
