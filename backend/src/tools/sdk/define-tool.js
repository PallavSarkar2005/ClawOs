/**
 * Tool SDK — single interface for defining production tools.
 *
 * Every tool exposes: id, name, description, schema, permissions,
 * timeout, retries, version, category, validator, executor.
 */

const { z } = require("zod");

function ok(data = {}) {
  return { ok: true, ...data };
}

function fail(error, code = "TOOL_ERROR", details = undefined) {
  const out = { ok: false, error: String(error?.message || error), code };
  if (details !== undefined) out.details = details;
  return out;
}

/**
 * @typedef {object} ToolDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} category
 * @property {string} [version]
 * @property {string[]} [permissions]
 * @property {number} [timeout]
 * @property {number} [retries]
 * @property {object} schema - JSON Schema for arguments
 * @property {(args: object, ctx: object) => object|null|void} [validator]
 * @property {(args: object, ctx: object) => Promise<object>} executor
 * @property {boolean} [cacheable]
 * @property {number} [cacheTtlMs]
 * @property {string[]} [aliases]
 * @property {boolean} [dangerous]
 * @property {string} [source] - builtin | plugin | mcp
 */

/**
 * Validate and normalize a tool definition.
 * @param {ToolDefinition} def
 * @returns {ToolDefinition}
 */
function defineTool(def) {
  if (!def || typeof def !== "object") {
    throw new Error("defineTool requires a definition object");
  }
  if (!def.id || typeof def.id !== "string") {
    throw new Error("Tool id is required");
  }
  if (!def.name) throw new Error(`Tool ${def.id}: name is required`);
  if (!def.description) throw new Error(`Tool ${def.id}: description is required`);
  if (!def.category) throw new Error(`Tool ${def.id}: category is required`);
  if (!def.schema || typeof def.schema !== "object") {
    throw new Error(`Tool ${def.id}: JSON schema is required`);
  }
  if (typeof def.executor !== "function") {
    throw new Error(`Tool ${def.id}: executor function is required`);
  }

  const tool = {
    id: def.id,
    name: def.name,
    description: def.description,
    category: def.category,
    version: def.version || "1.0.0",
    permissions: Array.isArray(def.permissions) ? def.permissions : [`${def.category}:execute`],
    timeout: def.timeout ?? 30_000,
    retries: def.retries ?? 1,
    schema: def.schema,
    validator: typeof def.validator === "function" ? def.validator : null,
    executor: def.executor,
    cacheable: Boolean(def.cacheable),
    cacheTtlMs: def.cacheTtlMs ?? 5_000,
    aliases: def.aliases || [],
    dangerous: Boolean(def.dangerous),
    source: def.source || "builtin",
    pluginId: def.pluginId || null,
    mcpServerId: def.mcpServerId || null,
    enabled: def.enabled !== false,
    metadata: def.metadata || {},
  };

  return Object.freeze(tool);
}

/**
 * Convert a tool definition to OpenAI function-calling schema.
 */
function toOpenAiSchema(tool) {
  return {
    type: "function",
    function: {
      name: tool.id.replace(/\./g, "_"),
      description: `[${tool.category}] ${tool.description}`,
      parameters: {
        type: "object",
        ...tool.schema,
        properties: tool.schema.properties || {},
        required: tool.schema.required || [],
        additionalProperties: tool.schema.additionalProperties ?? false,
      },
    },
  };
}

/**
 * Map OpenAI function name back to tool id (underscores → dots).
 */
function fromOpenAiName(name) {
  if (!name) return name;
  // Prefer exact match; otherwise convert underscores used in schemas
  return String(name);
}

/**
 * Lightweight JSON-schema style validation (required + types).
 */
function validateAgainstSchema(schema, args) {
  const errors = [];
  const props = schema.properties || {};
  const required = schema.required || [];

  for (const key of required) {
    if (args[key] === undefined || args[key] === null) {
      errors.push(`Missing required argument: ${key}`);
    }
  }

  for (const [key, value] of Object.entries(args || {})) {
    const prop = props[key];
    if (!prop) continue;
    if (value === undefined || value === null) continue;
    if (prop.enum && !prop.enum.includes(value)) {
      errors.push(`${key} must be one of: ${prop.enum.join(", ")}`);
    }
    if (prop.type === "string" && typeof value !== "string") {
      errors.push(`${key} must be a string`);
    }
    if (prop.type === "number" && typeof value !== "number") {
      errors.push(`${key} must be a number`);
    }
    if (prop.type === "boolean" && typeof value !== "boolean") {
      errors.push(`${key} must be a boolean`);
    }
    if (prop.type === "array" && !Array.isArray(value)) {
      errors.push(`${key} must be an array`);
    }
    if (prop.type === "object" && (typeof value !== "object" || Array.isArray(value))) {
      errors.push(`${key} must be an object`);
    }
  }

  return errors;
}

module.exports = {
  defineTool,
  toOpenAiSchema,
  fromOpenAiName,
  validateAgainstSchema,
  ok,
  fail,
  z,
};
