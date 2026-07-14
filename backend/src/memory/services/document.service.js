const fs = require("fs");
const path = require("path");
const documentRepository = require("../repositories/document.repository");
const indexJobRepository = require("../repositories/index-job.repository");
const memoryService = require("./memory.service");
const parserService = require("./document-parser.service");
const { DOC_STATUS, INDEX_JOB_STATUS, MEMORY_SCOPES, contentHash, estimateTokens } = require("../utils");

class DocumentService {
  async list(userId, filters) {
    return documentRepository.list(userId, filters);
  }

  async get(userId, id) {
    return documentRepository.findById(id, userId);
  }

  async getChunks(userId, id) {
    return documentRepository.getChunks(id, userId);
  }

  async upload(userId, file, options = {}) {
    if (!file) throw Object.assign(new Error("No file uploaded"), { status: 400 });

    const parsed = await parserService.parse(file.path, {
      originalName: file.originalname,
      mimeType: file.mimetype,
    });

    const document = await documentRepository.create({
      name: file.originalname,
      path: file.path,
      content: parsed.content,
      mimeType: parsed.mimeType || file.mimetype,
      fileType: parsed.fileType,
      fileSize: file.size || 0,
      status: DOC_STATUS.PENDING,
      indexProgress: 0,
      pageCount: parsed.pageCount,
      tokenCount: parsed.tokenCount || estimateTokens(parsed.content),
      contentHash: parsed.contentHash || contentHash(parsed.content),
      metadata: {
        ...parsed.metadata,
        originalName: file.originalname,
      },
      userId,
      projectId: options.projectId || null,
      workspaceId: options.workspaceId || null,
    });

    const job = await indexJobRepository.create({
      userId,
      documentId: document.id,
      type: "index",
      status: INDEX_JOB_STATUS.QUEUED,
      payload: { reindex: false },
    });

    // Keep file on disk for re-parse / preview until indexed (user may delete later)
    // Soft-link memory stub for DOCUMENT scope
    await memoryService.create(userId, {
      content: `Document indexed: ${document.name}\n${parsed.content.slice(0, 500)}`,
      scope: MEMORY_SCOPES.DOCUMENT,
      source: "document-upload",
      documentId: document.id,
      projectId: options.projectId,
      importance: 0.55,
      tags: ["document", parsed.fileType].filter(Boolean),
      metadata: { documentId: document.id, name: document.name },
    }).catch(() => null);

    return { document, job };
  }

  async remove(userId, id) {
    const doc = await documentRepository.findMeta(id, userId);
    if (!doc) return null;
    if (doc.path && fs.existsSync(doc.path)) {
      try {
        fs.unlinkSync(doc.path);
      } catch {
        // ignore
      }
    }
    return documentRepository.softDelete(id, userId);
  }

  async enqueueReindex(userId, id) {
    const doc = await documentRepository.findMeta(id, userId);
    if (!doc) return null;

    await documentRepository.update(id, {
      status: DOC_STATUS.PENDING,
      indexProgress: 0,
      indexError: null,
    });

    const job = await indexJobRepository.create({
      userId,
      documentId: id,
      type: "reindex",
      status: INDEX_JOB_STATUS.QUEUED,
      payload: { reindex: true },
    });

    return { document: doc, job };
  }

  async preview(userId, id) {
    const doc = await documentRepository.findById(id, userId);
    if (!doc) return null;
    return {
      id: doc.id,
      name: doc.name,
      status: doc.status,
      indexProgress: doc.indexProgress,
      mimeType: doc.mimeType,
      fileType: doc.fileType,
      pageCount: doc.pageCount,
      tokenCount: doc.tokenCount,
      chunkCount: doc.chunkCount,
      metadata: doc.metadata,
      contentPreview: doc.content.slice(0, 5000),
      chunks: (doc.chunks || []).slice(0, 50).map((c) => ({
        id: c.id,
        chunkIndex: c.chunkIndex,
        heading: c.heading,
        tokenCount: c.tokenCount,
        chunkType: c.chunkType,
        pageStart: c.pageStart,
        lineStart: c.lineStart,
        hasEmbedding: Array.isArray(c.embedding) && c.embedding.length > 0,
        preview: c.content.slice(0, 400),
      })),
    };
  }
}

module.exports = new DocumentService();
