const jwt = require("jsonwebtoken");
const { getEnv } = require("../config/env");

function generateAccessToken(user, sessionId = null) {
  const { JWT_SECRET, ACCESS_TOKEN_TTL } = getEnv();
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || "user",
  };
  if (sessionId) payload.sessionId = sessionId;

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

function generateRefreshToken(user, sessionId = null) {
  const { JWT_REFRESH_SECRET } = getEnv();
  const payload = { id: user.id };
  if (sessionId) payload.sessionId = sessionId;

  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: `${getEnv().REFRESH_TOKEN_TTL_DAYS}d`,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, getEnv().JWT_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, getEnv().JWT_REFRESH_SECRET);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateToken: (user, sessionId) => generateAccessToken(user, sessionId),
};
