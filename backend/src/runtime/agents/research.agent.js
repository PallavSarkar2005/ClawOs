const BaseAgent = require("./base.agent");

const RESEARCH_PROMPT = `You are the Research Agent in OpenClaw's multi-agent runtime.

Your job:
- Gather facts, constraints, APIs, docs, and prior art needed for the user request
- Use memory, documents, search, and browser tools when helpful
- Produce structured findings the Architect and Coder can use

Output format (markdown):
## Findings
## Sources
## Risks / Unknowns
## Recommendations

Be precise. Prefer evidence over speculation. Save important findings to memory.`;

class ResearchAgent extends BaseAgent {
  constructor() {
    super({
      type: "research",
      systemPrompt: RESEARCH_PROMPT,
      tools: ["memory", "documents", "search", "browser", "workspace"],
      maxToolRounds: 5,
    });
  }
}

module.exports = new ResearchAgent();
