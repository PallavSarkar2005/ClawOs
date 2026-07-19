/**
 * Artifact manager — persist plans, code, reports, logs, checkpoints.
 */

const crypto = require("crypto");
const prisma = require("../../database/prisma");
const { ARTIFACT_KINDS, STREAM_EVENTS } = require("../constants");

function checksum(content) {
  return crypto.createHash("sha256").update(String(content || "")).digest("hex").slice(0, 16);
}

async function createArtifact(input = {}, emit) {
  const content = input.content != null ? String(input.content) : null;
  const contentJson = input.contentJson != null ? input.contentJson : null;
  const sizeBytes =
    input.sizeBytes ??
    (content ? Buffer.byteLength(content, "utf8") : contentJson ? Buffer.byteLength(JSON.stringify(contentJson), "utf8") : null);

  const row = await prisma.autonomyArtifact.create({
    data: {
      goalId: input.goalId || null,
      taskId: input.taskId || null,
      sessionId: input.sessionId || null,
      kind: String(input.kind || ARTIFACT_KINDS.CODE),
      name: String(input.name || "artifact").slice(0, 500),
      path: input.path || null,
      mimeType: input.mimeType || (contentJson ? "application/json" : "text/plain"),
      content: content ? content.slice(0, 2_000_000) : null,
      contentJson,
      sizeBytes,
      checksum: content ? checksum(content) : contentJson ? checksum(JSON.stringify(contentJson)) : null,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
    },
  });

  emit?.(STREAM_EVENTS.ARTIFACT_CREATED, {
    artifactId: row.id,
    kind: row.kind,
    name: row.name,
    path: row.path,
  });

  return row;
}

async function listArtifacts(filters = {}) {
  const where = {};
  if (filters.goalId) where.goalId = filters.goalId;
  if (filters.sessionId) where.sessionId = filters.sessionId;
  if (filters.taskId) where.taskId = filters.taskId;
  if (filters.kind) where.kind = filters.kind;
  return prisma.autonomyArtifact.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(filters.limit) || 100, 500),
    select: {
      id: true,
      kind: true,
      name: true,
      path: true,
      mimeType: true,
      sizeBytes: true,
      checksum: true,
      metadata: true,
      createdAt: true,
      goalId: true,
      taskId: true,
      sessionId: true,
      content: filters.includeContent === true,
      contentJson: filters.includeContent === true,
    },
  });
}

async function getArtifact(id) {
  return prisma.autonomyArtifact.findUnique({ where: { id } });
}

module.exports = {
  ARTIFACT_KINDS,
  createArtifact,
  listArtifacts,
  getArtifact,
  checksum,
};
