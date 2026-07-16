const prisma = require("../../database/prisma");
const memoryService = require("../services/memory.service");
const ltmEngine = require("../../knowledge/memory/ltm");
const documentRepository = require("../repositories/document.repository");
const indexJobRepository = require("../repositories/index-job.repository");
const { INDEX_JOB_STATUS, DOC_STATUS, contentHash } = require("../utils");
const fs = require("fs");

let timer = null;

async function reindexModifiedDocuments() {
  const docs = await prisma.document.findMany({
    where: {
      deletedAt: null,
      status: { in: [DOC_STATUS.INDEXED, DOC_STATUS.FAILED] },
      path: { not: null },
    },
    take: 40,
    orderBy: { updatedAt: "asc" },
  });

  for (const doc of docs) {
    if (!doc.path || !fs.existsSync(doc.path)) continue;
    try {
      const raw = fs.readFileSync(doc.path);
      // Only compare hash of current file text for text-like files
      let fileText;
      try {
        fileText = raw.toString("utf8");
      } catch {
        continue;
      }
      const hash = contentHash(fileText);
      if (doc.contentHash && hash === doc.contentHash) continue;

      // File changed — queue reindex
      const existing = await prisma.indexJob.findFirst({
        where: {
          documentId: doc.id,
          status: { in: [INDEX_JOB_STATUS.QUEUED, INDEX_JOB_STATUS.RUNNING, INDEX_JOB_STATUS.RETRYING] },
        },
      });
      if (existing) continue;

      await documentRepository.update(doc.id, {
        status: DOC_STATUS.PENDING,
        indexProgress: 0,
      });
      await indexJobRepository.create({
        userId: doc.userId,
        documentId: doc.id,
        type: "reindex",
        status: INDEX_JOB_STATUS.QUEUED,
        payload: { reason: "file-changed", prevHash: doc.contentHash, nextHash: hash },
      });
    } catch (err) {
      console.warn("[MemoryScheduler] reindex check failed:", doc.id, err.message);
    }
  }
}

async function decayPass() {
  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true },
    take: 100,
  });
  for (const u of users) {
    try {
      await ltmEngine.decayPass(u.id);
    } catch (err) {
      console.warn("[MemoryScheduler] decay failed for", u.id, err.message);
    }
  }
}

async function retryStaleJobs() {
  const stale = await prisma.indexJob.findMany({
    where: {
      status: INDEX_JOB_STATUS.RUNNING,
      updatedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
    },
    take: 20,
  });
  for (const job of stale) {
    await indexJobRepository.update(job.id, {
      status: INDEX_JOB_STATUS.RETRYING,
      stage: "stale-retry",
      error: "Stale running job recovered by scheduler",
    });
  }
}

async function runCycle() {
  await retryStaleJobs();
  await reindexModifiedDocuments();
  await decayPass();
}

function startMemoryScheduler({ intervalMs = 5 * 60 * 1000 } = {}) {
  if (timer) return;
  timer = setInterval(() => {
    runCycle().catch((err) => console.error("[MemoryScheduler]", err.message));
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  setTimeout(() => runCycle().catch(() => null), 8000);
  console.log("[MemoryScheduler] started");
}

function stopMemoryScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startMemoryScheduler,
  stopMemoryScheduler,
  runCycle,
};
