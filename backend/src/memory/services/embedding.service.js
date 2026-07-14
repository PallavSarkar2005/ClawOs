const axios = require("axios");
const prisma = require("../../database/prisma");
const { decrypt } = require("../../services/crypto.service");
const { normalizeVector } = require("../utils");

const DEFAULT_DIM = 1536;

async function resolveApiKey(userId, provider) {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider: { userId, provider } },
  });
  if (integration?.apiKeyEncrypted) {
    try {
      return decrypt(integration.apiKeyEncrypted);
    } catch {
      return null;
    }
  }

  const envMap = {
    openai: process.env.OPENAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    gemini: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
    ollama: process.env.OLLAMA_API_KEY || "ollama",
  };
  return envMap[provider] || null;
}

async function resolveConfig(userId) {
  const settings = userId
    ? await prisma.setting.findUnique({ where: { userId } })
    : null;

  const provider = settings?.embeddingProvider || process.env.EMBEDDING_PROVIDER || "openrouter";
  const model =
    settings?.embeddingModel ||
    process.env.EMBEDDING_MODEL ||
    (provider === "openai"
      ? "text-embedding-3-small"
      : provider === "gemini"
        ? "text-embedding-004"
        : provider === "ollama"
          ? "nomic-embed-text"
          : "openai/text-embedding-3-small");

  const apiKey = await resolveApiKey(userId, provider);
  return { provider, model, apiKey };
}

class OpenAICompatibleProvider {
  constructor(baseURL, headers = {}) {
    this.baseURL = baseURL;
    this.headers = headers;
  }

  async embed(texts, { model, apiKey }) {
    const res = await axios.post(
      `${this.baseURL}/embeddings`,
      { model, input: texts },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...this.headers,
        },
        timeout: 120000,
      },
    );
    const data = res.data?.data || [];
    return data
      .sort((a, b) => a.index - b.index)
      .map((d) => normalizeVector(d.embedding));
  }
}

class GeminiProvider {
  async embed(texts, { model, apiKey }) {
    const vectors = [];
    for (const text of texts) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;
      const res = await axios.post(
        url,
        { content: { parts: [{ text }] } },
        { timeout: 60000 },
      );
      const values = res.data?.embedding?.values || [];
      vectors.push(normalizeVector(values));
    }
    return vectors;
  }
}

class OllamaProvider {
  async embed(texts, { model }) {
    const base = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
    const vectors = [];
    for (const text of texts) {
      const res = await axios.post(
        `${base}/api/embeddings`,
        { model, prompt: text },
        { timeout: 120000 },
      );
      vectors.push(normalizeVector(res.data?.embedding || []));
    }
    return vectors;
  }
}

/** Deterministic local fallback so indexing never silently fakes progress. */
function localHashEmbedding(text, dim = DEFAULT_DIM) {
  const vec = new Array(dim).fill(0);
  const s = String(text || "");
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    const idx = (code * (i + 1) * 2654435761) % dim;
    vec[idx] += ((code % 97) / 97) * (i % 2 === 0 ? 1 : -1);
  }
  // trigrams for more semantic-ish local signal
  for (let i = 0; i < s.length - 2; i += 1) {
    const tri = s.slice(i, i + 3).toLowerCase();
    let h = 0;
    for (let j = 0; j < tri.length; j += 1) h = (h * 31 + tri.charCodeAt(j)) >>> 0;
    vec[h % dim] += 0.35;
  }
  return normalizeVector(vec);
}

function getProvider(name) {
  switch (name) {
    case "openai":
      return new OpenAICompatibleProvider("https://api.openai.com/v1");
    case "openrouter":
      return new OpenAICompatibleProvider("https://openrouter.ai/api/v1", {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:5173",
        "X-Title": "ClawOS Memory",
      });
    case "gemini":
      return new GeminiProvider();
    case "ollama":
      return new OllamaProvider();
    default:
      return null;
  }
}

class EmbeddingService {
  async embedBatch(texts, { userId, provider: forceProvider, model: forceModel } = {}) {
    const cleaned = (texts || []).map((t) => String(t || "").slice(0, 8000));
    if (!cleaned.length) return [];

    const cfg = await resolveConfig(userId);
    const provider = forceProvider || cfg.provider;
    const model = forceModel || cfg.model;
    const apiKey = cfg.apiKey;

    if (provider === "local" || !apiKey) {
      return cleaned.map((t) => localHashEmbedding(t));
    }

    const impl = getProvider(provider);
    if (!impl) {
      return cleaned.map((t) => localHashEmbedding(t));
    }

    try {
      const BATCH = 16;
      const out = [];
      for (let i = 0; i < cleaned.length; i += BATCH) {
        const slice = cleaned.slice(i, i + BATCH);
        const vectors = await impl.embed(slice, { model, apiKey });
        out.push(...vectors);
      }
      return out.map((v) => (v?.length ? v : localHashEmbedding("fallback")));
    } catch (err) {
      console.error("[EmbeddingService] provider failed, using local fallback:", err.message);
      return cleaned.map((t) => localHashEmbedding(t));
    }
  }

  async embedOne(text, opts = {}) {
    const [vec] = await this.embedBatch([text], opts);
    return vec;
  }

  async embedIfChanged(text, existingHash, existingEmbedding, contentHash, opts = {}) {
    if (existingHash && existingHash === contentHash && Array.isArray(existingEmbedding) && existingEmbedding.length) {
      return { embedding: existingEmbedding, skipped: true };
    }
    const embedding = await this.embedOne(text, opts);
    return { embedding, skipped: false };
  }
}

module.exports = new EmbeddingService();
module.exports.localHashEmbedding = localHashEmbedding;
module.exports.resolveConfig = resolveConfig;
