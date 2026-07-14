import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "../services/api";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  // Toast Helper
  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const login = async (email, password, rememberMe = false) => {
    try {
      const response = await api.post("/auth/login", {
        email,
        password,
        rememberMe,
      });

      const { accessToken, refreshToken, user: loggedUser } = response.data;

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);

      setUser(loggedUser);
      showToast("Access granted. Initializing session...", "success");
      return loggedUser;
    } catch (error) {
      const msg = error.response?.data?.message || "Invalid credentials. Try again.";
      showToast(msg, "error");
      throw error;
    }
  };

  const register = async (name, email, password, confirmPassword, acceptTerms) => {
    try {
      const response = await api.post("/auth/register", {
        name,
        email,
        password,
        confirmPassword,
        acceptTerms,
      });
      showToast("Node profile registered. Verification required.", "success");
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Registration failed.";
      showToast(msg, "error");
      throw error;
    }
  };

  const logout = useCallback(async () => {
    try {
      const token = localStorage.getItem("refreshToken");
      await api.post("/auth/logout", { refreshToken: token });
    } catch (error) {
      console.warn("Logout request failed, cleaning local state anyway", error);
    } finally {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
      showToast("Core session terminated.", "info");
    }
  }, [showToast]);

  const updateProfile = async (formData) => {
    try {
      const response = await api.put("/auth/profile", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setUser(response.data.user);
      showToast("Profile configuration updated.", "success");
      return response.data.user;
    } catch (error) {
      const msg = error.response?.data?.message || "Profile update failed.";
      showToast(msg, "error");
      throw error;
    }
  };

  const changePassword = async (currentPassword, newPassword, confirmPassword) => {
    try {
      await api.put("/auth/change-password", {
        currentPassword,
        newPassword,
        confirmPassword,
      });
      showToast("Security credentials updated successfully.", "success");
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to update credentials.";
      showToast(msg, "error");
      throw error;
    }
  };

  const forgotPassword = async (email) => {
    try {
      const response = await api.post("/auth/forgot-password", { email });
      showToast("Recovery instructions dispatched if the account exists.", "success");
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Recovery request failed.";
      showToast(msg, "error");
      throw error;
    }
  };

  const resetPassword = async (token, password, confirmPassword) => {
    try {
      const response = await api.post("/auth/reset-password", {
        token,
        password,
        confirmPassword,
      });
      showToast("Credentials reset successful. Access unlocked.", "success");
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to reset password.";
      showToast(msg, "error");
      throw error;
    }
  };

  const verifyEmail = async (token) => {
    try {
      const response = await api.get(`/auth/verify-email?token=${token}`);
      showToast("Email address verified successfully.", "success");
      if (user) {
        setUser((prev) => (prev ? { ...prev, emailVerified: true } : null));
      }
      return response.data;
    } catch (error) {
      const msg = error.response?.data?.message || "Verification link invalid or expired.";
      showToast(msg, "error");
      throw error;
    }
  };

  const deleteAccount = async (confirmText, password) => {
    try {
      await api.delete("/auth/account", { data: { confirmText, password } });
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
      showToast("Account deleted permanently.", "info");
    } catch (error) {
      const msg = error.response?.data?.message || "Account deletion failed.";
      showToast(msg, "error");
      throw error;
    }
  };

  const fetchUser = useCallback(async () => {
    try {
      const token = localStorage.getItem("accessToken");
      if (!token) {
        setLoading(false);
        return;
      }
      const response = await api.get("/auth/me");
      setUser(response.data);
    } catch (error) {
      console.warn("Auto login check failed");
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen to JWT expiration notifications from Axios Interceptor
  useEffect(() => {
    const handleAuthExpired = () => {
      setUser(null);
      showToast("Session expired. Please log in again.", "warning");
    };

    window.addEventListener("auth-expired", handleAuthExpired);
    fetchUser();

    return () => {
      window.removeEventListener("auth-expired", handleAuthExpired);
    };
  }, [fetchUser, showToast]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
        forgotPassword,
        resetPassword,
        verifyEmail,
        deleteAccount,
        isAuthenticated: !!user,
        toasts,
        showToast,
        removeToast,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
