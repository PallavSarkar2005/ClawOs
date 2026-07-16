/**
 * Documents tools — upload, OCR, parse, chunk, embed, search.
 */

const fs = require("fs");
const path = require("path");
const { defineTool, ok, fail } = require("../sdk/define-tool");
const { retrievalEngine } = require("../../memory");
const prisma = require("../../database/prisma");

async function parsePdf(buffer) {
  try {
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer);
    return { text: data.text || "", pages: data.numpages || 0 };
  } catch (e) {
    return { text: "", error: e.message };
  }
}

async function parseDocx(buffer) {
  try {
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return { text: result.value || "" };
  } catch (e) {
    return { text: "", error: e.message };
  }
}

function chunkText(text, size = 800, overlap = 100) {
  const chunks = [];
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return chunks;
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    chunks.push(clean.slice(i, end));
    if (end >= clean.length) break;
    i = Math.max(0, end - overlap);
  }
  return chunks;
}

const documentsTools = [
  defineTool({
    id: "documents.search",
    name: "Search Documents",
    description: "Hybrid search over uploaded document chunks",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:read"],
    timeout: 20000,
    retries: 1,
    cacheable: true,
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        documentId: { type: "string" },
        topK: { type: "number" },
      },
      required: ["query"],
    },
    async executor(args, ctx) {
      try {
        const result = await retrievalEngine.hybridSearch(ctx.userId, args.query, {
          topK: args.topK || 6,
          includeMemories: false,
          includeChunks: true,
          documentIds: args.documentId ? [args.documentId] : undefined,
        });
        return ok({
          results: (result.results || []).map((r) => ({
            id: r.id,
            content: r.content?.slice(0, 4000),
            score: r.score,
            documentId: r.documentId,
          })),
        });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "documents.upload",
    name: "Upload Document",
    description: "Register document text content in the knowledge base",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:write"],
    timeout: 30000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        name: { type: "string" },
        content: { type: "string" },
        mimeType: { type: "string" },
      },
      required: ["content"],
    },
    async executor(args, ctx) {
      try {
        const name = args.name || args.title || "Untitled";
        const doc = await prisma.document.create({
          data: {
            name,
            path: `uploads/${name.replace(/[^\w.-]+/g, "_")}`,
            content: args.content,
            mimeType: args.mimeType || "text/plain",
            userId: ctx.userId,
            status: "ready",
          },
        });
        return ok({ id: doc.id, uploaded: true });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "documents.parse",
    name: "Parse Document",
    description: "Parse PDF/DOCX/text content into plain text",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:execute"],
    timeout: 60000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        filePath: { type: "string" },
        mimeType: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        let buffer;
        let mime = args.mimeType || "";
        if (args.documentId) {
          const doc = await prisma.document.findFirst({
            where: { id: args.documentId, userId: ctx.userId },
          });
          if (!doc) return fail("Document not found", "NOT_FOUND");
          if (doc.content) return ok({ text: doc.content.slice(0, 100_000), source: "content" });
          const diskPath = doc.path && path.isAbsolute(doc.path) ? doc.path : null;
          if (diskPath && fs.existsSync(diskPath)) {
            buffer = fs.readFileSync(diskPath);
            mime = doc.mimeType || mime;
          } else {
            return fail("No parseable content", "NO_CONTENT");
          }
        } else if (args.filePath && fs.existsSync(args.filePath)) {
          buffer = fs.readFileSync(args.filePath);
          mime = mime || path.extname(args.filePath);
        } else {
          return fail("Provide documentId or filePath", "BAD_ARGS");
        }

        if (/pdf/i.test(mime) || String(args.filePath || "").endsWith(".pdf")) {
          const parsed = await parsePdf(buffer);
          return ok({ ...parsed, format: "pdf" });
        }
        if (/word|docx/i.test(mime) || String(args.filePath || "").endsWith(".docx")) {
          const parsed = await parseDocx(buffer);
          return ok({ ...parsed, format: "docx" });
        }
        return ok({ text: buffer.toString("utf8").slice(0, 100_000), format: "text" });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "documents.ocr",
    name: "OCR Document",
    description: "Extract text from document content (text-layer OCR fallback)",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:execute"],
    timeout: 60000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        content: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      // Production text extraction via parse pipeline (no fake OCR)
      if (args.content) {
        return ok({ text: String(args.content).slice(0, 100_000), method: "direct" });
      }
      return documentsTools.find((t) => t.id === "documents.parse").executor(args, ctx);
    },
  }),

  defineTool({
    id: "documents.chunk",
    name: "Chunk Document",
    description: "Split document text into overlapping chunks and optionally persist",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:write"],
    timeout: 30000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
        content: { type: "string" },
        size: { type: "number" },
        overlap: { type: "number" },
        persist: { type: "boolean" },
      },
      required: [],
    },
    async executor(args, ctx) {
      try {
        let text = args.content || "";
        if (!text && args.documentId) {
          const doc = await prisma.document.findFirst({
            where: { id: args.documentId, userId: ctx.userId },
          });
          if (!doc) return fail("Document not found", "NOT_FOUND");
          text = doc.content || "";
        }
        const chunks = chunkText(text, args.size || 800, args.overlap || 100);
        if (args.persist && args.documentId) {
          await prisma.documentChunk.deleteMany({ where: { documentId: args.documentId } });
          for (let i = 0; i < chunks.length; i++) {
            await prisma.documentChunk.create({
              data: {
                documentId: args.documentId,
                content: chunks[i],
                chunkIndex: i,
                version: 1,
              },
            });
          }
          await prisma.document.update({
            where: { id: args.documentId },
            data: { chunkCount: chunks.length },
          });
        }
        return ok({ count: chunks.length, chunks: chunks.slice(0, 50), persisted: Boolean(args.persist) });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "documents.embed",
    name: "Embed Document",
    description: "Queue or run embedding for a document's chunks",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:execute"],
    timeout: 60000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        documentId: { type: "string" },
      },
      required: ["documentId"],
    },
    async executor(args, ctx) {
      try {
        const doc = await prisma.document.findFirst({
          where: { id: args.documentId, userId: ctx.userId },
        });
        if (!doc) return fail("Document not found", "NOT_FOUND");
        try {
          const memory = require("../../memory");
          if (typeof memory.enqueueDocumentIndex === "function") {
            await memory.enqueueDocumentIndex(args.documentId, ctx.userId);
            return ok({ documentId: args.documentId, queued: true });
          }
        } catch {
          /* fall through */
        }
        await prisma.document.update({
          where: { id: args.documentId },
          data: { status: "indexing" },
        });
        return ok({ documentId: args.documentId, status: "indexing" });
      } catch (e) {
        return fail(e);
      }
    },
  }),

  defineTool({
    id: "documents",
    name: "Documents",
    description: "Search uploaded documents for relevant passages",
    category: "documents",
    version: "1.0.0",
    permissions: ["documents:read"],
    timeout: 20000,
    retries: 1,
    schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        documentId: { type: "string" },
        topK: { type: "number" },
        action: {
          type: "string",
          enum: ["search", "upload", "ocr", "parse", "chunk", "embed"],
        },
        title: { type: "string" },
        content: { type: "string" },
      },
      required: [],
    },
    async executor(args, ctx) {
      const action = args.action || "search";
      const id = action === "search" ? "documents.search" : `documents.${action}`;
      const tool = documentsTools.find((t) => t.id === id);
      if (!tool) return fail(`Unknown documents action: ${action}`, "BAD_ACTION");
      return tool.executor(args, ctx);
    },
  }),
];

module.exports = { documentsTools, chunkText };
