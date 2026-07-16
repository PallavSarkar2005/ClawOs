/**
 * Runtime tools facade — delegates to the production Tool Platform.
 * Maintains backward-compatible exports for agents.
 */

const platform = require("../../tools");

// Ensure builtins are registered on first require
platform.registerBuiltins();

module.exports = {
  executeTool: platform.executeTool,
  executeParallel: platform.executeParallel,
  listTools: platform.listTools,
  getToolSchemas: platform.getToolSchemas,
  registry: platform.registry,
  cancelExecution: platform.cancelExecution,
  handlers: new Proxy(
    {},
    {
      get(_t, name) {
        return (args, ctx) => platform.executeTool(String(name), args, ctx);
      },
    },
  ),
};
