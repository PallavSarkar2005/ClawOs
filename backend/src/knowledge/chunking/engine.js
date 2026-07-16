const prisma = require("../../database/prisma");
const { contentHash, estimateTokens } = require("../../memory/utils");
const chunkingService = require("../../memory/services/chunking.service");

function buildHierarchy(chunks) {
  const parents = new Map();
  const children = new Map();

  for (const c of chunks) {
    if (c.parentChunkId) {
      if (!children.has(c.parentChunkId)) children.set(c.parentChunkId, []);
      children.get(c.parentChunkId).push(c);
    }
    if (c.heading) parents.set(c.chunkIndex, c);
  }

  return { parents, children };
}

function adaptiveChunkSize(content, { fileType, baseTokens = 400 } = {}) {
  const tokens = estimateTokens(content);
  if (tokens < 800) return baseTokens;
  if (tokens < 5000) return Math.min(600, baseTokens + 100);
  if (tokens < 20000) return 800;
  return 1000;
}

class SemanticChunker {
  chunk(text, opts = {}) {
    const { fileType, targetTokens, overlapTokens = 60, parentId } = opts;
    const adaptive = adaptiveChunkSize(text, { fileType, baseTokens: targetTokens || 400 });
    const raw = chunkingService.chunk(text, {
      fileType,
      targetTokens: adaptive,
      overlapTokens,
    });

    return raw.map((c, i) => ({
      ...c,
      chunkIndex: i,
      parentChunkId: parentId || (i > 0 && c.heading ? `parent-${i - 1}` : null),
      metadata: {
        ...(c.metadata || {}),
        adaptiveTokens: adaptive,
        hierarchyLevel: c.heading ? 1 : 0,
      },
    }));
  }

  chunkRepository(files, opts = {}) {
    const chunks = [];
    for (const file of files) {
      const fileChunks = this.chunk(file.content, {
        fileType: file.fileType || file.path?.split(".").pop(),
        ...opts,
      });
      for (const c of fileChunks) {
        chunks.push({
          ...c,
          metadata: {
            ...c.metadata,
            filePath: file.path,
            repository: opts.repository,
          },
        });
      }
    }
    return chunks;
  }
}

module.exports = new SemanticChunker();
module.exports.buildHierarchy = buildHierarchy;
module.exports.adaptiveChunkSize = adaptiveChunkSize;
