const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY = crypto.scryptSync(
  process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "clawos_super_secret_key",
  "clawos-integration-salt",
  32,
);

function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = String(payload).split(":");
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error("Invalid encrypted payload");
  }
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

function maskKey(key) {
  const value = String(key || "");
  if (value.length <= 8) return "*".repeat(Math.max(value.length, 4));
  return `${value.slice(0, 4)}${"*".repeat(Math.min(value.length - 8, 24))}${value.slice(-4)}`;
}

function keyHint(key) {
  const value = String(key || "");
  return value.slice(-4) || "****";
}

module.exports = {
  encrypt,
  decrypt,
  maskKey,
  keyHint,
};
