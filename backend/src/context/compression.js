const crypto = require("crypto");
const { estimateTokens } = require("../runtime/token");
const { cosineSimilarity, keywordScore } = require("../memory/utils");

function hashText(text) {
  return crypto.createHash("sha256").update(String(text || "").slice(0, 2000)).digest("hex");
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/** Exact + near-duplicate removal by content hash and prefix overlap. */
function removeDuplicates(items) {
  const seen = new Set();
  const out = [];
  let removed = 0;
  for (const item of items) {
    const norm = normalizeWhitespace(item.content || item.text || "");
    const key = hashText(norm.slice(0, 400));
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    // near-dup: same first 120 chars
    const prefix = norm.slice(0, 120).toLowerCase();
    if (prefix.length > 40 && [...seen].some((k) => k.startsWith(hashText(prefix).slice(0, 16)))) {
      // keep checking via explicit prefix set
    }
    const prefixKey = `p:${prefix}`;
    if (prefix.length > 40 && seen.has(prefixKey)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    if (prefix.length > 40) seen.add(prefixKey);
    out.push(item);
  }
  return { items: out, removed };
}

/** Semantic deduplication using embeddings when available. */
function semanticDedup(items, { threshold = 0.92 } = {}) {
  const kept = [];
  let removed = 0;
  for (const item of items) {
    const emb = item.embedding;
    if (!Array.isArray(emb) || emb.length === 0) {
      kept.push(item);
      continue;
    }
    let dup = false;
    for (const k of kept) {
      if (!Array.isArray(k.embedding)) continue;
      if (cosineSimilarity(emb, k.embedding) >= threshold) {
        dup = true;
        break;
      }
    }
    if (dup) removed += 1;
    else kept.push(item);
  }
  return { items: kept, removed };
}

/** Merge adjacent chunks from the same document. */
function mergeChunks(items) {
  const groups = new Map();
  const others = [];
  for (const item of items) {
    if (item.type === "chunk" && item.documentId != null) {
      const key = String(item.documentId);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    } else {
      others.push(item);
    }
  }

  const merged = [];
  let mergeCount = 0;
  for (const [, chunks] of groups) {
    chunks.sort((a, b) => (a.metadata?.chunkIndex ?? 0) - (b.metadata?.chunkIndex ?? 0));
    if (chunks.length === 1) {
      merged.push(chunks[0]);
      continue;
    }
    // merge consecutive pairs when indices are adjacent
    let buffer = [chunks[0]];
    for (let i = 1; i < chunks.length; i += 1) {
      const prev = buffer[buffer.length - 1];
      const cur = chunks[i];
      const prevIdx = prev.metadata?.chunkIndex;
      const curIdx = cur.metadata?.chunkIndex;
      if (Number.isFinite(prevIdx) && Number.isFinite(curIdx) && curIdx === prevIdx + 1) {
        buffer.push(cur);
      } else {
        merged.push(collapseChunkBuffer(buffer));
        if (buffer.length > 1) mergeCount += buffer.length - 1;
        buffer = [cur];
      }
    }
    merged.push(collapseChunkBuffer(buffer));
    if (buffer.length > 1) mergeCount += buffer.length - 1;
  }

  return { items: [...others, ...merged], mergeCount };
}

function collapseChunkBuffer(buffer) {
  if (buffer.length === 1) return buffer[0];
  const content = buffer.map((b) => b.content).join("\n");
  const best = buffer.reduce((a, b) => ((b.score || 0) > (a.score || 0) ? b : a));
  return {
    ...best,
    content,
    tokenCount: estimateTokens(content),
    metadata: {
      ...(best.metadata || {}),
      mergedFrom: buffer.map((b) => b.id || b.sourceId).filter(Boolean),
      chunkSpan: [
        buffer[0].metadata?.chunkIndex,
        buffer[buffer.length - 1].metadata?.chunkIndex,
      ],
    },
    reason: `${best.reason || "chunk"} (merged ${buffer.length} adjacent chunks)`,
  };
}

/** Extractive summary for conversation / long text. */
function summarizeText(text, maxTokens = 400) {
  const raw = String(text || "").trim();
  if (!raw) return { summary: "", originalTokens: 0, summaryTokens: 0 };
  const originalTokens = estimateTokens(raw);
  if (originalTokens <= maxTokens) {
    return { summary: raw, originalTokens, summaryTokens: originalTokens };
  }

  const sentences = raw.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= 3) {
    const chars = maxTokens * 4;
    const summary = `${raw.slice(0, chars)}…`;
    return { summary, originalTokens, summaryTokens: estimateTokens(summary) };
  }

  // score sentences by position + keyword density of first sentence as proxy query
  const query = sentences.slice(0, 2).join(" ");
  const scored = sentences.map((s, i) => {
    const pos = i < 2 || i >= sentences.length - 2 ? 1.2 : 1;
    return { s, score: keywordScore(s, query) * pos + (i === 0 ? 0.3 : 0) };
  });
  scored.sort((a, b) => b.score - a.score);

  const picked = [];
  let tokens = 0;
  for (const { s } of scored) {
    const t = estimateTokens(s);
    if (tokens + t > maxTokens) continue;
    picked.push(s);
    tokens += t;
    if (tokens >= maxTokens * 0.85) break;
  }

  // restore original order
  const order = new Map(sentences.map((s, i) => [s, i]));
  picked.sort((a, b) => (order.get(a) || 0) - (order.get(b) || 0));
  const summary = picked.join(" ");
  return { summary, originalTokens, summaryTokens: estimateTokens(summary) };
}

/** Code-aware summarization: keep signatures, imports, exports. */
function summarizeCode(code, maxTokens = 350) {
  const raw = String(code || "");
  const originalTokens = estimateTokens(raw);
  if (originalTokens <= maxTokens) {
    return { summary: raw, originalTokens, summaryTokens: originalTokens };
  }

  const lines = raw.split(/\r?\n/);
  const keep = [];
  const sigRe =
    /^\s*(export\s+)?(async\s+)?(function|class|const|let|var|interface|type|enum|def|fn|pub\s+fn|import|from|require|module\.exports|#include|package)\b/;
  const commentBlock = /^\s*(\/\/|\/\*|\*|#|"""|''')/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (sigRe.test(line) || (commentBlock.test(line) && i < 30)) {
      keep.push(line);
      // keep next 2 body lines for functions
      if (/function|class|def |fn /.test(line)) {
        for (let j = 1; j <= 2 && i + j < lines.length; j += 1) {
          keep.push(lines[i + j]);
        }
      }
    }
  }

  let summary = keep.join("\n");
  if (estimateTokens(summary) > maxTokens || !summary) {
    const chars = maxTokens * 4;
    summary = `${raw.slice(0, chars)}\n// … truncated …`;
  }
  return { summary, originalTokens, summaryTokens: estimateTokens(summary) };
}

/**
 * Progressive compression pipeline.
 * Levels: 0=none, 1=dedupe, 2=+semantic, 3=+merge, 4=+summarize
 */
function compressItems(items, options = {}) {
  const level = options.level ?? 2;
  const history = [];
  let current = items.map((i) => ({ ...i }));
  let inputTokens = current.reduce((s, i) => s + (i.tokenCount || estimateTokens(i.content)), 0);

  if (level >= 1) {
    const r = removeDuplicates(current);
    history.push({ method: "duplicate_removal", removed: r.removed });
    current = r.items;
  }
  if (level >= 2) {
    const r = semanticDedup(current, { threshold: options.semanticThreshold || 0.92 });
    history.push({ method: "semantic_dedup", removed: r.removed });
    current = r.items;
  }
  if (level >= 3) {
    const r = mergeChunks(current);
    history.push({ method: "chunk_merging", mergeCount: r.mergeCount });
    current = r.items;
  }
  if (level >= 4) {
    current = current.map((item) => {
      const maxTok = options.itemMaxTokens || 400;
      const isCode =
        item.type === "file" ||
        item.type === "symbol" ||
        /\.(js|ts|tsx|jsx|py|go|rs|java)$/i.test(item.metadata?.path || "");
      const result = isCode
        ? summarizeCode(item.content, maxTok)
        : summarizeText(item.content, maxTok);
      if (result.summaryTokens < result.originalTokens) {
        return {
          ...item,
          content: result.summary,
          tokenCount: result.summaryTokens,
          compressed: true,
          originalTokens: result.originalTokens,
        };
      }
      return item;
    });
    history.push({ method: "progressive_summarization", count: current.filter((c) => c.compressed).length });
  }

  const outputTokens = current.reduce((s, i) => s + (i.tokenCount || estimateTokens(i.content)), 0);
  const ratio = inputTokens > 0 ? outputTokens / inputTokens : 1;

  return {
    items: current,
    inputTokens,
    outputTokens,
    ratio,
    history,
  };
}

function compressConversation(messages, maxTokens = 500) {
  const text = (messages || [])
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");
  return summarizeText(text, maxTokens);
}

module.exports = {
  removeDuplicates,
  semanticDedup,
  mergeChunks,
  summarizeText,
  summarizeCode,
  compressItems,
  compressConversation,
  hashText,
};
