const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const uploadDir = path.join(__dirname, "../../uploads/documents");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_EXT = new Set([
  "pdf", "docx", "txt", "md", "markdown", "json", "csv",
  "js", "jsx", "ts", "tsx", "py", "go", "java", "rs", "c", "cpp", "h", "css", "html", "sql",
  "png", "jpg", "jpeg", "webp", "gif", "bmp",
]);

const BLOCKED_EXT = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "ps1", "sh", "bash",
  "dll", "so", "dylib", "bin", "app", "dmg", "php", "asp", "aspx", "cgi",
]);

const ALLOWED_MIME_PREFIXES = ["text/", "image/", "application/pdf", "application/json"];
const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "text/plain",
  "text/markdown",
  "text/csv",
  "text/javascript",
  "application/javascript",
  "application/typescript",
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").replace(".", "").toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? `.${ext}` : ".bin";
    cb(null, `${crypto.randomBytes(16).toString("hex")}${safeExt}`);
  },
});

const uploadDocument = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || "").replace(".", "").toLowerCase();
    const name = String(file.originalname || "");

    if (BLOCKED_EXT.has(ext) || /\.(exe|bat|cmd|sh|ps1|dll)$/i.test(name)) {
      return cb(new Error("Executable uploads are not allowed"));
    }
    if (name.includes("..") || name.includes("/") || name.includes("\\")) {
      return cb(new Error("Invalid filename"));
    }
    if (!ALLOWED_EXT.has(ext)) {
      return cb(new Error(`Unsupported file type: .${ext || "unknown"}`));
    }

    const mime = file.mimetype || "";
    const mimeOk =
      ALLOWED_MIME_EXACT.has(mime) ||
      ALLOWED_MIME_PREFIXES.some((p) => mime.startsWith(p));

    if (!mimeOk && mime !== "application/octet-stream") {
      return cb(new Error(`Unsupported MIME type: ${mime || "unknown"}`));
    }

    return cb(null, true);
  },
});

module.exports = uploadDocument;
