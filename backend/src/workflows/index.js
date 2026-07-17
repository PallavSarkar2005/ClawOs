const constants = require("./constants");
const expression = require("./expression/engine");
const { VariableStore } = require("./variables/store");
const dag = require("./dag/graph");
const runtime = require("./engine/runtime");
const stateMachine = require("./engine/state-machine");
const { ConcurrencyController, WorkerPool } = require("./engine/concurrency");
const { validateDefinition } = require("./validation/validator");
const { runSandboxed } = require("./security/sandbox");
const { executeNode } = require("./nodes/handlers");
const scheduler = require("./scheduler");
const triggers = require("./triggers/manager");
const templates = require("./templates/catalog");
const persist = require("./memory/persist");
const service = require("./service");

async function initWorkflowEngine() {
  scheduler.startWorkflowScheduler();
  await service.seedBuiltinTemplates().catch((e) => {
    console.warn("[workflows] seed templates:", e.message);
  });
  return { ok: true };
}

module.exports = {
  ...constants,
  expression,
  VariableStore,
  ...dag,
  runtime,
  ...stateMachine,
  ConcurrencyController,
  WorkerPool,
  validateDefinition,
  runSandboxed,
  executeNode,
  scheduler,
  triggers,
  templates,
  persist,
  service,
  initWorkflowEngine,
};
