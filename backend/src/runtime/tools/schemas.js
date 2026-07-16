/**
 * Legacy schemas facade — schemas now come from the Tool Registry.
 */
const { getToolSchemas, registry } = require("../../tools");

function getLegacySchemas() {
  return getToolSchemas("all");
}

module.exports = {
  get TOOL_SCHEMAS() {
    return getLegacySchemas();
  },
  getToolSchemas,
  registry,
};
