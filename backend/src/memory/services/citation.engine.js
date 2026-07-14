class CitationEngine {
  /**
   * Build citation objects for AI answers from retrieval / context builder output.
   */
  fromRetrievalResults(results = []) {
    return results.map((r, i) => ({
      index: i + 1,
      source: r.type === "chunk" ? "document" : r.scope?.toLowerCase() || r.type,
      documentId: r.documentId || null,
      document: r.documentName || null,
      chunkId: r.type === "chunk" ? r.id : null,
      chunk: r.metadata?.chunkIndex ?? null,
      page: r.pageStart ?? r.metadata?.page ?? null,
      line: r.lineStart ?? r.metadata?.lineStart ?? null,
      heading: r.metadata?.heading || r.heading || null,
      confidence: Number((r.hybridScore ?? r.semanticScore ?? r.confidence ?? 0).toFixed(4)),
      memoryId: r.type === "memory" ? r.id : null,
      snippet: String(r.content || "").slice(0, 240),
      jump: {
        documentId: r.documentId || null,
        chunkId: r.type === "chunk" ? r.id : null,
        memoryId: r.type === "memory" ? r.id : null,
        page: r.pageStart ?? null,
        line: r.lineStart ?? null,
      },
    }));
  }

  /**
   * Format citations as markdown footnote block for prompts / UI.
   */
  toMarkdown(citations = []) {
    if (!citations.length) return "";
    const lines = citations.map((c) => {
      const loc = [
        c.document ? `doc:${c.document}` : null,
        c.chunk != null ? `chunk:${c.chunk}` : null,
        c.page != null ? `page:${c.page}` : null,
        c.line != null ? `line:${c.line}` : null,
        `conf:${c.confidence}`,
      ]
        .filter(Boolean)
        .join(" · ");
      return `[${c.index}] ${loc}\n> ${c.snippet}`;
    });
    return `\n\n---\nSources:\n${lines.join("\n\n")}`;
  }

  /**
   * Attach citation markers into an answer string using [#n] references when missing.
   */
  annotateAnswer(answer, citations = []) {
    if (!citations.length) return { answer, citations };
    const hasMarkers = /\[#\d+\]/.test(answer) || /\[\d+\]/.test(answer);
    if (hasMarkers) return { answer, citations };
    const trailer = this.toMarkdown(citations);
    return { answer: `${answer}${trailer}`, citations };
  }
}

module.exports = new CitationEngine();
