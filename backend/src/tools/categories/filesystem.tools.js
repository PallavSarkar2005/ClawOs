/**
 * Filesystem tools — read, write, edit, rename, delete, search, tree, diff, batch.
 */

const { defineTool, ok, fail } = require("../sdk/define-tool");
const {
  fs,
  path,
  readFile,
  writeFile,
  readdir,
  unlink,
  rename,
  access,
  resolveProjectRoot,
  resolveSafePath,
  walkTree,
  fsWorkspace,
} = require("../engine/workspace-path");

async function requireRoot(ctx) {
  const root = await resolveProjectRoot(ctx);
  if (!root) {
    const err = new Error("No project workspace available");
    err.code = "NO_WORKSPACE";
    throw err;
  }
  return root;
}

const filesystemTools = [
  defineTool({
    id: "filesystem.read",
    name: "Read File",
    description: "Read a file from the project workspace",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:read"],
    timeout: 15000,
    retries: 1,
    cacheable: true,
    cacheTtlMs: 3000,
    aliases: ["fs.read", "read_file"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Relative file path" },
        maxChars: { type: "number" },
      },
      required: ["path"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const { rel, full } = resolveSafePath(root, args.path);
        const content = await readFile(full, "utf8");
        const max = args.maxChars || 80_000;
        return ok({ path: rel, content: content.slice(0, max), bytes: content.length });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.write",
    name: "Write File",
    description: "Create or overwrite a file in the project workspace",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:write"],
    timeout: 20000,
    retries: 1,
    aliases: ["fs.write", "write_file"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const { rel, full } = resolveSafePath(root, args.path);
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, args.content ?? "", "utf8");
        if (ctx.projectId) {
          await fsWorkspace.writeFileToDisk(ctx.userId, ctx.projectId, rel, args.content ?? "");
        }
        return ok({ path: rel, written: true, bytes: String(args.content ?? "").length });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.edit",
    name: "Edit File",
    description: "Apply a search/replace edit to an existing file",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:write"],
    timeout: 20000,
    retries: 1,
    aliases: ["fs.edit", "edit_file"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        oldString: { type: "string" },
        newString: { type: "string" },
        replaceAll: { type: "boolean" },
      },
      required: ["path", "oldString", "newString"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const { rel, full } = resolveSafePath(root, args.path);
        let content = await readFile(full, "utf8");
        if (!content.includes(args.oldString)) {
          return fail("oldString not found in file", "NOT_FOUND");
        }
        const next = args.replaceAll
          ? content.split(args.oldString).join(args.newString)
          : content.replace(args.oldString, args.newString);
        await writeFile(full, next, "utf8");
        if (ctx.projectId) {
          await fsWorkspace.writeFileToDisk(ctx.userId, ctx.projectId, rel, next);
        }
        return ok({ path: rel, edited: true, bytes: next.length });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.rename",
    name: "Rename Path",
    description: "Rename or move a file/directory within the workspace",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:write"],
    timeout: 15000,
    retries: 1,
    aliases: ["fs.rename"],
    schema: {
      type: "object",
      properties: {
        from: { type: "string" },
        to: { type: "string" },
      },
      required: ["from", "to"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const src = resolveSafePath(root, args.from);
        const dst = resolveSafePath(root, args.to);
        await fs.promises.mkdir(path.dirname(dst.full), { recursive: true });
        await rename(src.full, dst.full);
        return ok({ from: src.rel, to: dst.rel, renamed: true });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.delete",
    name: "Delete Path",
    description: "Delete a file from the project workspace",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:delete"],
    timeout: 15000,
    retries: 0,
    dangerous: true,
    aliases: ["fs.delete"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const { rel, full } = resolveSafePath(root, args.path);
        await unlink(full);
        return ok({ path: rel, deleted: true });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.search",
    name: "Search Files",
    description: "Search file contents in the workspace by substring or regex",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:read"],
    timeout: 30000,
    retries: 1,
    cacheable: true,
    aliases: ["fs.search", "grep"],
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "string" },
        regex: { type: "boolean" },
        maxResults: { type: "number" },
      },
      required: ["query"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const start = resolveSafePath(root, args.path || ".");
        const tree = await walkTree(start.full, start.rel === "." ? "" : start.rel, 8);
        const files = tree.filter((t) => t.type === "file");
        const max = args.maxResults || 40;
        const matcher = args.regex
          ? new RegExp(args.query, "i")
          : null;
        const results = [];
        for (const f of files) {
          if (results.length >= max) break;
          const full = path.join(root, f.path);
          let text;
          try {
            text = await readFile(full, "utf8");
          } catch {
            continue;
          }
          if (text.length > 500_000) continue;
          const lines = text.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const hit = matcher ? matcher.test(lines[i]) : lines[i].includes(args.query);
            if (hit) {
              results.push({ path: f.path, line: i + 1, text: lines[i].slice(0, 300) });
              if (results.length >= max) break;
            }
          }
        }
        return ok({ query: args.query, count: results.length, results });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.tree",
    name: "File Tree",
    description: "List the workspace directory tree",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:read"],
    timeout: 20000,
    retries: 1,
    cacheable: true,
    aliases: ["fs.tree", "list_dir"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        maxDepth: { type: "number" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const start = resolveSafePath(root, args.path || ".");
        const entries = await walkTree(start.full, start.rel === "." ? "" : start.rel, args.maxDepth ?? 5);
        return ok({ path: start.rel, entries });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.diff",
    name: "Diff Files",
    description: "Compute a simple line diff between two files or against new content",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:read"],
    timeout: 15000,
    retries: 1,
    aliases: ["fs.diff"],
    schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        otherPath: { type: "string" },
        content: { type: "string" },
      },
      required: ["path"],
    },
    async executor(args, ctx) {
      try {
        const root = await requireRoot(ctx);
        const a = resolveSafePath(root, args.path);
        const left = (await readFile(a.full, "utf8")).split(/\r?\n/);
        let right;
        if (args.otherPath) {
          const b = resolveSafePath(root, args.otherPath);
          right = (await readFile(b.full, "utf8")).split(/\r?\n/);
        } else if (args.content != null) {
          right = String(args.content).split(/\r?\n/);
        } else {
          return fail("Provide otherPath or content", "BAD_ARGS");
        }
        const max = Math.max(left.length, right.length);
        const hunks = [];
        for (let i = 0; i < max && hunks.length < 200; i++) {
          if (left[i] !== right[i]) {
            hunks.push({ line: i + 1, before: left[i] ?? null, after: right[i] ?? null });
          }
        }
        return ok({ path: a.rel, changes: hunks.length, hunks });
      } catch (e) {
        return fail(e, e.code || "TOOL_ERROR");
      }
    },
  }),

  defineTool({
    id: "filesystem.batch",
    name: "Batch Filesystem Ops",
    description: "Run multiple filesystem operations (read/write/delete/rename) in one call",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:write", "filesystem:read"],
    timeout: 60000,
    retries: 0,
    dangerous: true,
    aliases: ["fs.batch"],
    schema: {
      type: "object",
      properties: {
        operations: {
          type: "array",
          items: { type: "object" },
        },
      },
      required: ["operations"],
    },
    async executor(args, ctx) {
      const ops = Array.isArray(args.operations) ? args.operations.slice(0, 50) : [];
      const results = [];
      for (const op of ops) {
        const action = op.action || op.op;
        let r;
        if (action === "read") r = await filesystemTools.find((t) => t.id === "filesystem.read").executor(op, ctx);
        else if (action === "write") r = await filesystemTools.find((t) => t.id === "filesystem.write").executor(op, ctx);
        else if (action === "delete") r = await filesystemTools.find((t) => t.id === "filesystem.delete").executor(op, ctx);
        else if (action === "rename") r = await filesystemTools.find((t) => t.id === "filesystem.rename").executor(op, ctx);
        else if (action === "edit") r = await filesystemTools.find((t) => t.id === "filesystem.edit").executor(op, ctx);
        else r = fail(`Unknown batch action: ${action}`, "BAD_ACTION");
        results.push({ action, ...r });
        if (!r.ok && op.stopOnError) break;
      }
      return ok({ count: results.length, results });
    },
  }),

  // Legacy composite for LLM agents still requesting "filesystem"
  defineTool({
    id: "filesystem",
    name: "Filesystem",
    description: "Read, write, list, edit, delete, search, or tree files in the project workspace",
    category: "filesystem",
    version: "1.0.0",
    permissions: ["filesystem:execute"],
    timeout: 30000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read", "write", "list", "delete", "exists", "edit", "rename", "search", "tree", "diff", "batch"],
        },
        path: { type: "string" },
        content: { type: "string" },
        oldString: { type: "string" },
        newString: { type: "string" },
        from: { type: "string" },
        to: { type: "string" },
        query: { type: "string" },
        operations: { type: "array", items: { type: "object" } },
      },
      required: ["action"],
    },
    async executor(args, ctx) {
      const map = {
        read: "filesystem.read",
        write: "filesystem.write",
        edit: "filesystem.edit",
        rename: "filesystem.rename",
        delete: "filesystem.delete",
        search: "filesystem.search",
        tree: "filesystem.tree",
        diff: "filesystem.diff",
        batch: "filesystem.batch",
      };
      if (args.action === "list") {
        return filesystemTools.find((t) => t.id === "filesystem.tree").executor({ path: args.path, maxDepth: 1 }, ctx);
      }
      if (args.action === "exists") {
        try {
          const root = await requireRoot(ctx);
          const { rel, full } = resolveSafePath(root, args.path || ".");
          try {
            await access(full);
            return ok({ path: rel, exists: true });
          } catch {
            return ok({ path: rel, exists: false });
          }
        } catch (e) {
          return fail(e, e.code || "TOOL_ERROR");
        }
      }
      const id = map[args.action];
      if (!id) return fail(`Unknown filesystem action: ${args.action}`, "BAD_ACTION");
      const tool = filesystemTools.find((t) => t.id === id);
      return tool.executor(args, ctx);
    },
  }),
];

module.exports = { filesystemTools };
