/**
 * Factories for creating domain entities in the test database.
 */
"use strict";

const { randomUUID } = require("crypto");
const bcrypt = require("bcryptjs");

function getPrisma() {
  return require("../setup/database").getPrisma();
}

async function createUser(overrides = {}) {
  const id = overrides.id || randomUUID();
  const email = overrides.email || `user-${id.slice(0, 8)}@test.openclaw.local`;
  const password = overrides.password || "TestPass1!";
  const passwordHash =
    overrides.passwordHash || (await bcrypt.hash(password, 10));

  const user = await getPrisma().user.create({
    data: {
      id,
      name: overrides.name || "Test User",
      email,
      passwordHash,
      role: overrides.role || "user",
      emailVerified: overrides.emailVerified !== false,
      isActive: overrides.isActive !== false,
    },
  });

  return { ...user, password };
}

async function createAdmin(overrides = {}) {
  return createUser({ ...overrides, role: "admin" });
}

async function createProject(userId, overrides = {}) {
  return getPrisma().project.create({
    data: {
      userId,
      name: overrides.name || `Project ${randomUUID().slice(0, 6)}`,
      description: overrides.description || "Integration test project",
      framework: overrides.framework || "javascript",
      status: overrides.status || "idle",
    },
  });
}

async function createConversation(userId, overrides = {}) {
  return getPrisma().conversation.create({
    data: {
      userId,
      title: overrides.title || "Test Conversation",
    },
  });
}

async function createMemory(ownerId, overrides = {}) {
  return getPrisma().memory.create({
    data: {
      ownerId,
      content: overrides.content || "Remember that OpenClaw prefers integration tests.",
      scope: overrides.scope || "USER",
      importance: overrides.importance ?? 0.8,
      tags: overrides.tags || ["test"],
    },
  });
}

async function createWorkflow(userId, overrides = {}) {
  const definition = overrides.definition || {
    nodes: [
      { id: "start", type: "start", data: { label: "Start" } },
      {
        id: "llm1",
        type: "llm",
        data: { label: "LLM", prompt: "Say hello", model: "mock-llm" },
      },
      { id: "end", type: "end", data: { label: "End" } },
    ],
    edges: [
      { id: "e1", source: "start", target: "llm1" },
      { id: "e2", source: "llm1", target: "end" },
    ],
  };

  return getPrisma().workflow.create({
    data: {
      userId,
      name: overrides.name || `Workflow ${randomUUID().slice(0, 6)}`,
      description: overrides.description || "Test workflow",
      definition,
      status: overrides.status || "draft",
    },
  });
}

async function createDocument(userId, overrides = {}) {
  return getPrisma().document.create({
    data: {
      userId,
      name: overrides.name || "doc.txt",
      path: overrides.path || `/tmp/doc-${randomUUID()}.txt`,
      content: overrides.content || "Sample document content for knowledge tests.",
      mimeType: overrides.mimeType || "text/plain",
      fileSize: overrides.fileSize || 128,
      status: overrides.status || "ready",
    },
  });
}

module.exports = {
  createUser,
  createAdmin,
  createProject,
  createConversation,
  createMemory,
  createWorkflow,
  createDocument,
};
