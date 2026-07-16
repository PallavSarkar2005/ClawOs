/**
 * Memory tools — search, store, update, delete, graph, collections.
 */

const { defineTool, ok, fail } = require("../sdk/define-tool");
const { memoryService, retrievalEngine } = require("../../memory");
const prisma = require("../../database/prisma");

const memoryTools = [
  defineTool({
    id: "memory.search",
    name: "Search Memory",
    description: "Hybrid search over agent and user memories",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:read"],
    timeout: 20000,
    retries: 1,
    cacheable: true,
    cacheTtlMs: 3000,
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        topK: { type: "number" },
      },
      required: ["query"],
    },
    async executor(args, ctx) {
      try {
        const result = await retrievalEngine.hybridSearch(ctx.userId, args.query || "", {
          topK: args.topK || 8,
          includeChunks: false,
        });
        const results = (result.results || []).map((m) => ({
          id: m.id,
          content: m.content,
          score: m.score,
          scope: m.scope,
        }));
        ctx.emit?.("tool_progress", {
          tool: "memory.search",
          message: `Retrieved ${results.length} memories`,
          count: results.length,
        });
        return ok({ results, count: results.length });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "memory.store",
    name: "Store Memory",
    description: "Save a new memory for the agent/user",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:write"],
    timeout: 15000,
    retries: 1,
    aliases: ["memory.save"],
    schema: {
      type: "object",
      properties: {
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        importance: { type: "number" },
        collectionId: { type: "string" },
      },
      required: ["content"],
    },
    async executor(args, ctx) {
      try {
        const mem = await memoryService.create(ctx.userId, {
          content: args.content,
          scope: "AGENT",
          conversationId: ctx.conversationId || null,
          projectId: ctx.projectId || null,
          agentType: ctx.agentType || null,
          source: "agent-runtime",
          importance: args.importance ?? 0.6,
          tags: ["agent", ctx.agentType, ...(args.tags || [])].filter(Boolean),
          collectionId: args.collectionId || null,
        });
        return ok({ id: mem.id, saved: true });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "memory.update",
    name: "Update Memory",
    description: "Update an existing memory's content or metadata",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:write"],
    timeout: 15000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        content: { type: "string" },
        importance: { type: "number" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["id"],
    },
    async executor(args, ctx) {
      try {
        if (typeof memoryService.update === "function") {
          const mem = await memoryService.update(ctx.userId, args.id, {
            content: args.content,
            importance: args.importance,
            tags: args.tags,
          });
          return ok({ id: mem.id, updated: true });
        }
        const existing = await prisma.memory.findFirst({
          where: { id: args.id, ownerId: ctx.userId, deletedAt: null },
        });
        if (!existing) return fail("Memory not found", "NOT_FOUND");
        const mem = await prisma.memory.update({
          where: { id: args.id },
          data: {
            content: args.content ?? existing.content,
            importance: args.importance ?? existing.importance,
            tags: args.tags ?? existing.tags,
            version: { increment: 1 },
          },
        });
        return ok({ id: mem.id, updated: true });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "memory.delete",
    name: "Delete Memory",
    description: "Soft-delete a memory",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:delete"],
    timeout: 10000,
    retries: 0,
    dangerous: true,
    schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
    async executor(args, ctx) {
      try {
        if (typeof memoryService.remove === "function") {
          await memoryService.remove(ctx.userId, args.id);
          return ok({ id: args.id, deleted: true });
        }
        await prisma.memory.updateMany({
          where: { id: args.id, ownerId: ctx.userId },
          data: { deletedAt: new Date() },
        });
        return ok({ id: args.id, deleted: true });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "memory.graph",
    name: "Memory Graph",
    description: "Get related memories via graph edges",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:read"],
    timeout: 15000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        memoryId: { type: "string" },
        limit: { type: "number" },
      },
      required: ["memoryId"],
    },
    async executor(args, ctx) {
      try {
        const edges = await prisma.memoryEdge.findMany({
          where: {
            ownerId: ctx.userId,
            OR: [{ fromId: args.memoryId }, { toId: args.memoryId }],
          },
          take: args.limit || 50,
        });
        return ok({ memoryId: args.memoryId, edges });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "memory.collections",
    name: "Memory Collections",
    description: "List or create memory collections",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:read", "memory:write"],
    timeout: 15000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "create"] },
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      try {
        if (args.action === "list") {
          const collections = await prisma.memoryCollection.findMany({
            where: { ownerId: ctx.userId },
            orderBy: { updatedAt: "desc" },
            take: 50,
          });
          return ok({ collections });
        }
        if (args.action === "create") {
          if (!args.name) return fail("name required", "BAD_ARGS");
          const col = await prisma.memoryCollection.create({
            data: {
              name: args.name,
              description: args.description || null,
              ownerId: ctx.userId,
            },
          });
          return ok({ collection: col });
        }
        return fail(`Unknown action: ${args.action}`, "BAD_ACTION");
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "memory",
    name: "Memory",
    description: "Search or save agent memories",
    category: "memory",
    version: "1.0.0",
    permissions: ["memory:read", "memory:write"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["search", "save", "store", "update", "delete", "graph", "collections"],
        },
        query: { type: "string" },
        content: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        importance: { type: "number" },
        id: { type: "string" },
        memoryId: { type: "string" },
        name: { type: "string" },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      const action = args.action === "save" ? "store" : args.action;
      const map = {
        search: "memory.search",
        store: "memory.store",
        update: "memory.update",
        delete: "memory.delete",
        graph: "memory.graph",
        collections: "memory.collections",
      };
      const id = map[action];
      if (!id) return fail(`Unknown memory action: ${args.action}`, "BAD_ACTION");
      const tool = memoryTools.find((t) => t.id === id);
      return tool.executor(args, ctx);
    },
  }),
];

module.exports = { memoryTools };
