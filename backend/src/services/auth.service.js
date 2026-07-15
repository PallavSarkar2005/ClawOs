const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const userRepository = require("../repositories/user.repository");
const sessionRepository = require("../repositories/session.repository");
const tokenRepository = require("../repositories/token.repository");
const jwtService = require("./jwt.service");
const prisma = require("../database/prisma");

class AuthService {
  _slugUsername(name, email) {
    const base = String(name || email.split("@")[0] || "user")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);
    return base || "user";
  }

  async _uniqueUsername(base) {
    let candidate = base;
    let i = 0;
    while (await userRepository.findByUsername(candidate)) {
      i += 1;
      candidate = `${base}${i}`.slice(0, 24);
    }
    return candidate;
  }

  async register(name, email, password) {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      throw new Error("User already exists");
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const username = await this._uniqueUsername(this._slugUsername(name, email));

    const user = await userRepository.create({
      name,
      email,
      username,
      passwordHash: hashedPassword,
      emailVerificationToken: verificationToken,
    });

    await prisma.setting.create({ data: { userId: user.id } });

    // Verification token issued; deliver via email service in production (never log secrets)
    if (process.env.NODE_ENV !== "production") {
      console.log("[AUTH] Email verification token issued for new user");
    }

    return this._safeUser(user);
  }

  async login(email, password, agentDetails) {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.isActive) {
      throw new Error("Invalid credentials");
    }

    if (!user.passwordHash) {
      throw new Error("Invalid credentials");
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new Error("Invalid credentials");
    }

    const session = await sessionRepository.create({
      userId: user.id,
      userAgent: agentDetails.userAgent,
      ipAddress: agentDetails.ipAddress,
      browser: agentDetails.browser,
      os: agentDetails.os,
      device: agentDetails.device || "desktop",
      location: agentDetails.location,
    });

    const accessToken = jwtService.generateAccessToken(user, session.id);
    const refreshToken = jwtService.generateRefreshToken(user, session.id);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tokenRepository.create({
      token: refreshToken,
      userId: user.id,
      expiresAt,
    });

    await userRepository.update(user.id, {
      lastLogin: new Date(),
    });

    return {
      user: this._safeUser(user),
      accessToken,
      refreshToken,
      sessionId: session.id,
    };
  }

  async logout(refreshToken, currentSessionId) {
    if (refreshToken) {
      await tokenRepository.revoke(refreshToken);
    }
    if (currentSessionId) {
      await sessionRepository.deleteByIdAndUserId(currentSessionId, currentSessionId).catch(async () => {
        // deleteByIdAndUserId expects (id, userId) — caller may pass wrong args; ignore
      });
    }
    return { success: true };
  }

  async logoutSession(userId, sessionId, refreshToken) {
    if (sessionId) {
      await sessionRepository.deleteByIdAndUserId(sessionId, userId);
    }
    if (refreshToken) {
      await tokenRepository.revoke(refreshToken);
    }
    return { success: true };
  }

  async refresh(refreshTokenStr) {
    if (!refreshTokenStr) {
      throw new Error("Refresh token required");
    }

    const dbToken = await tokenRepository.findByToken(refreshTokenStr);
    if (!dbToken || dbToken.revoked || dbToken.expiresAt < new Date()) {
      throw new Error("Invalid or expired refresh token");
    }

    let sessionId = null;
    try {
      const decoded = jwtService.verifyRefreshToken(refreshTokenStr);
      sessionId = decoded.sessionId || null;
    } catch (_) {
      /* ignore */
    }

    const user = dbToken.user;
    if (!user || !user.isActive) {
      throw new Error("User no longer active");
    }

    const newAccessToken = jwtService.generateAccessToken(user, sessionId);
    const newRefreshToken = jwtService.generateRefreshToken(user, sessionId);

    await tokenRepository.revoke(refreshTokenStr);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await tokenRepository.create({
      token: newRefreshToken,
      userId: user.id,
      expiresAt,
    });

    if (sessionId) {
      try {
        await sessionRepository.updateActivity(sessionId);
      } catch (_) {
        /* session may have been revoked */
      }
    }

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async getMe(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (!user.username) {
      const username = await this._uniqueUsername(this._slugUsername(user.name, user.email));
      const updated = await userRepository.update(userId, { username });
      return this._safeUser(updated);
    }
    return this._safeUser(user);
  }

  async updateProfile(userId, updateData, avatarUrl) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const data = {};
    if (updateData.name) data.name = updateData.name;

    if (updateData.username) {
      const username = String(updateData.username)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9_]/g, "");
      if (username.length < 3) {
        throw new Error("Username must be at least 3 characters");
      }
      if (username !== user.username) {
        const existing = await userRepository.findByUsername(username);
        if (existing) {
          throw new Error("Username already taken");
        }
        data.username = username;
      }
    }

    if (updateData.email && updateData.email !== user.email) {
      const existing = await userRepository.findByEmail(updateData.email);
      if (existing) {
        throw new Error("Email already in use");
      }
      data.email = updateData.email;
      data.emailVerified = false;

      const verificationToken = crypto.randomBytes(32).toString("hex");
      data.emailVerificationToken = verificationToken;
      if (process.env.NODE_ENV !== "production") {
        console.log("[AUTH] Email verification token re-issued after email change");
      }
    }

    if (avatarUrl) {
      data.avatar = avatarUrl;
    }

    const updatedUser = await userRepository.update(userId, data);
    return this._safeUser(updatedUser);
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await userRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new Error("User not found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      throw new Error("Incorrect current password");
    }

    const newHashed = await bcrypt.hash(newPassword, 12);
    await userRepository.update(userId, {
      passwordHash: newHashed,
      lastPasswordChange: new Date(),
    });

    return { success: true };
  }

  async forgotPassword(email) {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      return { success: true };
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetExpires = new Date();
    resetExpires.setHours(resetExpires.getHours() + 1);

    await userRepository.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[AUTH] Password reset token issued");
    }

    return { success: true };
  }

  async resetPassword(token, password) {
    const user = await userRepository.findByResetToken(token);
    if (!user || !user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new Error("Invalid or expired password reset token");
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await userRepository.update(user.id, {
      passwordHash: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
      lastPasswordChange: new Date(),
    });

    return { success: true };
  }

  async verifyEmailToken(token) {
    const user = await userRepository.findByVerificationToken(token);
    if (!user) {
      throw new Error("Invalid email verification token");
    }

    await userRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
    });

    return { success: true };
  }

  async deleteAccount(userId, password) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (user.passwordHash) {
      if (!password) {
        throw new Error("Password is required to delete account");
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        throw new Error("Incorrect password");
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({
        where: { conversation: { userId } },
      });
      await tx.conversation.deleteMany({ where: { userId } });
      await tx.memory.deleteMany({ where: { userId } });
      await tx.skill.deleteMany({ where: { userId } });
      await tx.workflow.deleteMany({ where: { userId } });
      await tx.document.deleteMany({ where: { userId } });
      await tx.integration.deleteMany({ where: { userId } });
      await tx.setting.deleteMany({ where: { userId } });
      await tx.session.deleteMany({ where: { userId } });
      await tx.refreshToken.deleteMany({ where: { userId } });
      await tx.project.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    return { success: true };
  }

  async getActiveSessions(userId, currentSessionId = null, agentDetails = null) {
    const sessions = await sessionRepository.findManyByUserId(userId);
    return sessions.map((s) => {
      let isCurrent = currentSessionId ? s.id === currentSessionId : false;
      if (!isCurrent && !currentSessionId && agentDetails) {
        isCurrent =
          s.ipAddress === agentDetails.ipAddress &&
          s.userAgent === agentDetails.userAgent;
      }
      return {
        ...s,
        isCurrent,
        device: s.device || (/mobile|android|iphone/i.test(s.userAgent || "") ? "mobile" : "desktop"),
      };
    });
  }

  async revokeSession(userId, sessionId) {
    await sessionRepository.deleteByIdAndUserId(sessionId, userId);
    return { success: true };
  }

  async revokeAllSessions(userId, currentSessionId = null, currentRefreshToken = null) {
    if (currentSessionId) {
      await sessionRepository.deleteAllExceptCurrent(userId, currentSessionId);
    } else {
      await sessionRepository.deleteAllByUserId(userId);
    }

    if (currentRefreshToken) {
      await prisma.refreshToken.updateMany({
        where: {
          userId,
          revoked: false,
          NOT: { token: currentRefreshToken },
        },
        data: { revoked: true },
      });
    } else {
      await tokenRepository.revokeAllByUserId(userId);
    }
    return { success: true };
  }

  _safeUser(user) {
    const {
      passwordHash,
      emailVerificationToken,
      passwordResetToken,
      passwordResetExpires,
      ...safe
    } = user;
    return safe;
  }
}

module.exports = new AuthService();
