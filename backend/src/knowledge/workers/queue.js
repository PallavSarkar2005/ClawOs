const prisma = require("../../database/prisma");
const embeddingSync = require("../embeddings/sync");
const graphEngine = require("../graph/engine");
const vectorStore = require("../vector/store");

const JOB_STATUS = Object.freeze({
  QUEUED: "queued",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  RETRYING: "retrying",
  DEAD: "dead",
});

class KnowledgeJobQueue {
  async enqueue(userId, type, payload = {}, { maxRetries = 3 } = {}) {
    return prisma.knowledgeJob.create({
      data: { userId, type, payload, maxRetries, status: JOB_STATUS.QUEUED },
    });
  }

  async claimNext(type) {
    const job = await prisma.knowledgeJob.findFirst({
      where: {
        status: { in: [JOB_STATUS.QUEUED, JOB_STATUS.RETRYING] },
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: "asc" },
    });
    if (!job) return null;

    return prisma.knowledgeJob.update({
      where: { id: job.id },
      data: { status: JOB_STATUS.RUNNING, startedAt: new Date(), progress: 0 },
    });
  }

  async complete(id, result = {}) {
    return prisma.knowledgeJob.update({
      where: { id },
      data: {
        status: JOB_STATUS.COMPLETED,
        progress: 100,
        result,
        finishedAt: new Date(),
      },
    });
  }

  async fail(id, error, retries, maxRetries) {
    const nextRetries = retries + 1;
    const dead = nextRetries >= maxRetries;
    return prisma.knowledgeJob.update({
      where: { id },
      data: {
        status: dead ? JOB_STATUS.DEAD : JOB_STATUS.RETRYING,
        error: String(error).slice(0, 2000),
        retries: nextRetries,
        deadLetter: dead,
        finishedAt: dead ? new Date() : null,
      },
    });
  }

  async progress(id, progress, stage) {
    return prisma.knowledgeJob.update({
      where: { id },
      data: { progress, stage },
    });
  }
}

const queue = new KnowledgeJobQueue();

async function processEmbeddingJob(job) {
  const { memoryIds = [], chunkIds = [] } = job.payload || {};

  let embedded = 0;
  for (const memoryId of memoryIds) {
    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, ownerId: job.userId, deletedAt: null },
    });
    if (!memory) continue;
    await embeddingSync.syncMemoryEmbedding(memoryId, memory.content, job.userId, memory);
    await graphEngine.syncFromMemory(job.userId, memory);
    embedded += 1;
  }

  for (const chunkId of chunkIds) {
    const chunk = await prisma.documentChunk.findFirst({
      where: { id: chunkId, deletedAt: null },
      include: { document: true },
    });
    if (!chunk || chunk.document.userId !== job.userId) continue;
    await embeddingSync.syncChunkEmbedding(chunkId, chunk.content, job.userId, chunk);
    embedded += 1;
  }

  return { embedded };
}

async function processReindexJob(job) {
  const result = await vectorStore.backfillVectors(job.userId, { batchSize: 100 });
  await vectorStore.ensureIndexes();
  return result;
}

async function processGraphJob(job) {
  const { memoryId } = job.payload || {};
  if (memoryId) {
    const memory = await prisma.memory.findFirst({
      where: { id: memoryId, ownerId: job.userId },
    });
    if (memory) await graphEngine.syncFromMemory(job.userId, memory);
  }
  const metrics = await graphEngine.computeMetrics(job.userId);
  return { metrics };
}

async function processJob(job) {
  switch (job.type) {
    case "embed":
      return processEmbeddingJob(job);
    case "reindex":
      return processReindexJob(job);
    case "graph":
      return processGraphJob(job);
    default:
      return { skipped: true, type: job.type };
  }
}

let running = false;
let timer = null;

async function tick() {
  if (running) return;
  running = true;
  try {
    let job = await queue.claimNext();
    while (job) {
      try {
        await queue.progress(job.id, 10, "processing");
        const result = await processJob(job);
        await queue.complete(job.id, result);
      } catch (err) {
        console.error("[KnowledgeWorker] job failed:", job.id, err.message);
        await queue.fail(job.id, err.message, job.retries, job.maxRetries);
      }
      job = await queue.claimNext();
    }
  } finally {
    running = false;
  }
}

function startKnowledgeWorkers({ intervalMs = 3000 } = {}) {
  if (timer) return;
  vectorStore.ensureIndexes().catch(() => null);
  timer = setInterval(() => {
    tick().catch((err) => console.error("[KnowledgeWorker]", err.message));
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  tick().catch(() => null);
  console.log("[KnowledgeWorker] started");
}

function stopKnowledgeWorkers() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  queue,
  startKnowledgeWorkers,
  stopKnowledgeWorkers,
  processJob,
  tick,
  JOB_STATUS,
};
