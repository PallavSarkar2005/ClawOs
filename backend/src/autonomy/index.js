const {
  engine,
  AutonomousEngine,
  createGoal,
  listGoals,
  getGoal,
  listSessions,
  getSession,
  listApprovals,
  resolveApproval,
  listDecisions,
  listArtifacts,
  getArtifact,
} = require("./engine");

const constants = require("./constants");
const masterPlanner = require("./planner/master");
const decompose = require("./planner/decompose");
const agents = require("./agents/registry");
const collaboration = require("./agents/collaboration");
const quality = require("./quality/gates");
const approval = require("./approval/gate");
const decision = require("./decision/engine");
const learning = require("./learning/store");
const artifacts = require("./artifacts/manager");
const git = require("./git/integration");
const debug = require("./debug/autodebug");
const review = require("./review/engine");
const testing = require("./testing/generator");
const improvement = require("./loops/improvement");
const runner = require("./execution/runner");
const persist = require("./session/persist");
const obsBridge = require("./bridge/observability");

module.exports = {
  engine,
  AutonomousEngine,
  createGoal,
  listGoals,
  getGoal,
  listSessions,
  getSession,
  listApprovals,
  resolveApproval,
  listDecisions,
  listArtifacts,
  getArtifact,
  ...constants,
  masterPlanner,
  decompose,
  agents,
  collaboration,
  quality,
  approval,
  decision,
  learning,
  artifacts,
  git,
  debug,
  review,
  testing,
  improvement,
  runner,
  persist,
  obsBridge,
};
