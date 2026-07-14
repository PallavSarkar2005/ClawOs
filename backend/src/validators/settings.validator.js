const { z } = require("zod");

const appearanceSchema = z.object({
  theme: z.enum(["light", "dark", "system"]).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  layout: z.enum(["comfortable", "compact"]).optional(),
  sidebarCollapsed: z.boolean().optional(),
  fontSize: z.enum(["small", "medium", "large"]).optional(),
}).passthrough();

const notificationsSchema = z.object({
  emailNotifications: z.boolean().optional(),
  aiTaskNotifications: z.boolean().optional(),
  workflowCompletion: z.boolean().optional(),
  securityAlerts: z.boolean().optional(),
  marketingEmails: z.boolean().optional(),
}).passthrough();

const updateSettingsSchema = z.object({
  defaultProvider: z.enum(["openrouter", "groq", "ollama", "openai", "anthropic"]).optional(),
  defaultModel: z.string().min(1).max(200).optional(),
  temperature: z.coerce.number().min(0).max(2).optional(),
  maxContext: z.coerce.number().int().min(1).max(200).optional(),
  maxTokens: z.coerce.number().int().min(256).max(128000).optional(),
  autoMemorySave: z.boolean().optional(),
  autoSkillRouting: z.boolean().optional(),
  webSearchDefault: z.boolean().optional(),
  streamingEnabled: z.boolean().optional(),
  appearance: appearanceSchema.optional(),
  notifications: notificationsSchema.optional(),
});

const connectIntegrationSchema = z.object({
  provider: z.enum(["openrouter", "openai", "anthropic", "groq", "github"]),
  apiKey: z.string().min(8, "API key is too short").max(500),
});

module.exports = {
  updateSettingsSchema,
  connectIntegrationSchema,
};
