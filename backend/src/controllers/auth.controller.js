const authService = require("../services/auth.service");
const sessionService = require("../services/session.service");
const {
  registerSchema,
  loginSchema,
  profileUpdateSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require("../validators/auth.validator");
const {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest,
} = require("../utils/cookies");

class AuthController {
  async register(req, res) {
    try {
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        const issues = result.error.issues || [];
        return res.status(400).json({
          message: issues[0]?.message || "Validation failed",
          errors: issues.map((i) => ({
            path: i.path?.join(".") || "",
            message: i.message,
          })),
        });
      }

      const { name, email, password } = result.data;
      const user = await authService.register(name, email, password);

      res.status(201).json({
        success: true,
        message: "Registration successful. Please verify your email.",
        user,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async login(req, res) {
    try {
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        const issues = result.error.issues || [];
        return res.status(400).json({
          message: issues[0]?.message || "Validation failed",
          errors: issues.map((i) => ({
            path: i.path?.join(".") || "",
            message: i.message,
          })),
        });
      }

      const { email, password, rememberMe } = result.data;
      const agentDetails = sessionService.parseRequest(req);

      const { user, accessToken, refreshToken } = await authService.login(
        email,
        password,
        agentDetails,
      );

      setAuthCookies(res, {
        accessToken,
        refreshToken,
        rememberMe: rememberMe !== false,
      });

      // Tokens stay in HttpOnly cookies only — never returned to JS
      res.json({
        success: true,
        user,
      });
    } catch (error) {
      res.status(401).json({ message: error.message });
    }
  }

  async logout(req, res) {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      const sessionId = req.user?.sessionId;

      await authService.logoutSession(req.user.id, sessionId, refreshToken);
      clearAuthCookies(res);

      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      clearAuthCookies(res);
      res.status(500).json({ message: "Logout failed" });
    }
  }

  async logoutEverywhere(req, res) {
    try {
      await authService.revokeAllSessions(req.user.id, null, null);
      clearAuthCookies(res);
      res.json({ success: true, message: "Logged out from all devices" });
    } catch (error) {
      res.status(500).json({ message: "Logout everywhere failed" });
    }
  }

  async refresh(req, res) {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);

      const tokens = await authService.refresh(refreshToken);

      setAuthCookies(res, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        rememberMe: true,
      });

      res.json({
        success: true,
      });
    } catch (error) {
      clearAuthCookies(res);
      res.status(401).json({ message: error.message });
    }
  }

  async me(req, res) {
    try {
      const user = await authService.getMe(req.user.id);
      res.json(user);
    } catch (error) {
      res.status(404).json({ message: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const result = profileUpdateSchema.safeParse(req.body);
      if (!result.success) {
        const issues = result.error.issues || [];
        return res.status(400).json({
          message: issues[0]?.message || "Invalid profile data",
          errors: issues.map((i) => ({
            path: i.path?.join(".") || "",
            message: i.message,
          })),
        });
      }

      let avatarUrl = undefined;
      if (req.file) {
        avatarUrl = `/uploads/${req.file.filename}`;
      }

      const updatedUser = await authService.updateProfile(
        req.user.id,
        result.data,
        avatarUrl,
      );

      res.json({
        success: true,
        message: "Profile updated successfully",
        user: updatedUser,
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async changePassword(req, res) {
    try {
      const result = changePasswordSchema.safeParse(req.body);
      if (!result.success) {
        const issues = result.error.issues || [];
        return res.status(400).json({
          message: issues[0]?.message || "Validation failed",
          errors: issues.map((i) => ({
            path: i.path?.join(".") || "",
            message: i.message,
          })),
        });
      }

      const { currentPassword, newPassword } = result.data;
      await authService.changePassword(req.user.id, currentPassword, newPassword);

      // Invalidate other sessions after password change
      await authService.revokeAllSessions(
        req.user.id,
        req.user.sessionId,
        getRefreshTokenFromRequest(req),
      );

      res.json({
        success: true,
        message: "Password changed successfully",
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async forgotPassword(req, res) {
    try {
      const result = forgotPasswordSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: result.error.issues?.[0]?.message || "Validation failed",
        });
      }

      await authService.forgotPassword(result.data.email);
      res.json({
        success: true,
        message: "If the email exists, a password reset link has been generated.",
      });
    } catch (error) {
      res.status(500).json({ message: "Server Error" });
    }
  }

  async resetPassword(req, res) {
    try {
      const result = resetPasswordSchema.safeParse(req.body);
      if (!result.success) {
        const issues = result.error.issues || [];
        return res.status(400).json({
          message: issues[0]?.message || "Validation failed",
          errors: issues.map((i) => ({
            path: i.path?.join(".") || "",
            message: i.message,
          })),
        });
      }

      const { token, password } = result.data;
      await authService.resetPassword(token, password);

      res.json({
        success: true,
        message: "Password reset successful.",
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async verifyEmail(req, res) {
    try {
      const token = req.query.token || req.body.token;
      if (!token) {
        return res.status(400).json({ message: "Verification token is required" });
      }

      await authService.verifyEmailToken(token);
      res.json({
        success: true,
        message: "Email verified successfully.",
      });
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  }

  async deleteAccount(req, res) {
    try {
      const { confirmText, password } = req.body;
      if (confirmText !== "DELETE") {
        return res.status(400).json({ message: 'Must type "DELETE" to confirm' });
      }

      await authService.deleteAccount(req.user.id, password);
      clearAuthCookies(res);
      res.json({
        success: true,
        message: "Account deleted permanently.",
      });
    } catch (error) {
      res.status(400).json({ message: error.message || "Account deletion failed" });
    }
  }

  async getSessions(req, res) {
    try {
      const agentDetails = sessionService.parseRequest(req);
      const sessions = await authService.getActiveSessions(
        req.user.id,
        req.user.sessionId,
        agentDetails,
      );
      res.json(sessions);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  }

  async revokeSession(req, res) {
    try {
      const { sessionId } = req.params;
      await authService.revokeSession(req.user.id, sessionId);
      res.json({ success: true, message: "Session revoked successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke session" });
    }
  }

  async revokeAllSessions(req, res) {
    try {
      const refreshToken = getRefreshTokenFromRequest(req);
      await authService.revokeAllSessions(req.user.id, req.user.sessionId, refreshToken);
      res.json({ success: true, message: "All other sessions revoked successfully" });
    } catch (error) {
      res.status(500).json({ message: "Failed to revoke sessions" });
    }
  }
}

module.exports = new AuthController();
