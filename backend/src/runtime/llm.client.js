const axios = require("axios");
const AI_CONFIG = require("../config/ai.config");
const { estimateTokens } = require("./token");

function getOpenRouter() {
  return require("../services/openrouter");
}

function getGroq() {
  return require("../services/groq");
}

function resolveProvider(settings = {}) {
  try {
    const { getCurrentProvider } = require("../controllers/ai.controller");
    return getCurrentProvider() || settings.defaultProvider || "openrouter";
  } catch {
    return settings.defaultProvider || "openrouter";
  }
}

function resolveModel(provider, settings = {}) {
  if (settings.defaultModel) return settings.defaultModel;
  if (provider === "groq") return AI_CONFIG.groq.model;
  if (provider === "ollama") return AI_CONFIG.ollama.model;
  return AI_CONFIG.openrouter.model;
}

/**
 * Unified LLM client with structured tool calling + optional streaming callbacks.
 */
async function chat({
  messages,
  tools = null,
  toolChoice = "auto",
  settings = {},
  temperature,
  maxTokens,
  signal,
  onToken,
}) {
  const provider = resolveProvider(settings);
  const model = resolveModel(provider, settings);
  const temp = temperature ?? settings.temperature ?? 0.7;
  const max_tokens = maxTokens ?? settings.maxTokens ?? 4096;

  if (provider === "ollama") {
    return chatOllama({ messages, model, temp, max_tokens, signal, onToken });
  }

  const client = provider === "groq" ? getGroq() : getOpenRouter();
  const payload = {
    model,
    messages,
    temperature: temp,
    max_tokens,
  };

  if (tools?.length) {
    payload.tools = tools;
    payload.tool_choice = toolChoice;
  }

  const stream = typeof onToken === "function";

  if (stream) {
    const response = await client.chat.completions.create({
      ...payload,
      stream: true,
    });

    let content = "";
    const toolCalls = new Map();
    let finishReason = null;
    let promptTokens = estimateTokens(JSON.stringify(messages));
    let completionTokens = 0;

    for await (const chunk of response) {
      if (signal?.aborted) {
        const err = new Error("Aborted");
        err.code = "ABORT";
        throw err;
      }
      const choice = chunk.choices?.[0];
      if (!choice) continue;
      finishReason = choice.finish_reason || finishReason;
      const delta = choice.delta || {};

      if (delta.content) {
        content += delta.content;
        completionTokens += estimateTokens(delta.content);
        onToken(delta.content);
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, {
              id: tc.id || `call_${idx}`,
              type: "function",
              function: { name: "", arguments: "" },
            });
          }
          const entry = toolCalls.get(idx);
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.function.name += tc.function.name;
          if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
        }
      }

      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens ?? promptTokens;
        completionTokens = chunk.usage.completion_tokens ?? completionTokens;
      }
    }

    const tool_calls = [...toolCalls.values()].filter((t) => t.function.name);
    return {
      content,
      tool_calls: tool_calls.length ? tool_calls : null,
      finish_reason: finishReason || (tool_calls.length ? "tool_calls" : "stop"),
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      provider,
      model,
    };
  }

  const response = await client.chat.completions.create(payload);
  const message = response.choices?.[0]?.message || {};
  const usage = response.usage || {
    prompt_tokens: estimateTokens(JSON.stringify(messages)),
    completion_tokens: estimateTokens(message.content || ""),
    total_tokens: 0,
  };
  usage.total_tokens =
    usage.total_tokens ||
    (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);

  return {
    content: message.content || "",
    tool_calls: message.tool_calls || null,
    finish_reason: response.choices?.[0]?.finish_reason || "stop",
    usage,
    provider,
    model,
  };
}

async function chatOllama({ messages, model, temp, max_tokens, signal, onToken }) {
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const prompt = messages
    .filter((m) => m.role !== "system")
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const body = {
    model: model || AI_CONFIG.ollama.model,
    prompt: `${system}\n\n${prompt}`,
    stream: Boolean(onToken),
    options: { temperature: temp, num_predict: max_tokens },
  };

  if (onToken) {
    const response = await axios.post(`${AI_CONFIG.ollama.baseUrl}/api/generate`, body, {
      responseType: "stream",
      signal,
      timeout: 180000,
    });

    let content = "";
    await new Promise((resolve, reject) => {
      let buffer = "";
      response.data.on("data", (chunk) => {
        if (signal?.aborted) {
          response.data.destroy();
          return reject(Object.assign(new Error("Aborted"), { code: "ABORT" }));
        }
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const json = JSON.parse(line);
            if (json.response) {
              content += json.response;
              onToken(json.response);
            }
            if (json.done) resolve();
          } catch {
            /* ignore partial */
          }
        }
      });
      response.data.on("end", resolve);
      response.data.on("error", reject);
    });

    return {
      content,
      tool_calls: null,
      finish_reason: "stop",
      usage: {
        prompt_tokens: estimateTokens(body.prompt),
        completion_tokens: estimateTokens(content),
        total_tokens: estimateTokens(body.prompt) + estimateTokens(content),
      },
      provider: "ollama",
      model: body.model,
    };
  }

  const response = await axios.post(`${AI_CONFIG.ollama.baseUrl}/api/generate`, body, {
    signal,
    timeout: 180000,
  });
  const content = response.data?.response || "";
  return {
    content,
    tool_calls: null,
    finish_reason: "stop",
    usage: {
      prompt_tokens: estimateTokens(body.prompt),
      completion_tokens: estimateTokens(content),
      total_tokens: estimateTokens(body.prompt) + estimateTokens(content),
    },
    provider: "ollama",
    model: body.model,
  };
}

const { wrapChat } = require("../observability/bridge/llm");

module.exports = {
  chat: wrapChat(chat),
  resolveProvider,
  resolveModel,
  chatRaw: chat,
};
