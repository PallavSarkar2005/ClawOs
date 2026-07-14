const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
const mammoth = require("mammoth");
const { contentHash, estimateTokens } = require("../utils");

const CODE_EXTS = new Set([
  "js", "jsx", "ts", "tsx", "py", "go", "java", "rs", "c", "cpp", "h", "hpp",
  "css", "scss", "html", "vue", "svelte", "rb", "php", "sh", "sql", "kt", "swift",
]);

function extOf(filename) {
  return path.extname(filename || "").replace(".", "").toLowerCase();
}

function cleanText(raw) {
  return String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractMetadata(text, fileType, extra = {}) {
  const lines = text.split("\n");
  const headings = lines.filter((l) => /^#{1,6}\s+/.test(l.trim())).map((l) => l.trim()).slice(0, 40);
  return {
    fileType,
    lineCount: lines.length,
    charCount: text.length,
    tokenCount: estimateTokens(text),
    headings,
    preview: text.slice(0, 280),
    ...extra,
  };
}

/** Very light OCR for images: extract any embedded text via simple buffer heuristics + filename context.
 *  Full OCR requires tesseract; we parse EXIF-free text and document that binary images need optional OCR.
 */
async function parseImage(filePath, originalName) {
  const buffer = fs.readFileSync(filePath);
  // Extract printable ASCII runs (useful for screenshots with embedded strings / simple OCR-less fallback)
  let ascii = "";
  let run = "";
  for (let i = 0; i < buffer.length; i += 1) {
    const c = buffer[i];
    if (c >= 32 && c <= 126) {
      run += String.fromCharCode(c);
    } else {
      if (run.length >= 4) ascii += `${run}\n`;
      run = "";
    }
  }
  if (run.length >= 4) ascii += `${run}\n`;

  const cleaned = cleanText(ascii);
  const content = cleaned.length > 20
    ? cleaned
    : `Image document: ${originalName}\n(No embedded text detected. Install OCR provider for full image text extraction.)`;

  return {
    content,
    mimeType: "image/*",
    fileType: extOf(originalName) || "image",
    pageCount: 1,
    metadata: extractMetadata(content, "image", { ocr: cleaned.length > 20 ? "embedded-text" : "none" }),
  };
}

class DocumentParserService {
  async parse(filePath, { originalName, mimeType } = {}) {
    const name = originalName || path.basename(filePath);
    const ext = extOf(name);
    const mime = mimeType || "";
    let content = "";
    let pageCount = null;
    let metaExtra = {};

    if (mime === "application/pdf" || ext === "pdf") {
      const buffer = fs.readFileSync(filePath);
      const data = await pdf(buffer);
      content = data.text || "";
      pageCount = data.numpages || null;
      metaExtra = { parser: "pdf-parse", pages: pageCount };
    } else if (
      mime.includes("word") ||
      mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "docx"
    ) {
      const result = await mammoth.extractRawText({ path: filePath });
      content = result.value || "";
      metaExtra = { parser: "mammoth" };
    } else if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(ext)) {
      return parseImage(filePath, name);
    } else if (ext === "json" || mime === "application/json") {
      content = fs.readFileSync(filePath, "utf8");
      try {
        content = JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        // keep raw
      }
      metaExtra = { parser: "json" };
    } else if (ext === "csv" || mime === "text/csv") {
      content = fs.readFileSync(filePath, "utf8");
      metaExtra = { parser: "csv" };
    } else if (["md", "markdown", "txt", "text"].includes(ext) || mime.startsWith("text/")) {
      content = fs.readFileSync(filePath, "utf8");
      metaExtra = { parser: "text" };
    } else if (CODE_EXTS.has(ext)) {
      content = fs.readFileSync(filePath, "utf8");
      metaExtra = { parser: "code", language: ext };
    } else {
      // attempt utf8 read
      try {
        content = fs.readFileSync(filePath, "utf8");
        metaExtra = { parser: "raw-utf8" };
      } catch {
        throw new Error(`Unsupported file type: ${ext || mime}`);
      }
    }

    content = cleanText(content);
    const fileType = CODE_EXTS.has(ext) ? ext : ext || "txt";

    return {
      content,
      mimeType: mime || null,
      fileType,
      pageCount,
      contentHash: contentHash(content),
      tokenCount: estimateTokens(content),
      metadata: extractMetadata(content, fileType, metaExtra),
    };
  }
}

module.exports = new DocumentParserService();
module.exports.cleanText = cleanText;
module.exports.extOf = extOf;
