const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "clawos_super_secret_key";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "clawos_super_refresh_secret_key";

function generateAccessToken(user, sessionId = null) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || "user",
  };
  if (sessionId) payload.sessionId = sessionId;

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: "15m",
  });
}

function generateRefreshToken(user, sessionId = null) {
  const payload = { id: user.id };
  if (sessionId) payload.sessionId = sessionId;

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: "7d",
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, JWT_REFRESH_SECRET);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateToken: (user, sessionId) => generateAccessToken(user, sessionId),
};
