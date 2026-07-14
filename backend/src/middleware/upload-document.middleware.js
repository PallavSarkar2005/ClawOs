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

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const safe = String(file.originalname || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const uploadDocument = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || "").replace(".", "").toLowerCase();
    if (ALLOWED_EXT.has(ext) || file.mimetype?.startsWith("text/") || file.mimetype?.startsWith("image/")) {
      return cb(null, true);
    }
    return cb(new Error(`Unsupported file type: .${ext || file.mimetype}`));
  },
});

module.exports = uploadDocument;
