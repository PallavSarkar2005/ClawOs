const documentRepository = require("../repositories/document.repository");
const indexJobRepository = require("../repositories/index-job.repository");
const chunkingService = require("../services/chunking.service");
const embeddingService = require("../services/embedding.service");
const embeddingSync = require("../../knowledge/embeddings/sync");
const parserService = require("../services/document-parser.service");
const { DOC_STATUS, contentHash, estimateTokens } = require("../utils");
const fs = require("fs");

let running = false;
let timer = null;

async function processJob(job) {
  const documentId = job.documentId;
  if (!documentId) {
    await indexJobRepository.complete(job.id, { skipped: true });
    return;
  }

  let doc = await documentRepository.findMeta(documentId, job.userId);
  if (!doc) {
    // fallback without user filter for worker recovery
    const prisma = require("../../database/prisma");
    doc = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
  }
  if (!doc) {
    await indexJobRepository.fail(job.id, "Document not found", job.retries, job.maxRetries);
    return;
  }

  await documentRepository.update(documentId, {
    status: DOC_STATUS.PARSING,
    indexProgress: 5,
    indexError: null,
  });
  await indexJobRepository.progress(job.id, 5, "parsing");

  let content = doc.content || "";
  let fileType = doc.fileType;
  let metadata = doc.metadata || {};

  if (doc.path && fs.existsSync(doc.path) && (job.type === "reindex" || !content)) {
    try {
      const parsed = await parserService.parse(doc.path, {
        originalName: doc.name,
        mimeType: doc.mimeType,
      });
      content = parsed.content;
      fileType = parsed.fileType || fileType;
      metadata = { ...metadata, ...parsed.metadata };
      await documentRepository.update(documentId, {
        content,
        fileType,
        mimeType: parsed.mimeType || doc.mimeType,
        pageCount: parsed.pageCount,
        tokenCount: parsed.tokenCount,
        contentHash: parsed.contentHash,
        metadata,
      });
    } catch (err) {
      console.warn("[IndexingWorker] re-parse failed, using stored content:", err.message);
    }
  }

  await documentRepository.update(documentId, {
    status: DOC_STATUS.CHUNKING,
    indexProgress: 25,
  });
  await indexJobRepository.progress(job.id, 25, "chunking");

  const rawChunks = chunkingService.chunk(content, { fileType });
  const chunkRows = rawChunks.map((c) => ({
    documentId,
    content: c.content,
    chunkIndex: c.chunkIndex,
    tokenCount: c.tokenCount || estimateTokens(c.content),
    contentHash: c.contentHash || contentHash(c.content),
    heading: c.heading || null,
    chunkType: c.chunkType || "semantic",
    pageStart: c.pageStart ?? null,
    pageEnd: c.pageEnd ?? null,
    lineStart: c.lineStart ?? null,
    lineEnd: c.lineEnd ?? null,
    metadata: {
      ...(c.metadata || {}),
      parentDocumentOrder: c.parentDocumentOrder,
    },
    version: doc.version || 1,
  }));

  const savedChunks = await documentRepository.replaceChunks(documentId, chunkRows);

  await documentRepository.update(documentId, {
    status: DOC_STATUS.EMBEDDING,
    indexProgress: 45,
    chunkCount: savedChunks.length,
    tokenCount: estimateTokens(content),
  });
  await indexJobRepository.progress(job.id, 45, "embedding");

  const toEmbed = [];
  const embedTargets = [];

  for (const chunk of savedChunks) {
    if (Array.isArray(chunk.embedding) && chunk.embedding.length) continue;
    toEmbed.push(chunk);
    embedTargets.push(chunk.content);
  }

  if (embedTargets.length) {
    const vectors = await embeddingService.embedBatch(embedTargets, { userId: job.userId });
    for (let i = 0; i < toEmbed.length; i += 1) {
      const chunk = toEmbed[i];
      const embedding = vectors[i] || [];
      await documentRepository.updateChunk(chunk.id, {
        embedding,
        embeddingDim: embedding.length,
        embeddingModel: "auto",
        contentHash: contentHash(chunk.content),
      });
      await embeddingSync.syncChunkEmbedding(chunk.id, chunk.content, job.userId, {
        ...chunk,
        embedding,
        contentHash: contentHash(chunk.content),
      }).catch(() => null);
      const progress = 45 + Math.round(((i + 1) / toEmbed.length) * 50);
      if (i % 4 === 0 || i === toEmbed.length - 1) {
        await documentRepository.update(documentId, { indexProgress: progress });
        await indexJobRepository.progress(job.id, progress, "embedding");
      }
    }
  }

  await documentRepository.update(documentId, {
    status: DOC_STATUS.INDEXED,
    indexProgress: 100,
    indexError: null,
    chunkCount: savedChunks.length,
  });

  await indexJobRepository.complete(job.id, {
    chunkCount: savedChunks.length,
    embedded: embedTargets.length,
    skippedEmbeddings: savedChunks.length - embedTargets.length,
  });
}

async function tick() {
  if (running) return;
  running = true;
  try {
    let job = await indexJobRepository.claimNext();
    while (job) {
      try {
        await processJob(job);
      } catch (err) {
        console.error("[IndexingWorker] job failed:", job.id, err.message);
        await indexJobRepository.fail(job.id, err.message, job.retries, job.maxRetries);
        if (job.documentId) {
          await documentRepository.update(job.documentId, {
            status: DOC_STATUS.FAILED,
            indexError: String(err.message).slice(0, 2000),
          }).catch(() => null);
        }
      }
      job = await indexJobRepository.claimNext();
    }
  } finally {
    running = false;
  }
}

function startIndexingWorker({ intervalMs = 2500 } = {}) {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => console.error("[IndexingWorker]", err.message));
  }, intervalMs);
  if (typeof timer.unref === "function") timer.unref();
  tick().catch(() => null);
  console.log("[IndexingWorker] started");
}

function stopIndexingWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  startIndexingWorker,
  stopIndexingWorker,
  processJob,
  tick,
};
