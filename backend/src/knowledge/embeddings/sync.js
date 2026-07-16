const { randomUUID } = require("crypto");
const prisma = require("../../database/prisma");
const vectorStore = require("../vector/store");
const embeddingService = require("../../memory/services/embedding.service");
const { resolveConfig } = require("../../memory/services/embedding.service");
const { contentHash } = require("../../memory/utils");

async function syncMemoryEmbedding(memoryId, content, userId, existing = {}) {
  const hash = contentHash(content);
  if (existing.contentHash === hash && existing.embedding) {
    await vectorStore.upsertMemoryVector(memoryId, existing.embedding, {
      model: existing.embeddingModel || "auto",
      dim: existing.embeddingDim || existing.embedding?.length,
    });
    return { skipped: true, hash };
  }

  const embedding = await embeddingService.embedOne(content, { userId });
  const cfg = await resolveConfig(userId);

  await prisma.memory.update({
    where: { id: memoryId },
    data: {
      embedding,
      embeddingDim: embedding.length,
      embeddingModel: cfg.model,
      contentHash: hash,
    },
  });

  await vectorStore.upsertMemoryVector(memoryId, embedding, {
    model: cfg.model,
    dim: embedding.length,
  });

  const embId = randomUUID();
  await vectorStore.upsertKnowledgeEmbedding({
    id: embId,
    ownerId: userId,
    sourceType: "memory",
    sourceId: memoryId,
    vector: embedding,
    model: cfg.model,
    provider: cfg.provider,
    contentHash: hash,
    dimension: embedding.length,
  });

  let record = await prisma.embedding.findFirst({
    where: { contentHash: hash, model: cfg.model },
  });

  if (!record) {
    record = await prisma.embedding.create({
      data: {
        contentHash: hash,
        model: cfg.model,
        provider: cfg.provider,
        dimension: embedding.length,
      },
    });
  } else {
    record = await prisma.embedding.update({
      where: { id: record.id },
      data: { version: { increment: 1 } },
    });
  }

  await prisma.embeddingVersion.create({
    data: {
      embeddingId: record.id,
      version: record.version,
      model: cfg.model,
      provider: cfg.provider,
      dimension: embedding.length,
    },
  });

  return { skipped: false, hash, embedding, embeddingId: record.id };
}

async function syncChunkEmbedding(chunkId, content, userId, existing = {}) {
  const hash = contentHash(content);
  if (existing.contentHash === hash && existing.embedding) {
    await vectorStore.upsertChunkVector(chunkId, existing.embedding, {
      model: existing.embeddingModel || "auto",
      dim: existing.embeddingDim || existing.embedding?.length,
    });
    return { skipped: true, hash };
  }

  const embedding = await embeddingService.embedOne(content, { userId });
  const cfg = await resolveConfig(userId);

  await prisma.documentChunk.update({
    where: { id: chunkId },
    data: {
      embedding,
      embeddingDim: embedding.length,
      embeddingModel: cfg.model,
      contentHash: hash,
    },
  });

  await vectorStore.upsertChunkVector(chunkId, embedding, {
    model: cfg.model,
    dim: embedding.length,
  });

  return { skipped: false, hash, embedding };
}

async function batchSyncMemories(userId, memories) {
  const toEmbed = memories.filter(
    (m) => !m.contentHash || m.contentHash !== contentHash(m.content) || !m.embedding,
  );
  if (!toEmbed.length) return { embedded: 0, skipped: memories.length };

  const texts = toEmbed.map((m) => m.content);
  const vectors = await embeddingService.embedBatch(texts, { userId });
  const cfg = await resolveConfig(userId);
  let embedded = 0;

  for (let i = 0; i < toEmbed.length; i += 1) {
    const m = toEmbed[i];
    const embedding = vectors[i];
    const hash = contentHash(m.content);
    await prisma.memory.update({
      where: { id: m.id },
      data: {
        embedding,
        embeddingDim: embedding.length,
        embeddingModel: cfg.model,
        contentHash: hash,
      },
    });
    await vectorStore.upsertMemoryVector(m.id, embedding, {
      model: cfg.model,
      dim: embedding.length,
    });
    embedded += 1;
  }

  return { embedded, skipped: memories.length - embedded };
}

module.exports = {
  syncMemoryEmbedding,
  syncChunkEmbedding,
  batchSyncMemories,
};
