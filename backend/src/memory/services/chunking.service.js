const { estimateTokens, contentHash } = require("../utils");

const DEFAULT_TARGET_TOKENS = 400;
const DEFAULT_OVERLAP_TOKENS = 60;

function splitLines(text) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n");
}

function isHeading(line) {
  return /^(#{1,6}\s+\S)|(^[A-Z][A-Za-z0-9 \-/]{2,80}$)|(^\d+(\.\d+)*\s+\S)/.test(line.trim());
}

function isCodeFence(line) {
  return /^```/.test(line.trim());
}

function detectChunkType(fileType, content) {
  const ft = String(fileType || "").toLowerCase();
  if (["js", "ts", "tsx", "jsx", "py", "go", "java", "rs", "c", "cpp", "css", "html"].includes(ft)) {
    return "code";
  }
  if (ft === "md" || ft === "markdown") return "markdown";
  if (ft === "json") return "json";
  if (ft === "csv") return "csv";
  if (/^#{1,6}\s/m.test(content)) return "markdown";
  if (/^(function|class|const|def|import|export|package)\b/m.test(content)) return "code";
  return "semantic";
}

function pushChunk(chunks, buffer, meta) {
  const content = buffer.join("\n").trim();
  if (!content) return;
  chunks.push({
    content,
    tokenCount: estimateTokens(content),
    contentHash: contentHash(content),
    heading: meta.heading || null,
    chunkType: meta.chunkType || "semantic",
    pageStart: meta.pageStart ?? null,
    pageEnd: meta.pageEnd ?? null,
    lineStart: meta.lineStart ?? null,
    lineEnd: meta.lineEnd ?? null,
    metadata: meta.extra || {},
  });
}

function flushWithOverlap(chunks, state, lineEnd, chunkType, overlapTokens) {
  pushChunk(chunks, state.buffer, {
    heading: state.heading,
    chunkType,
    lineStart: state.lineStart,
    lineEnd,
  });
  if (overlapTokens > 0 && state.buffer.length) {
    const overlapLines = [];
    let ot = 0;
    for (let i = state.buffer.length - 1; i >= 0 && ot < overlapTokens; i -= 1) {
      overlapLines.unshift(state.buffer[i]);
      ot += estimateTokens(state.buffer[i]);
    }
    state.buffer = overlapLines;
    state.tokens = ot;
    state.lineStart = Math.max(1, lineEnd - overlapLines.length + 1);
  } else {
    state.buffer = [];
    state.tokens = 0;
    state.lineStart = lineEnd + 1;
  }
}

function chunkByCodeAware(text, { targetTokens = DEFAULT_TARGET_TOKENS, overlapTokens = DEFAULT_OVERLAP_TOKENS } = {}) {
  const lines = splitLines(text);
  const chunks = [];
  const state = { buffer: [], tokens: 0, lineStart: 1, heading: null };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const t = estimateTokens(line);
    if (/^(function |class |def |export |async function |module\.exports)/.test(line.trim())) {
      if (state.tokens > targetTokens * 0.4) flushWithOverlap(chunks, state, i, "code", overlapTokens);
      state.heading = line.trim().slice(0, 120);
    }
    if (state.tokens + t > targetTokens && state.buffer.length) {
      flushWithOverlap(chunks, state, i, "code", overlapTokens);
    }
    state.buffer.push(line);
    state.tokens += t;
  }
  if (state.buffer.length) flushWithOverlap(chunks, state, lines.length, "code", 0);
  return chunks;
}

function chunkByMarkdown(text, { targetTokens = DEFAULT_TARGET_TOKENS, overlapTokens = DEFAULT_OVERLAP_TOKENS } = {}) {
  const lines = splitLines(text);
  const chunks = [];
  const state = { buffer: [], tokens: 0, lineStart: 1, heading: null };
  let inCode = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (isCodeFence(line)) inCode = !inCode;
    if (!inCode && /^#{1,6}\s+/.test(line.trim())) {
      if (state.buffer.length && state.tokens > 40) {
        flushWithOverlap(chunks, state, i, "markdown", overlapTokens);
      }
      state.heading = line.replace(/^#+\s*/, "").trim().slice(0, 160);
    }
    const t = estimateTokens(line);
    if (!inCode && state.tokens + t > targetTokens && state.buffer.length) {
      flushWithOverlap(chunks, state, i, "markdown", overlapTokens);
    }
    state.buffer.push(line);
    state.tokens += t;
  }
  if (state.buffer.length) flushWithOverlap(chunks, state, lines.length, "markdown", 0);
  return chunks;
}

function chunkSemantic(text, { targetTokens = DEFAULT_TARGET_TOKENS, overlapTokens = DEFAULT_OVERLAP_TOKENS } = {}) {
  const paragraphs = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks = [];
  let buffer = [];
  let tokens = 0;
  let heading = null;

  const flush = () => {
    if (!buffer.length) return;
    pushChunk(chunks, [buffer.join("\n\n")], { heading, chunkType: "semantic" });
    if (overlapTokens > 0 && buffer.length) {
      const last = buffer[buffer.length - 1];
      buffer = estimateTokens(last) <= overlapTokens * 2 ? [last] : [];
      tokens = buffer.reduce((a, b) => a + estimateTokens(b), 0);
    } else {
      buffer = [];
      tokens = 0;
    }
  };

  for (const para of paragraphs) {
    if (isHeading(para.split("\n")[0])) {
      if (buffer.length) flush();
      heading = para.split("\n")[0].trim().slice(0, 160);
    }
    const t = estimateTokens(para);
    if (tokens + t > targetTokens && buffer.length) flush();
    buffer.push(para);
    tokens += t;
  }
  flush();
  return chunks;
}

function chunkJson(text, opts = {}) {
  try {
    const obj = JSON.parse(text);
    if (Array.isArray(obj)) {
      const pieces = [];
      let buf = [];
      let tokens = 0;
      for (let i = 0; i < obj.length; i += 1) {
        const piece = JSON.stringify(obj[i], null, 2);
        const t = estimateTokens(piece);
        if (tokens + t > (opts.targetTokens || DEFAULT_TARGET_TOKENS) && buf.length) {
          pieces.push(buf.join(",\n"));
          buf = [];
          tokens = 0;
        }
        buf.push(piece);
        tokens += t;
      }
      if (buf.length) pieces.push(buf.join(",\n"));
      return pieces.map((content, i) => ({
        content: `[\n${content}\n]`,
        tokenCount: estimateTokens(content),
        contentHash: contentHash(content),
        heading: `items:${i}`,
        chunkType: "json",
        metadata: { arraySlice: i },
      }));
    }
  } catch {
    // fall through
  }
  return chunkSemantic(text, opts).map((c) => ({ ...c, chunkType: "json" }));
}

function chunkCsv(text, opts = {}) {
  const lines = splitLines(text).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0];
  const target = opts.targetTokens || DEFAULT_TARGET_TOKENS;
  const chunks = [];
  let buf = [header];
  let tokens = estimateTokens(header);
  let start = 1;

  for (let i = 1; i < lines.length; i += 1) {
    const t = estimateTokens(lines[i]);
    if (tokens + t > target && buf.length > 1) {
      const content = buf.join("\n");
      chunks.push({
        content,
        tokenCount: estimateTokens(content),
        contentHash: contentHash(content),
        heading: header.slice(0, 80),
        chunkType: "csv",
        lineStart: start,
        lineEnd: start + buf.length - 1,
        metadata: { header },
      });
      buf = [header, lines[i]];
      tokens = estimateTokens(header) + t;
      start = i;
    } else {
      buf.push(lines[i]);
      tokens += t;
    }
  }
  if (buf.length > 1) {
    const content = buf.join("\n");
    chunks.push({
      content,
      tokenCount: estimateTokens(content),
      contentHash: contentHash(content),
      heading: header.slice(0, 80),
      chunkType: "csv",
      lineStart: start,
      lineEnd: start + buf.length - 1,
      metadata: { header },
    });
  }
  return chunks;
}

class ChunkingService {
  chunk(text, { fileType, targetTokens, overlapTokens } = {}) {
    const type = detectChunkType(fileType, text);
    const opts = { targetTokens, overlapTokens };
    let chunks;
    switch (type) {
      case "code":
        chunks = chunkByCodeAware(text, opts);
        break;
      case "markdown":
        chunks = chunkByMarkdown(text, opts);
        break;
      case "json":
        chunks = chunkJson(text, opts);
        break;
      case "csv":
        chunks = chunkCsv(text, opts);
        break;
      default:
        chunks = chunkSemantic(text, opts);
    }

    return chunks.map((c, i) => ({
      ...c,
      chunkIndex: i,
      parentDocumentOrder: i,
    }));
  }
}

module.exports = new ChunkingService();
module.exports.detectChunkType = detectChunkType;
