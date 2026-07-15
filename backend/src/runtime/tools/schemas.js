const TOOL_SCHEMAS = [
  {
    type: "function",
    function: {
      name: "filesystem",
      description: "Read, write, list, or delete files in the project workspace",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["read", "write", "list", "delete", "exists"],
          },
          path: { type: "string", description: "Relative file path" },
          content: { type: "string", description: "Content for write" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "terminal",
      description: "Run a shell command in the project workspace (sandboxed)",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string" },
          timeoutMs: { type: "number" },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git",
      description: "Run git operations: status, diff, log, commit, branch",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["status", "diff", "log", "commit", "branch", "add"],
          },
          message: { type: "string" },
          paths: { type: "array", items: { type: "string" } },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "memory",
      description: "Search or save agent memories",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["search", "save"] },
          query: { type: "string" },
          content: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          importance: { type: "number" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "documents",
      description: "Search uploaded documents for relevant passages",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          documentId: { type: "string" },
          topK: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace",
      description: "Inspect project files and metadata from the database workspace",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list_files", "get_file", "project_info", "list_diffs"],
          },
          path: { type: "string" },
          fileId: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search",
      description: "Search the web for up-to-date information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          maxResults: { type: "number" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "browser",
      description: "Fetch and extract readable content from a URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string" },
          maxChars: { type: "number" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "preview",
      description: "Build a live HTML/CSS/JS preview payload from content",
      parameters: {
        type: "object",
        properties: {
          html: { type: "string" },
          css: { type: "string" },
          javascript: { type: "string" },
          title: { type: "string" },
        },
      },
    },
  },
];

function getToolSchemas(names) {
  if (!names || names === "all") return TOOL_SCHEMAS;
  const set = new Set(names);
  return TOOL_SCHEMAS.filter((t) => set.has(t.function.name));
}

module.exports = { TOOL_SCHEMAS, getToolSchemas };
