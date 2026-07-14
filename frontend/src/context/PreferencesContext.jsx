import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getSettings, updateSettings as apiUpdateSettings } from "../api/settingsApi";
import { useAuth } from "./AuthContext";

const DEFAULT_APPEARANCE = {
  theme: "dark",
  accentColor: "#F15B42",
  layout: "comfortable",
  sidebarCollapsed: false,
  fontSize: "medium",
};

const DEFAULT_NOTIFICATIONS = {
  emailNotifications: true,
  aiTaskNotifications: true,
  workflowCompletion: true,
  securityAlerts: true,
  marketingEmails: false,
};

const DEFAULT_AI = {
  defaultProvider: "openrouter",
  defaultModel: "meta-llama/llama-3.3-70b-instruct",
  temperature: 0.7,
  maxContext: 20,
  maxTokens: 4096,
  autoMemorySave: true,
  autoSkillRouting: true,
  webSearchDefault: false,
  streamingEnabled: true,
};

export function applyAppearance(appearance) {
  if (!appearance || typeof document === "undefined") return;
  const root = document.documentElement;
  const accent = appearance.accentColor || DEFAULT_APPEARANCE.accentColor;
  root.style.setProperty("--accent", accent);
  root.style.setProperty("--accent-soft", `color-mix(in srgb, ${accent} 22%, transparent)`);
  root.style.setProperty("--accent-glow", `color-mix(in srgb, ${accent} 35%, transparent)`);
  root.dataset.theme = appearance.theme || "dark";
  root.dataset.density = appearance.layout || "comfortable";
  root.dataset.fontSize = appearance.fontSize || "medium";

  const sizeMap = { small: "14px", medium: "16px", large: "18px" };
  root.style.fontSize = sizeMap[appearance.fontSize] || "16px";

  let theme = appearance.theme || "dark";
  if (theme === "system") {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  root.classList.toggle("theme-light", theme === "light");
  root.classList.toggle("theme-dark", theme !== "light");
  root.classList.toggle("dark", theme !== "light");
  root.classList.toggle("light", theme === "light");

  if (typeof appearance.sidebarCollapsed === "boolean") {
    localStorage.setItem("clawos_sidebar_collapsed", String(appearance.sidebarCollapsed));
  }

  window.dispatchEvent(new CustomEvent("clawos-appearance", { detail: { ...appearance } }));
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const { user, isAuthenticated, showToast } = useAuth();
  const [loading, setLoading] = useState(true);
  const [ai, setAi] = useState(DEFAULT_AI);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [integrations, setIntegrations] = useState({});

  const hydrate = useCallback((data) => {
    if (!data) return;
    setAi({
      defaultProvider: data.defaultProvider ?? DEFAULT_AI.defaultProvider,
      defaultModel: data.defaultModel ?? DEFAULT_AI.defaultModel,
      temperature: data.temperature ?? DEFAULT_AI.temperature,
      maxContext: data.maxContext ?? DEFAULT_AI.maxContext,
      maxTokens: data.maxTokens ?? DEFAULT_AI.maxTokens,
      autoMemorySave: data.autoMemorySave ?? DEFAULT_AI.autoMemorySave,
      autoSkillRouting: data.autoSkillRouting ?? DEFAULT_AI.autoSkillRouting,
      webSearchDefault: data.webSearchDefault ?? DEFAULT_AI.webSearchDefault,
      streamingEnabled: data.streamingEnabled ?? DEFAULT_AI.streamingEnabled,
    });
    const nextAppearance = { ...DEFAULT_APPEARANCE, ...(data.appearance || {}) };
    setAppearance(nextAppearance);
    applyAppearance(nextAppearance);
    setNotifications({ ...DEFAULT_NOTIFICATIONS, ...(data.notifications || {}) });
    if (data.integrations) setIntegrations(data.integrations);
  }, []);

  const reload = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return null;
    }
    try {
      setLoading(true);
      const data = await getSettings();
      hydrate(data);
      return data;
    } catch (err) {
      console.error("Failed to load preferences", err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [hydrate, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    reload().catch(() => {});
  }, [isAuthenticated, user?.id, reload]);

  const persist = useCallback(
    async (payload, { toast, silent } = {}) => {
      const saved = await apiUpdateSettings(payload);
      hydrate(saved);
      if (!silent && toast) showToast(toast, "success");
      return saved;
    },
    [hydrate, showToast],
  );

  const value = useMemo(
    () => ({
      loading,
      ai,
      setAi,
      appearance,
      setAppearance,
      notifications,
      setNotifications,
      integrations,
      setIntegrations,
      reload,
      persist,
      applyAppearance,
      defaults: { ai: DEFAULT_AI, appearance: DEFAULT_APPEARANCE, notifications: DEFAULT_NOTIFICATIONS },
    }),
    [loading, ai, appearance, notifications, integrations, reload, persist],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used within PreferencesProvider");
  return ctx;
}
