/**
 * Task decomposition — convert goals like "Build an authentication system"
 * into a research → … → verification pipeline automatically.
 */

const { AUTONOMY_AGENTS, PHASES, COMPLEXITY_MS } = require("../constants");

const PIPELINE = [
  {
    phase: PHASES.RESEARCH,
    agent: AUTONOMY_AGENTS.RESEARCHER,
    title: "Research",
    description: (g) =>
      `Research requirements, constraints, existing patterns, and libraries for: ${g}`,
    outputs: ["findings", "constraints"],
  },
  {
    phase: PHASES.ARCHITECTURE,
    agent: AUTONOMY_AGENTS.ARCHITECT,
    title: "Architecture",
    description: (g) =>
      `Design system architecture, modules, interfaces, and data flow for: ${g}`,
    outputs: ["architecture", "interfaces"],
  },
  {
    phase: PHASES.DATABASE,
    agent: AUTONOMY_AGENTS.DATABASE,
    title: "Database",
    description: (g) =>
      `Design schema, indexes, and migrations needed for: ${g}`,
    outputs: ["schema", "migrations"],
  },
  {
    phase: PHASES.BACKEND,
    agent: AUTONOMY_AGENTS.BACKEND,
    title: "Backend",
    description: (g) =>
      `Implement backend services, APIs, and business logic for: ${g}`,
    outputs: ["api", "services"],
  },
  {
    phase: PHASES.FRONTEND,
    agent: AUTONOMY_AGENTS.FRONTEND,
    title: "Frontend",
    description: (g) =>
      `Implement UI, forms, client state, and UX flows for: ${g}`,
    outputs: ["ui", "components"],
  },
  {
    phase: PHASES.TESTING,
    agent: AUTONOMY_AGENTS.QA,
    title: "Testing",
    description: (g) =>
      `Generate and run unit, integration, API, and edge-case tests for: ${g}`,
    outputs: ["tests", "test-report"],
  },
  {
    phase: PHASES.SECURITY_REVIEW,
    agent: AUTONOMY_AGENTS.SECURITY,
    title: "Security Review",
    description: (g) =>
      `Threat-model and review security for: ${g}. Check auth, input validation, secrets, and access control.`,
    outputs: ["security-report"],
  },
  {
    phase: PHASES.DOCUMENTATION,
    agent: AUTONOMY_AGENTS.DOCUMENTATION,
    title: "Documentation",
    description: (g) =>
      `Write documentation, README updates, and ADRs for: ${g}`,
    outputs: ["docs"],
  },
  {
    phase: PHASES.DEPLOYMENT,
    agent: AUTONOMY_AGENTS.DEVOPS,
    title: "Deployment",
    description: (g) =>
      `Prepare deploy scripts, env config, and release checklist for: ${g}`,
    outputs: ["deploy-plan"],
  },
  {
    phase: PHASES.VERIFICATION,
    agent: AUTONOMY_AGENTS.REVIEWER,
    title: "Verification",
    description: (g) =>
      `Verify end-to-end quality gates (build, tests, review, security) for: ${g}`,
    outputs: ["verification", "final-report"],
  },
];

function detectSkipPhases(goal) {
  const t = String(goal || "").toLowerCase();
  const skip = new Set();

  const wantsUi =
    /\b(ui|frontend|react|vue|svelte|component|page|dashboard|form|css)\b/.test(t);
  const wantsDb =
    /\b(database|schema|prisma|sql|postgres|mongo|migration|model|orm)\b/.test(t);
  const wantsApi =
    /\b(api|backend|server|endpoint|service|auth|authentication|rest|graphql)\b/.test(t);
  const wantsDeploy =
    /\b(deploy|ci|cd|docker|kubernetes|infra|devops|release)\b/.test(t);
  const docsOnly = /\b(document|readme|docs only|write docs)\b/.test(t) && !wantsApi && !wantsUi;
  const fixOnly = /\b(fix|bug|error|lint|typo)\b/.test(t) && !/\bbuild\b.*\bsystem\b/.test(t);

  // Full-stack / system goals keep the full pipeline
  const fullSystem =
    /\b(system|platform|application|app|authentication|auth system|full.?stack)\b/.test(t);

  if (docsOnly) {
    return new Set([
      PHASES.DATABASE,
      PHASES.BACKEND,
      PHASES.FRONTEND,
      PHASES.DEPLOYMENT,
    ]);
  }

  if (fixOnly) {
    return new Set([
      PHASES.RESEARCH,
      PHASES.ARCHITECTURE,
      PHASES.DATABASE,
      PHASES.DOCUMENTATION,
      PHASES.DEPLOYMENT,
    ]);
  }

  if (!fullSystem) {
    if (!wantsUi && !/\b(web|client|spa)\b/.test(t)) skip.add(PHASES.FRONTEND);
    if (!wantsDb && !fullSystem) {
      // keep DB for auth-like goals
      if (!/\b(user|account|session|login|signup|credential)\b/.test(t)) {
        skip.add(PHASES.DATABASE);
      }
    }
    if (!wantsApi && wantsUi && !wantsDb) {
      // frontend-only
      skip.add(PHASES.DATABASE);
      skip.add(PHASES.BACKEND);
    }
    if (!wantsDeploy) skip.add(PHASES.DEPLOYMENT);
  }

  return skip;
}

function decomposeGoal(goalText) {
  const goal = String(goalText || "software goal").trim();
  const skip = detectSkipPhases(goal);
  const stages = PIPELINE.filter((s) => !skip.has(s.phase));

  const milestones = stages.map((s, i) => ({
    id: `m${i + 1}`,
    title: s.title,
    phase: s.phase,
    priority: 100 - i * 5,
    estimatedMs: COMPLEXITY_MS.medium,
  }));

  const tasks = stages.map((s, i) => {
    const id = `t${i + 1}`;
    const prev = i > 0 ? `t${i}` : null;
    return {
      id,
      milestoneId: milestones[i].id,
      title: s.title,
      description: s.description(goal),
      agent: s.agent,
      dependsOn: prev ? [prev] : [],
      priority: 100 - i * 5,
      complexity: "medium",
      estimatedMs: COMPLEXITY_MS.medium,
      expectedOutputs: s.outputs,
    };
  });

  // Project manager oversight task (parallel after architecture when enough work)
  if (tasks.length >= 4) {
    const arch = tasks.find((t) => t.title === "Architecture");
    tasks.push({
      id: "t_pm",
      milestoneId: milestones[1]?.id || milestones[0].id,
      title: "Project Coordination",
      description: `Coordinate agents, resolve conflicts, and track progress for: ${goal}`,
      agent: AUTONOMY_AGENTS.PROJECT_MANAGER,
      dependsOn: arch ? [arch.id] : [],
      priority: 70,
      complexity: "low",
      estimatedMs: COMPLEXITY_MS.low,
      expectedOutputs: ["coordination-notes"],
    });
  }

  return {
    intent: goal.slice(0, 200),
    strategy: "Automatic software delivery pipeline decomposition",
    successCriteria: [
      "Build succeeds",
      "Tests pass",
      "No critical security issues",
      "Review score above threshold",
    ],
    milestones,
    tasks,
  };
}

module.exports = {
  PIPELINE,
  decomposeGoal,
  detectSkipPhases,
};
