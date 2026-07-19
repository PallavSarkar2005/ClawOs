/**
 * Shared fixtures for integration and E2E tests.
 */
"use strict";

const SAMPLE_DOC_TEXT = `
# OpenClaw Knowledge Base

OpenClaw is an autonomous software engineering platform.

## Features
- Multi-agent runtime with coordinator, planner, and specialized agents
- Context engine with ranking, compression, and token budgeting
- Knowledge engine with hybrid retrieval and citations
- Workflow engine with DAG scheduling and approvals
- Tool platform spanning filesystem, git, terminal, and MCP

## Security
OpenClaw enforces path sandboxing, command blocking, JWT session validation,
and rate limiting across all API surfaces.
`.trim();

const SAMPLE_GOAL = "Add a health check endpoint that returns { status: 'ok' }";

const PARALLEL_WORKFLOW = {
  nodes: [
    { id: "start", type: "start", data: { label: "Start" } },
    {
      id: "a",
      type: "transform",
      data: { label: "A", expression: "{{inputs.x}} + 1" },
    },
    {
      id: "b",
      type: "transform",
      data: { label: "B", expression: "{{inputs.x}} + 2" },
    },
    {
      id: "join",
      type: "transform",
      data: { label: "Join", expression: "{{nodes.a}} + {{nodes.b}}" },
    },
    { id: "end", type: "end", data: { label: "End" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "a" },
    { id: "e2", source: "start", target: "b" },
    { id: "e3", source: "a", target: "join" },
    { id: "e4", source: "b", target: "join" },
    { id: "e5", source: "join", target: "end" },
  ],
};

const CONDITIONAL_WORKFLOW = {
  nodes: [
    { id: "start", type: "start", data: { label: "Start" } },
    {
      id: "cond",
      type: "condition",
      data: { label: "If", expression: "{{inputs.flag}} === true" },
    },
    {
      id: "yes",
      type: "transform",
      data: { label: "Yes", expression: "'yes'" },
    },
    {
      id: "no",
      type: "transform",
      data: { label: "No", expression: "'no'" },
    },
    { id: "end", type: "end", data: { label: "End" } },
  ],
  edges: [
    { id: "e1", source: "start", target: "cond" },
    { id: "e2", source: "cond", target: "yes", data: { condition: "true" } },
    { id: "e3", source: "cond", target: "no", data: { condition: "false" } },
    { id: "e4", source: "yes", target: "end" },
    { id: "e5", source: "no", target: "end" },
  ],
};

module.exports = {
  SAMPLE_DOC_TEXT,
  SAMPLE_GOAL,
  PARALLEL_WORKFLOW,
  CONDITIONAL_WORKFLOW,
  strongPassword: "TestPass1!",
  weakPassword: "password",
};
