/**
 * MCP client — discover and adapt external MCP server tools.
 * Supports stdio JSON-RPC MCP servers via child_process.
 */

const { spawn } = require("child_process");
const { EventEmitter } = require("events");
const { defineTool, ok, fail } = require("../sdk/define-tool");
const { registry } = require("../engine/registry");

class McpClient extends EventEmitter {
  constructor(config) {
    super();
    this.id = config.id || config.name || `mcp_${Date.now()}`;
    this.name = config.name || this.id;
    this.command = config.command;
    this.args = config.args || [];
    this.env = { ...process.env, ...(config.env || {}) };
    this.cwd = config.cwd;
    this.proc = null;
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.tools = [];
    this.connected = false;
  }

  async connect() {
    if (!this.command) throw new Error("MCP command required");
    this.proc = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    this.proc.stdout.on("data", (chunk) => this._onData(chunk.toString()));
    this.proc.stderr.on("data", (chunk) => {
      this.emit("stderr", chunk.toString());
    });
    this.proc.on("exit", (code) => {
      this.connected = false;
      this.emit("exit", code);
      for (const [, p] of this.pending) {
        p.reject(new Error("MCP process exited"));
      }
      this.pending.clear();
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "OpenClaw", version: "1.0.0" },
    });
    await this.notify("notifications/initialized", {});
    this.connected = true;
    return this;
  }

  _onData(text) {
    this.buffer += text;
    let idx;
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || "MCP error"));
          else resolve(msg.result);
        } else {
          this.emit("message", msg);
        }
      } catch {
        /* ignore partial/non-json */
      }
    }
  }

  request(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.proc.stdin.write(payload);
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  notify(method, params) {
    const payload = JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
    this.proc.stdin.write(payload);
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    this.tools = result?.tools || [];
    return this.tools;
  }

  async callTool(name, args) {
    const result = await this.request("tools/call", { name, arguments: args || {} }, 60000);
    return result;
  }

  async disconnect() {
    try {
      this.proc?.kill();
    } catch {
      /* ignore */
    }
    this.connected = false;
  }
}

/** @type {Map<string, McpClient>} */
const servers = new Map();

/**
 * Register MCP server tools into the global registry.
 */
async function connectMcpServer(config) {
  const client = new McpClient(config);
  await client.connect();
  const tools = await client.listTools();
  const registered = [];

  for (const t of tools) {
    const toolId = `mcp.${client.id}.${t.name}`.replace(/[^a-zA-Z0-9._-]/g, "_");
    const def = defineTool({
      id: toolId,
      name: t.name,
      description: t.description || `MCP tool ${t.name} from ${client.name}`,
      category: "mcp",
      version: "1.0.0",
      permissions: ["mcp:execute"],
      timeout: 60000,
      retries: 1,
      source: "mcp",
      mcpServerId: client.id,
      schema: t.inputSchema || { type: "object", properties: {}, required: [] },
      async executor(args) {
        try {
          const result = await client.callTool(t.name, args);
          const content = result?.content;
          return ok({
            mcp: true,
            server: client.id,
            tool: t.name,
            content,
            isError: Boolean(result?.isError),
          });
        } catch (e) {
          return fail(e);
        }
      },
    });
    registry.register(def);
    registered.push(toolId);
  }

  servers.set(client.id, client);
  return { id: client.id, name: client.name, tools: registered, count: registered.length };
}

async function disconnectMcpServer(id) {
  const client = servers.get(id);
  if (!client) return false;
  registry.unregisterBySource("mcp", null);
  // Only remove tools for this server
  for (const tool of registry.list({ source: "mcp", enabledOnly: false })) {
    if (tool.mcpServerId === id) registry.unregister(tool.id);
  }
  await client.disconnect();
  servers.delete(id);
  return true;
}

function listMcpServers() {
  return [...servers.values()].map((s) => ({
    id: s.id,
    name: s.name,
    connected: s.connected,
    toolCount: s.tools.length,
  }));
}

/**
 * Discover MCP servers from env OPENCLAW_MCP_SERVERS (JSON array).
 */
async function autoDiscoverFromEnv() {
  const raw = process.env.OPENCLAW_MCP_SERVERS;
  if (!raw) return [];
  let configs;
  try {
    configs = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(configs)) return [];
  const results = [];
  for (const cfg of configs) {
    try {
      results.push(await connectMcpServer(cfg));
    } catch (e) {
      results.push({ id: cfg.id || cfg.name, error: e.message });
    }
  }
  return results;
}

module.exports = {
  McpClient,
  connectMcpServer,
  disconnectMcpServer,
  listMcpServers,
  autoDiscoverFromEnv,
  servers,
};
