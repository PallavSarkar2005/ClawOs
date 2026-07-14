const axios = require("axios");
const prisma = require("../database/prisma");
const { connectIntegrationSchema } = require("../validators/settings.validator");
const { encrypt, decrypt, maskKey, keyHint } = require("../services/crypto.service");

const PROVIDERS = ["openrouter", "openai", "anthropic", "groq", "github"];

function toPublic(integration) {
  return {
    provider: integration.provider,
    status: integration.status,
    keyHint: integration.keyHint,
    maskedKey: maskKey(`xxxx${integration.keyHint || "****"}`),
    lastTestedAt: integration.lastTestedAt,
    connectedAt: integration.createdAt,
  };
}

async function listIntegrations(req, res) {
  try {
    const rows = await prisma.integration.findMany({ where: { userId: req.user.id } });
    const map = {};
    for (const provider of PROVIDERS) {
      map[provider] = { status: "disconnected", keyHint: null, maskedKey: null, lastTestedAt: null };
    }
    for (const row of rows) {
      map[row.provider] = toPublic(row);
    }
    res.json(map);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to load integrations" });
  }
}

async function testProviderKey(provider, apiKey) {
  if (provider === "openrouter") {
    const res = await axios.get("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 12000,
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }

  if (provider === "openai") {
    const res = await axios.get("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 12000,
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }

  if (provider === "anthropic") {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-haiku-20240307",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      },
      {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        timeout: 12000,
        validateStatus: () => true,
      },
    );
    // 200 = ok, 400 = key accepted but request invalid shape — both prove key works
    return res.status === 200 || res.status === 400;
  }

  if (provider === "groq") {
    const res = await axios.get("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 12000,
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }

  if (provider === "github") {
    const res = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "ClawOs",
      },
      timeout: 12000,
      validateStatus: () => true,
    });
    return res.status >= 200 && res.status < 300;
  }

  return false;
}

async function connectIntegration(req, res) {
  try {
    const parsed = connectIntegrationSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: parsed.error.issues?.[0]?.message || parsed.error.errors?.[0]?.message || "Invalid integration payload",
      });
    }

    const { provider, apiKey } = parsed.data;
    const ok = await testProviderKey(provider, apiKey);
    if (!ok) {
      return res.status(400).json({ message: `Failed to verify ${provider} API key` });
    }

    const encrypted = encrypt(apiKey);
    const integration = await prisma.integration.upsert({
      where: {
        userId_provider: {
          userId: req.user.id,
          provider,
        },
      },
      update: {
        apiKeyEncrypted: encrypted,
        keyHint: keyHint(apiKey),
        status: "connected",
        lastTestedAt: new Date(),
      },
      create: {
        userId: req.user.id,
        provider,
        apiKeyEncrypted: encrypted,
        keyHint: keyHint(apiKey),
        status: "connected",
        lastTestedAt: new Date(),
      },
    });

    res.json({
      success: true,
      message: `${provider} connected`,
      integration: toPublic(integration),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to connect integration" });
  }
}

async function disconnectIntegration(req, res) {
  try {
    const provider = req.params.provider;
    if (!PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: "Invalid provider" });
    }

    await prisma.integration.deleteMany({
      where: { userId: req.user.id, provider },
    });

    res.json({ success: true, message: `${provider} disconnected` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to disconnect integration" });
  }
}

async function testIntegration(req, res) {
  try {
    const provider = req.params.provider;
    if (!PROVIDERS.includes(provider)) {
      return res.status(400).json({ message: "Invalid provider" });
    }

    const integration = await prisma.integration.findUnique({
      where: {
        userId_provider: {
          userId: req.user.id,
          provider,
        },
      },
    });

    if (!integration) {
      return res.status(404).json({ message: "Integration not connected" });
    }

    const apiKey = decrypt(integration.apiKeyEncrypted);
    const ok = await testProviderKey(provider, apiKey);

    const updated = await prisma.integration.update({
      where: { id: integration.id },
      data: {
        status: ok ? "connected" : "error",
        lastTestedAt: new Date(),
      },
    });

    if (!ok) {
      return res.status(400).json({
        success: false,
        message: `${provider} connection test failed`,
        integration: toPublic(updated),
      });
    }

    res.json({
      success: true,
      message: `${provider} connection verified`,
      integration: toPublic(updated),
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Connection test failed" });
  }
}

module.exports = {
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
  testIntegration,
};
