const { engine, initObservability } = require("./engine");
const coordinatorBridge = require("./bridge/coordinator");
const workflowBridge = require("./bridge/workflow");
const toolsBridge = require("./bridge/tools");
const llmBridge = require("./bridge/llm");
const contextBridge = require("./bridge/context");
const knowledgeBridge = require("./bridge/knowledge");
const intelligenceBridge = require("./bridge/intelligence");

module.exports = {
  engine,
  initObservability,
  coordinatorBridge,
  workflowBridge,
  toolsBridge,
  llmBridge,
  contextBridge,
  knowledgeBridge,
  intelligenceBridge,
  // re-exports for convenience
  ...require("./engine"),
};
