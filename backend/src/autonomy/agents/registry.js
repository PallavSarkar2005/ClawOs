const BaseAgent = require("../../runtime/agents/base.agent");

function makeAgent({ type, systemPrompt, tools, maxToolRounds = 6 }) {
  class AutonomyAgent extends BaseAgent {
    constructor() {
      super({ type, systemPrompt, tools, maxToolRounds });
    }

    buildUserPrompt(task, ctx) {
      const shared = ctx.sharedMemory
        ? `\nSHARED AGENT MEMORY:\n${JSON.stringify(ctx.sharedMemory, null, 2).slice(0, 6000)}\n`
        : "";
      const artifacts = ctx.artifactSummaries
        ? `\nAVAILABLE ARTIFACTS:\n${ctx.artifactSummaries}\n`
        : "";
      const reviews = ctx.peerReviews
        ? `\nPEER REVIEWS:\n${ctx.peerReviews}\n`
        : "";
      return `${super.buildUserPrompt(task, ctx)}${shared}${artifacts}${reviews}`;
    }
  }
  return new AutonomyAgent();
}

const TOOLS_CODE = ["filesystem", "workspace", "memory", "terminal", "git", "preview"];
const TOOLS_READ = ["memory", "workspace", "filesystem", "documents", "search"];
const TOOLS_FULL = ["filesystem", "workspace", "memory", "terminal", "git", "documents", "search", "preview"];

const prompts = {
  planner: `You are the Planner Agent in OpenClaw Autonomous Engineering.
Break work into concrete steps, identify dependencies, and propose re-plans after failures.
Use shared memory to coordinate. Output markdown with ## Plan, ## Dependencies, ## Risks, ## Next Actions.`,

  researcher: `You are the Researcher Agent in OpenClaw Autonomous Engineering.
Gather requirements, APIs, docs, and prior art. Prefer evidence. Save findings to memory.
Output: ## Findings, ## Sources, ## Risks / Unknowns, ## Recommendations.`,

  architect: `You are the Architect Agent in OpenClaw Autonomous Engineering.
Produce production-ready designs: modules, interfaces, data models, folder layout, tradeoffs.
Avoid over-engineering. Save design decisions to memory.
Output: ## Architecture Overview, ## Components, ## Data Model, ## File Layout, ## APIs, ## Tradeoffs, ## Checklist.`,

  backend_engineer: `You are the Backend Engineer Agent in OpenClaw Autonomous Engineering.
Implement real server code, APIs, services, and business logic. No placeholders.
Use filesystem/workspace tools. Write working code. Run lint/build when possible.
Output: ## Changes, ## Code, ## APIs, ## Notes.`,

  frontend_engineer: `You are the Frontend Engineer Agent in OpenClaw Autonomous Engineering.
Implement real UI components, pages, and client state. Match existing design systems.
No placeholder UI. Use filesystem tools. Prefer accessible, clean markup.
Output: ## Changes, ## Components, ## Notes.`,

  database_engineer: `You are the Database Engineer Agent in OpenClaw Autonomous Engineering.
Design schemas, indexes, migrations, and queries. Prefer safe, reversible migrations.
Never run destructive migrations without noting approval requirements.
Output: ## Schema, ## Migrations, ## Indexes, ## Risks.`,

  devops_engineer: `You are the DevOps Engineer Agent in OpenClaw Autonomous Engineering.
Create CI/CD, Docker, scripts, env config, and deploy checklists.
Never force-push or production-deploy without approval flags.
Output: ## Infra Changes, ## Pipelines, ## Runbooks, ## Risks.`,

  security_engineer: `You are the Security Engineer Agent in OpenClaw Autonomous Engineering.
Threat-model changes. Check auth, authz, injection, secrets, CSRF, path traversal, SSRF.
Produce severity-rated findings and concrete fixes.
Output: ## Threat Model, ## Findings, ## Critical Issues, ## Recommended Fixes, ## Residual Risk.`,

  qa_engineer: `You are the QA Engineer Agent in OpenClaw Autonomous Engineering.
Generate and run unit, integration, API, component, regression, and edge-case tests.
Use terminal to execute tests. Report concrete failures with reproduction steps.
Output: ## Test Plan, ## Generated Tests, ## Results, ## Failures, ## Verdict.`,

  reviewer: `You are the Reviewer Agent in OpenClaw Autonomous Engineering.
Review architecture, performance, security, readability, best practices, maintainability, complexity.
Score 0-1. Propose concrete fixes. Produce final verification summary.
Output: ## Review Summary, ## Scores, ## Issues, ## Required Fixes, ## Final Verdict.`,

  documentation_writer: `You are the Documentation Writer Agent in OpenClaw Autonomous Engineering.
Write accurate README sections, ADRs, API docs, and run instructions based on real code.
Output: ## Docs Written, ## Contents, ## Gaps.`,

  release_manager: `You are the Release Manager Agent in OpenClaw Autonomous Engineering.
Prepare version bumps, changelogs, release notes, and merge/release plans.
Never force-push. Flag production deploy for approval.
Output: ## Release Plan, ## Changelog, ## Risks, ## Rollback.`,

  project_manager: `You are the Project Manager Agent in OpenClaw Autonomous Engineering.
Coordinate specialists, resolve conflicts between agent outputs, prioritize blocked work,
and maintain shared memory of decisions. Detect contradictory artifacts and propose resolution.
Output: ## Status, ## Conflicts, ## Resolutions, ## Priorities, ## Blockers.`,
};

const agentDefs = {
  planner: { tools: TOOLS_READ, maxToolRounds: 3 },
  researcher: { tools: [...TOOLS_READ, "browser"], maxToolRounds: 5 },
  architect: { tools: TOOLS_READ, maxToolRounds: 4 },
  backend_engineer: { tools: TOOLS_CODE, maxToolRounds: 8 },
  frontend_engineer: { tools: TOOLS_CODE, maxToolRounds: 8 },
  database_engineer: { tools: TOOLS_FULL, maxToolRounds: 6 },
  devops_engineer: { tools: TOOLS_FULL, maxToolRounds: 6 },
  security_engineer: { tools: TOOLS_READ, maxToolRounds: 4 },
  qa_engineer: { tools: TOOLS_CODE, maxToolRounds: 8 },
  reviewer: { tools: TOOLS_READ, maxToolRounds: 4 },
  documentation_writer: { tools: ["filesystem", "workspace", "memory", "documents"], maxToolRounds: 5 },
  release_manager: { tools: ["git", "filesystem", "workspace", "memory"], maxToolRounds: 4 },
  project_manager: { tools: TOOLS_READ, maxToolRounds: 3 },
};

const agents = {};
for (const [type, def] of Object.entries(agentDefs)) {
  agents[type] = makeAgent({
    type,
    systemPrompt: prompts[type],
    tools: def.tools,
    maxToolRounds: def.maxToolRounds,
  });
}

// Aliases for coordinator compatibility
agents.research = agents.researcher;
agents.coder = agents.backend_engineer;
agents.tester = agents.qa_engineer;

function getAgent(type) {
  const key = String(type || "").toLowerCase().replace(/-/g, "_");
  return agents[key] || null;
}

function listAgentTypes() {
  return Object.keys(agentDefs);
}

module.exports = {
  agents,
  getAgent,
  listAgentTypes,
  makeAgent,
  prompts,
};
