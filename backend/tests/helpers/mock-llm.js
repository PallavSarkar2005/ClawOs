/**
 * Deterministic mock LLM provider.
 * Intercepts runtime/llm.client and embedding calls when OPENCLAW_MOCK_LLM=true.
 */
"use strict";

const Module = require("module");

const state = {
  calls: [],
  responses: [],
  defaultContent: "Mock LLM response for integration testing.",
  toolCalls: null,
  failNext: false,
  timeoutNext: false,
  latencyMs: 5,
};

function resetMockLlm() {
  state.calls = [];
  state.responses = [];
  state.defaultContent = "Mock LLM response for integration testing.";
  state.toolCalls = null;
  state.failNext = false;
  state.timeoutNext = false;
  state.latencyMs = 5;
}

function queueResponse(content, extra = {}) {
  state.responses.push({ content, ...extra });
}

function setDefaultContent(content) {
  state.defaultContent = content;
}

function setNextToolCalls(toolCalls) {
  state.toolCalls = toolCalls;
}

function failNextCall(message = "Mock LLM failure") {
  state.failNext = message;
}

function timeoutNextCall() {
  state.timeoutNext = true;
}

function fakeEmbedding(text, dims = 384) {
  const str = String(text || "");
  const out = new Array(dims).fill(0);
  for (let i = 0; i < str.length; i += 1) {
    out[i % dims] += (str.charCodeAt(i) % 31) / 31;
  }
  const norm = Math.sqrt(out.reduce((s, v) => s + v * v, 0)) || 1;
  return out.map((v) => v / norm);
}

async function mockChat(args = {}) {
  state.calls.push({ ...args, at: Date.now() });

  if (state.timeoutNext) {
    state.timeoutNext = false;
    const err = new Error("LLM timeout");
    err.code = "ETIMEDOUT";
    throw err;
  }
  if (state.failNext) {
    const msg = state.failNext;
    state.failNext = false;
    throw new Error(msg);
  }

  await new Promise((r) => setTimeout(r, state.latencyMs));

  const queued = state.responses.shift();
  const content = queued?.content ?? state.defaultContent;
  const toolCalls = queued?.toolCalls ?? state.toolCalls;
  state.toolCalls = null;

  if (typeof args.onToken === "function") {
    for (const ch of String(content)) {
      args.onToken(ch);
    }
  }

  return {
    content,
    tool_calls: toolCalls || undefined,
    finish_reason: toolCalls ? "tool_calls" : "stop",
    usage: {
      prompt_tokens: 42,
      completion_tokens: Math.max(1, Math.ceil(String(content).length / 4)),
      total_tokens: 42 + Math.max(1, Math.ceil(String(content).length / 4)),
    },
    model: "mock-llm",
    provider: "mock",
  };
}

function installMockLlm() {
  if (process.env.OPENCLAW_MOCK_LLM !== "true") return;

  const llmPath = require.resolve("../../src/runtime/llm.client");
  const mockExports = {
    chat: mockChat,
    resolveProvider: () => "mock",
    resolveModel: () => "mock-llm",
    estimateCost: () => 0,
  };
  require.cache[llmPath] = {
    id: llmPath,
    filename: llmPath,
    loaded: true,
    exports: mockExports,
  };

  // Force local embeddings for deterministic tests
  try {
    const embPath = require.resolve("../../src/memory/services/embedding.service");
    const emb = require(embPath);
    if (emb && typeof emb.embedBatch === "function") {
      emb.embedBatch = async (texts) =>
        (texts || []).map((t) => fakeEmbedding(t, 1536));
    }
    if (emb && typeof emb.embedOne === "function") {
      emb.embedOne = async (text) => fakeEmbedding(text, 1536);
    }
  } catch {
    // optional
  }
}

function getMockLlmState() {
  return state;
}

module.exports = {
  installMockLlm,
  resetMockLlm,
  queueResponse,
  setDefaultContent,
  setNextToolCalls,
  failNextCall,
  timeoutNextCall,
  fakeEmbedding,
  mockChat,
  getMockLlmState,
};
