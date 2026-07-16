/**
 * Example plugin — auto-discovered from backend/plugins/
 */
const { defineTool, ok } = require("../src/tools/sdk/define-tool");

module.exports = {
  id: "example-echo",
  name: "Example Echo Plugin",
  tools: [
    defineTool({
      id: "plugin.echo",
      name: "Echo",
      description: "Echo arguments back — demonstrates the Tool SDK plugin interface",
      category: "plugin",
      version: "1.0.0",
      permissions: ["plugin:execute"],
      timeout: 5000,
      retries: 0,
      source: "plugin",
      schema: {
        type: "object",
        properties: {
          message: { type: "string" },
        },
        required: ["message"],
      },
      async executor(args) {
        return ok({ echo: args.message, at: new Date().toISOString() });
      },
    }),
  ],
};
