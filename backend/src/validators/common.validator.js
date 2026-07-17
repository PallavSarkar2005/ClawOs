const { z } = require("zod");

const idParam = z.object({
  id: z.string().min(1, "id is required"),
});

const conversationIdParam = z.object({
  conversationId: z.string().min(1, "conversationId is required"),
});

const projectIdParam = z.object({
  projectId: z.string().min(1, "projectId is required"),
});

const sessionIdParam = z.object({
  sessionId: z.string().min(1, "sessionId is required"),
});

const createConversationSchema = z.object({
  title: z.string().max(200).optional(),
}).passthrough();

const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  message: z.string().min(1).max(100000),
  skillId: z.string().optional().nullable(),
  workflowId: z.string().optional().nullable(),
  documentId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  model: z.string().max(120).optional().nullable(),
  webSearchEnabled: z.boolean().optional(),
}).passthrough();

const createSkillSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().default(""),
  prompt: z.string().min(1).max(50000),
  enabled: z.boolean().optional(),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional().default(""),
  prompt: z.string().max(100000).optional().default(""),
  definition: z.any().optional(),
  enabled: z.boolean().optional(),
  status: z.string().max(40).optional(),
  projectId: z.string().optional().nullable(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  variables: z.record(z.string(), z.any()).optional(),
}).passthrough();

const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(5000).optional().nullable(),
  template: z.string().max(80).optional().nullable(),
}).passthrough();

const updateProjectSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(5000).optional().nullable(),
  status: z.string().max(40).optional(),
}).passthrough();

const filePathSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((p) => !p.includes("\0") && !p.includes(".."), {
    message: "Invalid file path",
  });

const createFileSchema = z.object({
  name: z.string().min(1).max(255),
  path: filePathSchema.optional(),
  content: z.string().max(5_000_000).optional(),
  isFolder: z.boolean().optional(),
  parentId: z.string().optional().nullable(),
}).passthrough();

const updateFileSchema = z.object({
  content: z.string().max(5_000_000).optional(),
  name: z.string().min(1).max(255).optional(),
}).passthrough();

const runCommandSchema = z.object({
  command: z.string().max(500).optional().nullable(),
}).passthrough();

const gitCommitSchema = z.object({
  message: z.string().min(1).max(2000),
});

const gitStageSchema = z.object({
  paths: z.array(z.string().max(500)).max(500).optional().default([]),
});

const gitCheckoutSchema = z.object({
  branch: z.string().min(1).max(120).regex(/^[a-zA-Z0-9._\/-]+$/, "Invalid branch name"),
  create: z.boolean().optional(),
});

const gitRemoteSchema = z.object({
  remote: z.string().max(120).optional(),
  branch: z.string().max(120).optional(),
}).passthrough();

const memoryCreateSchema = z.object({
  content: z.string().min(1).max(100000),
  scope: z.string().max(40).optional(),
  tags: z.array(z.string().max(80)).max(50).optional(),
  importance: z.number().min(0).max(1).optional(),
}).passthrough();

const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().max(500).optional(),
}).passthrough();

module.exports = {
  idParam,
  conversationIdParam,
  projectIdParam,
  sessionIdParam,
  createConversationSchema,
  sendMessageSchema,
  createSkillSchema,
  createWorkflowSchema,
  createProjectSchema,
  updateProjectSchema,
  createFileSchema,
  updateFileSchema,
  runCommandSchema,
  gitCommitSchema,
  gitStageSchema,
  gitCheckoutSchema,
  gitRemoteSchema,
  memoryCreateSchema,
  paginationQuery,
  filePathSchema,
};
