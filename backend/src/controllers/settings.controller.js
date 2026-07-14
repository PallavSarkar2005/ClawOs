const prisma = require("../database/prisma");
const { updateSettingsSchema } = require("../validators/settings.validator");
const { maskKey } = require("../services/crypto.service");

const DEFAULT_APPEARANCE = {
  theme: "dark",
  accentColor: "#F15B42",
  layout: "comfortable",
  sidebarCollapsed: false,
  fontSize: "medium",
};

const DEFAULT_NOTIFICATIONS = {
  emailNotifications: true,
  aiTaskNotifications: true,
  workflowCompletion: true,
  securityAlerts: true,
  marketingEmails: false,
};

function parseJson(value, fallback) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback };
  }
  return { ...fallback, ...value };
}

function formatSettings(settings, integrations = []) {
  const integrationMap = {
    openrouter: { status: "disconnected", keyHint: null, maskedKey: null, lastTestedAt: null },
    openai: { status: "disconnected", keyHint: null, maskedKey: null, lastTestedAt: null },
    anthropic: { status: "disconnected", keyHint: null, maskedKey: null, lastTestedAt: null },
    groq: { status: "disconnected", keyHint: null, maskedKey: null, lastTestedAt: null },
    github: { status: "disconnected", keyHint: null, maskedKey: null, lastTestedAt: null },
  };

  for (const item of integrations) {
    integrationMap[item.provider] = {
      status: item.status || "connected",
      keyHint: item.keyHint,
      maskedKey: item.keyHint ? `****${item.keyHint}` : null,
      lastTestedAt: item.lastTestedAt,
      connectedAt: item.createdAt,
    };
  }

  return {
    id: settings.id,
    userId: settings.userId,
    defaultProvider: settings.defaultProvider,
    defaultModel: settings.defaultModel,
    temperature: settings.temperature,
    maxContext: settings.maxContext,
    maxTokens: settings.maxTokens,
    autoMemorySave: settings.autoMemorySave,
    autoSkillRouting: settings.autoSkillRouting,
    webSearchDefault: settings.webSearchDefault,
    streamingEnabled: settings.streamingEnabled,
    appearance: parseJson(settings.appearance, DEFAULT_APPEARANCE),
    notifications: parseJson(settings.notifications, DEFAULT_NOTIFICATIONS),
    integrations: integrationMap,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
  };
}

async function ensureSettings(userId) {
  let settings = await prisma.setting.findUnique({ where: { userId } });
  if (!settings) {
    settings = await prisma.setting.create({ data: { userId } });
  }
  return settings;
}

async function getSettings(req, res) {
  try {
    const settings = await ensureSettings(req.user.id);
    const integrations = await prisma.integration.findMany({
      where: { userId: req.user.id },
    });
    res.json(formatSettings(settings, integrations));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
}

async function updateSettings(req, res) {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message || parsed.error.errors?.[0]?.message || "Invalid settings payload";
      return res.status(400).json({
        message: msg,
        errors: parsed.error.format?.() || parsed.error,
      });
    }

    const data = parsed.data;
    const existing = await ensureSettings(req.user.id);

    const updateData = {};
    const scalarFields = [
      "defaultProvider",
      "defaultModel",
      "temperature",
      "maxContext",
      "maxTokens",
      "autoMemorySave",
      "autoSkillRouting",
      "webSearchDefault",
      "streamingEnabled",
    ];

    for (const field of scalarFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    if (data.appearance) {
      updateData.appearance = {
        ...parseJson(existing.appearance, DEFAULT_APPEARANCE),
        ...data.appearance,
      };
    }

    if (data.notifications) {
      updateData.notifications = {
        ...parseJson(existing.notifications, DEFAULT_NOTIFICATIONS),
        ...data.notifications,
      };
    }

    if (Object.keys(updateData).length === 0) {
      const integrations = await prisma.integration.findMany({
        where: { userId: req.user.id },
      });
      return res.json(formatSettings(existing, integrations));
    }

    const settings = await prisma.setting.update({
      where: { userId: req.user.id },
      data: updateData,
    });

    const integrations = await prisma.integration.findMany({
      where: { userId: req.user.id },
    });

    res.json(formatSettings(settings, integrations));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
}

module.exports = {
  getSettings,
  updateSettings,
  ensureSettings,
  formatSettings,
  DEFAULT_APPEARANCE,
  DEFAULT_NOTIFICATIONS,
  maskKey,
};
