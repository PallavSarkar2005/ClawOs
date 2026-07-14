const jwtService = require("../services/jwt.service");
const userRepository = require("../repositories/user.repository");

async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "No token provided",
      });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        message: "Malformed token",
      });
    }

    const decoded = jwtService.verifyAccessToken(token);
    
    const user = await userRepository.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        message: "User account is inactive or deleted",
      });
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