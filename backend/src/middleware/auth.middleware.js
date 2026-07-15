const jwtService = require("../services/jwt.service");
const userRepository = require("../repositories/user.repository");
const sessionRepository = require("../repositories/session.repository");
const { getAccessTokenFromRequest } = require("../utils/cookies");

async function protect(req, res, next) {
  try {
    const token = getAccessTokenFromRequest(req);

    if (!token) {
      return res.status(401).json({
        message: "No token provided",
      });
    }

    const decoded = jwtService.verifyAccessToken(token);

    const user = await userRepository.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "User account is inactive or deleted",
      });
    }

    if (decoded.sessionId) {
      const owned = await sessionRepository.findByIdAndUserId(decoded.sessionId, user.id);
      if (!owned) {
        return res.status(401).json({
          message: "Session revoked or expired",
        });
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: decoded.sessionId || null,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
}

module.exports = protect;
