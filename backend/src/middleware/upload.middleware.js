const crypto = require("crypto");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const ALLOWED_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : ".bin";
    cb(null, `${crypto.randomBytes(16).toString("hex")}${safeExt}`);
  },
});

module.exports = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || "").toLowerCase();
    if (!ALLOWED_MIME.has(file.mimetype) || !ALLOWED_EXT.has(ext)) {
      return cb(new Error("Only image uploads (jpg, png, webp, gif) are allowed"));
    }
    // Block double extensions / executables
    if (/\.(exe|bat|cmd|sh|ps1|js|mjs|cjs|php|py|rb|jar)$/i.test(file.originalname || "")) {
      return cb(new Error("Executable uploads are not allowed"));
    }
    cb(null, true);
  },
});
