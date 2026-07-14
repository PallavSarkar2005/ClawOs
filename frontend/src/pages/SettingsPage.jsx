import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../components/Sidebar";
import {
  connectIntegration,
  disconnectIntegration,
  testIntegration,
  exportAccountData,
  downloadConversations,
  exportMemories,
  deleteAllMemories,
  deleteAllConversations,
  deleteAllDocuments,
  clearCache,
  getSessions,
  revokeSession,
  revokeAllOtherSessions,
  getAiModels,
  downloadJson,
} from "../api/settingsApi";
import { useAuth } from "../context/AuthContext";
import { usePreferences, applyAppearance } from "../context/PreferencesContext";
import {
  User as UserIcon, Lock, Cpu, Monitor, Trash2, Upload, Save, Check,
  AlertTriangle, Eye, EyeOff, LogOut, Sliders, Brain, Bell, Palette,
  Database, Shield, Key, X, Laptop, Smartphone, Sun, Moon, Layout,
  Columns, CheckCircle, Link, Download, FileText, Loader, Info, RefreshCw, Zap
} from "lucide-react";

function SkeletonBlock({ className }) {
  return <div className={"skeleton rounded-xl " + (className || "")} />;
}
function SkeletonCard() {
  return (
    <div className="glass rounded-2xl p-6 space-y-4 border border-white/5">
      <SkeletonBlock className="h-4 w-1/3" />
      <SkeletonBlock className="h-3 w-2/3" />
      <SkeletonBlock className="h-10 w-full" />
      <SkeletonBlock className="h-10 w-full" />
    </div>
  );
}
function SectionHeader({ icon: Icon, title, subtitle, color }) {
  const c = color || "text-[var(--accent)]";
  return (
    <div className="flex items-start gap-3 pb-5 border-b border-white/5 mb-6">
      <div className={"p-2 rounded-xl bg-white/5 " + c}><Icon size={18} /></div>
      <div>
        <h2 className="text-white font-bold text-sm leading-tight">{title}</h2>
        {subtitle && <p className="text-slate-400 text-xs mt-0.5 leading-normal">{subtitle}</p>}
      </div>
    </div>
  );
}
function InputField({ label, type, value, onChange, disabled, placeholder, required, suffix, hint, error, id }) {
  const t = type || "text";
  const borderCls = error
    ? "border-red-500/60 focus:border-red-400 focus:ring-1 focus:ring-red-400/30"
    : "border-white/8 focus:border-[var(--accent)]/60 focus:ring-1 focus:ring-[var(--accent)]/20";
  return (
    <div>
      {label && <label htmlFor={id} className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</label>}
      <div className="relative">
        <input id={id} type={t} value={value} onChange={onChange} disabled={disabled}
          placeholder={placeholder} required={required} aria-invalid={!!error}
          className={"w-full px-4 py-3 rounded-xl text-sm transition-all outline-none bg-slate-950/50 border text-white placeholder-slate-600 " + borderCls + (disabled ? " opacity-40 cursor-not-allowed" : "") + (suffix ? " pr-12" : "")}
        />
        {suffix && <div className="absolute right-3 inset-y-0 flex items-center">{suffix}</div>}
      </div>
      {hint && !error && <p className="mt-1 text-[10px] text-slate-500">{hint}</p>}
      {error && <p className="mt-1 text-[10px] text-red-400">{error}</p>}
    </div>
  );
}
function Toggle({ checked, onChange, label, description, id, disabled }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="pr-8">
        <label htmlFor={id} className="text-sm font-medium text-white cursor-pointer">{label}</label>
        {description && <p className="text-xs text-slate-500 mt-0.5 leading-normal">{description}</p>}
      </div>
      <button id={id} role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
        className={(checked ? "bg-[var(--accent)]" : "bg-white/10 border border-white/10") + " relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-200 focus:outline-none disabled:opacity-50"}>
        <span className={(checked ? "left-6" : "left-1") + " absolute top-1 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-200"} />
      </button>
    </div>
  );
}
function SaveButton({ onClick, loading, dirty, label }) {
  const lbl = label || "Save Changes";
  return (
    <div className="sticky bottom-4 z-20 mt-4">
      <button type="button" onClick={onClick} disabled={loading || !dirty}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[var(--accent)] to-[#e04a31] text-white shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:-translate-y-0.5 disabled:hover:translate-y-0">
        {loading ? <><Loader size={16} className="animate-spin" /><span>Saving...</span></> : <><Save size={16} /><span>{lbl}</span></>}
      </button>
    </div>
  );
}
function DataActionCard({ icon: Icon, label, description, buttonLabel, buttonVariant, onClick, loading }) {
  const bv = buttonVariant || "ghost";
  const cls = bv === "danger" ? "bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20" : "bg-white/5 border border-white/8 text-white hover:bg-white/10";
  return (
    <div className="flex items-center justify-between py-3.5 gap-4">
      <div className="flex items-start gap-3">
        <Icon size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-white">{label}</p>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <button type="button" onClick={onClick} disabled={loading} className={"flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all " + cls}>
        {loading ? <Loader size={12} className="animate-spin" /> : buttonLabel}
      </button>
    </div>
  );
}

const TABS = [
  { id: "profile", label: "Profile", icon: UserIcon },
  { id: "security", label: "Security", icon: Lock },
  { id: "ai", label: "AI Settings", icon: Brain },
  { id: "sessions", label: "Sessions", icon: Monitor },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Link },
  { id: "data", label: "Data & Privacy", icon: Database },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,24}$/;

export default function SettingsPage({ defaultTab }) {
  const { user, updateProfile, changePassword, logout, deleteAccount, showToast } = useAuth();
  const prefs = usePreferences();
  const [activeTab, setActiveTab] = useState(defaultTab || "profile");
  const [loadError, setLoadError] = useState("");
  const [dirtyTabs, setDirtyTabs] = useState({});
  const markDirty = useCallback((tab) => setDirtyTabs((p) => ({ ...p, [tab]: true })), []);
  const clearDirty = useCallback((tab) => setDirtyTabs((p) => ({ ...p, [tab]: false })), []);
  const [persisting, setPersisting] = useState({});

  const [profileForm, setProfileForm] = useState({ name: "", email: "", username: "" });
  const [profileErrors, setProfileErrors] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef(null);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [showPwd, setShowPwd] = useState({ current: false, new: false, confirm: false, delete: false });
  const [savingPassword, setSavingPassword] = useState(false);
  const [pwdCriteria, setPwdCriteria] = useState({ length: false, uppercase: false, lowercase: false, number: false, special: false });
  const [strengthScore, setStrengthScore] = useState(0);

  const [aiDraft, setAiDraft] = useState(prefs.ai);
  const [savingAi, setSavingAi] = useState(false);
  const [providerModels, setProviderModels] = useState({});

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [intKeyInputs, setIntKeyInputs] = useState({});
  const [intBusy, setIntBusy] = useState({});
  const [dataLoading, setDataLoading] = useState({});

  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const validateProfile = useCallback(() => {
    const errors = {};
    if (!profileForm.name || profileForm.name.trim().length < 2) errors.name = "Name must be at least 2 characters";
    if (!EMAIL_RE.test(profileForm.email || "")) errors.email = "Enter a valid email address";
    if (!USERNAME_RE.test(profileForm.username || "")) errors.username = "3–24 chars: letters, numbers, underscore";
    setProfileErrors(errors);
    return Object.keys(errors).length === 0;
  }, [profileForm]);

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoadError("");
        const [data, modelsRes] = await Promise.all([
          prefs.reload(),
          getAiModels().catch(() => ({ models: {} })),
        ]);
        loadSessions().catch(() => {});
        if (data) setAiDraft({
          defaultProvider: data.defaultProvider,
          defaultModel: data.defaultModel,
          temperature: data.temperature,
          maxContext: data.maxContext,
          maxTokens: data.maxTokens,
          autoMemorySave: data.autoMemorySave,
          autoSkillRouting: data.autoSkillRouting,
          webSearchDefault: data.webSearchDefault,
          streamingEnabled: data.streamingEnabled,
        });
        if (modelsRes?.models) setProviderModels(modelsRes.models);
      } catch (err) {
        setLoadError(err.response?.data?.message || "Failed to load settings");
        showToast("Failed to load settings.", "error");
      }
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setAiDraft(prefs.ai);
  }, [prefs.ai]);

  useEffect(() => {
    if (user) {
      setProfileForm({
        name: user.name || "",
        email: user.email || "",
        username: user.username || "",
      });
      setAvatarPreview(user.avatar || "");
    }
  }, [user]);

  useEffect(() => {
    const pwd = passwordForm.newPassword;
    const c = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd),
    };
    setPwdCriteria(c);
    setStrengthScore(Object.values(c).filter(Boolean).length);
  }, [passwordForm.newPassword]);

  useEffect(() => {
    if (activeTab === "sessions") loadSessions();
  }, [activeTab]);

  useEffect(() => {
    const hasDirty = Object.values(dirtyTabs).some(Boolean);
    const handler = (e) => {
      if (hasDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirtyTabs]);

  const loadSessions = async () => {
    try {
      setLoadingSessions(true);
      const data = await getSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load sessions.", "error");
    } finally {
      setLoadingSessions(false);
    }
  };

  const persistToggle = async (key, payload, rollback) => {
    setPersisting((p) => ({ ...p, [key]: true }));
    try {
      await prefs.persist(payload, { toast: "Saved.", silent: false });
    } catch {
      if (rollback) rollback();
      showToast("Failed to save.", "error");
    } finally {
      setPersisting((p) => ({ ...p, [key]: false }));
    }
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please select an image file.", "error");
      return;
    }
    if (file.size > 5242880) {
      showToast("File must be under 5MB.", "error");
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    markDirty("profile");
  };

  const handleSaveProfile = async (e) => {
    e && e.preventDefault();
    if (!validateProfile()) {
      showToast("Fix validation errors before saving.", "error");
      return;
    }
    try {
      setSavingProfile(true);
      const fd = new FormData();
      fd.append("name", profileForm.name.trim());
      fd.append("email", profileForm.email.trim().toLowerCase());
      fd.append("username", profileForm.username.trim().toLowerCase());
      if (avatarFile) fd.append("avatar", avatarFile);
      await updateProfile(fd);
      setAvatarFile(null);
      clearDirty("profile");
    } catch {
      /* toast in context */
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSavePassword = async (e) => {
    e && e.preventDefault();
    if (!passwordForm.currentPassword) {
      showToast("Enter your current password.", "error");
      return;
    }
    if (strengthScore < 5) {
      showToast("New password must meet all requirements.", "error");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showToast("Passwords do not match.", "error");
      return;
    }
    try {
      setSavingPassword(true);
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword, passwordForm.confirmPassword);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      clearDirty("security");
    } catch {
      /* toast handled */
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveAiSettings = async () => {
    try {
      setSavingAi(true);
      await prefs.persist(aiDraft, { toast: "AI preferences saved." });
      clearDirty("ai");
    } catch {
      showToast("Failed to save.", "error");
    } finally {
      setSavingAi(false);
    }
  };

  const updateAiToggle = (field, value) => {
    const next = { ...aiDraft, [field]: value };
    const prev = aiDraft;
    setAiDraft(next);
    prefs.setAi(next);
    persistToggle("ai-" + field, { [field]: value }, () => {
      setAiDraft(prev);
      prefs.setAi(prev);
    });
  };

  const updateAppearance = (patch) => {
    const prev = prefs.appearance;
    const next = { ...prev, ...patch };
    prefs.setAppearance(next);
    applyAppearance(next);
    persistToggle("appearance", { appearance: next }, () => {
      prefs.setAppearance(prev);
      applyAppearance(prev);
    });
  };

  const updateNotification = (field, value) => {
    const prev = prefs.notifications;
    const next = { ...prev, [field]: value };
    prefs.setNotifications(next);
    persistToggle("notif-" + field, { notifications: next }, () => prefs.setNotifications(prev));
  };

  const handleRevokeSession = async (id, isCurrent) => {
    try {
      await revokeSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      showToast("Session revoked.", "success");
      if (isCurrent) await logout();
    } catch {
      showToast("Failed to revoke session.", "error");
    }
  };

  const handleRevokeAllSessions = async () => {
    try {
      await revokeAllOtherSessions();
      showToast("All other sessions revoked.", "success");
      loadSessions();
    } catch {
      showToast("Failed to revoke sessions.", "error");
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== "DELETE") return;
    if (!deletePassword) {
      showToast("Enter your password to confirm.", "error");
      return;
    }
    try {
      setDeleting(true);
      await deleteAccount(deleteConfirmation, deletePassword);
      setShowDeleteModal(false);
    } catch {
      /* toast handled */
    } finally {
      setDeleting(false);
    }
  };

  const handleDataAction = async (key, apiFn, successMsg) => {
    try {
      setDataLoading((p) => ({ ...p, [key]: true }));
      await apiFn();
      showToast(successMsg || "Done.", "success");
    } catch {
      showToast("Action failed.", "error");
    } finally {
      setDataLoading((p) => ({ ...p, [key]: false }));
    }
  };

  const handleConnectIntegration = async (name, apiKey) => {
    const prev = prefs.integrations[name];
    try {
      setIntBusy((p) => ({ ...p, [name]: true }));
      prefs.setIntegrations((p) => ({
        ...p,
        [name]: { status: "connected", maskedKey: "****…", keyHint: apiKey.slice(-4) },
      }));
      const res = await connectIntegration(name, apiKey);
      prefs.setIntegrations((p) => ({ ...p, [name]: res.integration }));
      setIntKeyInputs((p) => ({ ...p, [name]: "" }));
      showToast(name + " connected.", "success");
    } catch (err) {
      prefs.setIntegrations((p) => ({ ...p, [name]: prev || { status: "disconnected" } }));
      showToast(err.response?.data?.message || "Failed to connect " + name + ".", "error");
    } finally {
      setIntBusy((p) => ({ ...p, [name]: false }));
    }
  };

  const handleDisconnectIntegration = async (name) => {
    const prev = prefs.integrations[name];
    try {
      setIntBusy((p) => ({ ...p, [name]: true }));
      await disconnectIntegration(name);
      prefs.setIntegrations((p) => ({ ...p, [name]: { status: "disconnected", maskedKey: null, keyHint: null } }));
      showToast(name + " disconnected.", "success");
    } catch {
      prefs.setIntegrations((p) => ({ ...p, [name]: prev }));
      showToast("Failed to disconnect " + name + ".", "error");
    } finally {
      setIntBusy((p) => ({ ...p, [name]: false }));
    }
  };

  const handleTestIntegration = async (name) => {
    try {
      setIntBusy((p) => ({ ...p, [name + "_test"]: true }));
      const res = await testIntegration(name);
      if (res.integration) prefs.setIntegrations((p) => ({ ...p, [name]: res.integration }));
      showToast(name + " connection verified.", "success");
    } catch (err) {
      showToast(err.response?.data?.message || "Connection test failed.", "error");
    } finally {
      setIntBusy((p) => ({ ...p, [name + "_test"]: false }));
    }
  };

  const getStrengthLabel = () => {
    if (!passwordForm.newPassword) return { label: "Empty", color: "bg-slate-700/50", text: "text-slate-500" };
    const m = [
      null,
      { label: "Very Weak", color: "bg-red-500", text: "text-red-400" },
      { label: "Weak", color: "bg-orange-500", text: "text-orange-400" },
      { label: "Fair", color: "bg-yellow-500", text: "text-yellow-400" },
      { label: "Strong", color: "bg-indigo-500", text: "text-indigo-400" },
      { label: "Excellent", color: "bg-emerald-500", text: "text-emerald-400" },
    ];
    return m[strengthScore] || m[1];
  };

  const strength = getStrengthLabel();
  const providers = [
    { id: "openrouter", name: "OpenRouter", desc: "Access 200+ models via single API", icon: "🌐" },
    { id: "groq", name: "Groq LPU", desc: "Ultra-fast inference with Llama 3", icon: "⚡" },
    { id: "ollama", name: "Ollama Local", desc: "Private local inference", icon: "🏠" },
    { id: "openai", name: "OpenAI", desc: "GPT models via OpenAI API", icon: "🤖" },
    { id: "anthropic", name: "Anthropic", desc: "Claude models", icon: "🧠" },
  ];
  const accentColors = ["#F15B42", "#7CAADC", "#F49CC4", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4"];
  const integrationList = [
    { id: "openrouter", name: "OpenRouter", icon: "🌐" },
    { id: "openai", name: "OpenAI", icon: "🤖" },
    { id: "anthropic", name: "Anthropic", icon: "🧠" },
    { id: "groq", name: "Groq", icon: "⚡" },
    { id: "github", name: "GitHub", icon: "🐙" },
  ];
  const modelOptions = providerModels[aiDraft.defaultProvider] || [];
  const appearance = prefs.appearance;
  const notifications = prefs.notifications;
  const integrations = prefs.integrations;
  const globalLoading = prefs.loading && !aiDraft.defaultProvider;

  function renderTab() {
    if (globalLoading) return <div className="space-y-4"><SkeletonCard /><SkeletonCard /></div>;
    if (loadError) {
      return (
        <div className="glass rounded-2xl p-8 border border-red-500/20 text-center">
          <AlertTriangle className="mx-auto text-red-400 mb-3" size={28} />
          <p className="text-white font-semibold mb-1">Could not load settings</p>
          <p className="text-slate-400 text-sm mb-4">{loadError}</p>
          <button type="button" onClick={() => window.location.reload()} className="text-xs font-semibold px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white hover:bg-white/10">Retry</button>
        </div>
      );
    }

    switch (activeTab) {
      case "profile":
        return (
          <motion.div key="profile" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={UserIcon} title="Profile Information" subtitle="Update your public profile details." />
              <div className="flex items-center gap-5 mb-6 pb-6 border-b border-white/5">
                <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} aria-label="Upload avatar" onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}>
                  <div className="w-20 h-20 rounded-2xl border border-white/10 overflow-hidden bg-slate-950 flex items-center justify-center">
                    {avatarPreview ? <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" /> : <UserIcon size={28} className="text-slate-500" />}
                  </div>
                  <div className="absolute inset-0 rounded-2xl bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"><Upload size={16} className="text-white" /></div>
                  <input type="file" ref={fileInputRef} onChange={handleAvatarChange} accept="image/*" className="hidden" aria-label="Avatar file input" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Profile Photo</p>
                  <p className="text-xs text-slate-500 mt-0.5">PNG, JPG or GIF · Max 5MB</p>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs text-[var(--accent)] hover:underline font-medium mt-1">Upload new photo</button>
                </div>
              </div>
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField id="fullname" label="Full Name" value={profileForm.name} error={profileErrors.name} onChange={(e) => { setProfileForm((p) => ({ ...p, name: e.target.value })); markDirty("profile"); }} required />
                  <InputField id="email" label="Email Address" type="email" value={profileForm.email} error={profileErrors.email} onChange={(e) => { setProfileForm((p) => ({ ...p, email: e.target.value })); markDirty("profile"); }} required />
                  <InputField id="username" label="Username" value={profileForm.username} error={profileErrors.username} onChange={(e) => { setProfileForm((p) => ({ ...p, username: e.target.value })); markDirty("profile"); }} hint="Letters, numbers, underscore · 3–24 chars" required />
                  <div>
                    <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Verification</label>
                    <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-slate-950/50 border border-white/8 text-xs">
                      {user?.emailVerified
                        ? <><CheckCircle size={14} className="text-emerald-400" /><span className="text-emerald-400 font-medium">Email Verified</span></>
                        : <><span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" /><span className="text-amber-400 font-medium">Pending Verification</span></>}
                    </div>
                  </div>
                </div>
                <SaveButton onClick={handleSaveProfile} loading={savingProfile} dirty={!!dirtyTabs.profile} label="Save Profile" />
              </form>
            </div>
          </motion.div>
        );

      case "security":
        return (
          <motion.div key="security" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Lock} title="Change Password" subtitle="Use a strong password to protect your account." color="text-[#7CAADC]" />
              <form onSubmit={handleSavePassword} className="space-y-4">
                <InputField id="cur-pwd" label="Current Password" type={showPwd.current ? "text" : "password"} value={passwordForm.currentPassword} onChange={(e) => { setPasswordForm((p) => ({ ...p, currentPassword: e.target.value })); markDirty("security"); }} required suffix={<button type="button" onClick={() => setShowPwd((p) => ({ ...p, current: !p.current }))} className="text-slate-500 hover:text-slate-300">{showPwd.current ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />
                <div>
                  <InputField id="new-pwd" label="New Password" type={showPwd.new ? "text" : "password"} value={passwordForm.newPassword} onChange={(e) => { setPasswordForm((p) => ({ ...p, newPassword: e.target.value })); markDirty("security"); }} required suffix={<button type="button" onClick={() => setShowPwd((p) => ({ ...p, new: !p.new }))} className="text-slate-500 hover:text-slate-300">{showPwd.new ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />
                  {passwordForm.newPassword.length > 0 && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 bg-black/20 rounded-xl p-4 border border-white/5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Strength</span>
                        <span className={"text-[10px] font-bold " + strength.text}>{strength.label}</span>
                      </div>
                      <div className="flex gap-1 mb-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className={(i < strengthScore ? strength.color : "bg-white/8") + " h-1 flex-1 rounded-full transition-all duration-300"} />)}</div>
                      <div className="grid grid-cols-2 gap-y-1.5 text-[11px]">
                        {[[pwdCriteria.length, "8+ chars"], [pwdCriteria.uppercase, "Uppercase"], [pwdCriteria.lowercase, "Lowercase"], [pwdCriteria.number, "Number"], [pwdCriteria.special, "Special char"]].map(([met, lbl], i) => (
                          <div key={i} className="flex items-center gap-1.5">{met ? <Check size={11} className="text-emerald-400" /> : <X size={11} className="text-slate-600" />}<span className={met ? "text-slate-300" : "text-slate-600"}>{lbl}</span></div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
                <InputField id="conf-pwd" label="Confirm New Password" type={showPwd.confirm ? "text" : "password"} value={passwordForm.confirmPassword} onChange={(e) => { setPasswordForm((p) => ({ ...p, confirmPassword: e.target.value })); markDirty("security"); }} required error={passwordForm.confirmPassword && passwordForm.confirmPassword !== passwordForm.newPassword ? "Passwords do not match" : undefined} suffix={<button type="button" onClick={() => setShowPwd((p) => ({ ...p, confirm: !p.confirm }))} className="text-slate-500 hover:text-slate-300">{showPwd.confirm ? <EyeOff size={14} /> : <Eye size={14} />}</button>} />
                <motion.button whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} type="submit" disabled={savingPassword || strengthScore < 5 || !passwordForm.currentPassword}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-[#7CAADC] to-[#5a8ec4] text-white shadow-lg shadow-[#7CAADC]/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  {savingPassword ? <><Loader size={15} className="animate-spin" /><span>Updating...</span></> : <><Lock size={15} /><span>Update Password</span></>}
                </motion.button>
              </form>
            </div>
            <div className="glass rounded-2xl p-5 border border-white/5">
              <SectionHeader icon={Shield} title="Security Overview" color="text-emerald-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {[
                  { label: "Last Login", value: user?.lastLogin ? new Date(user.lastLogin).toLocaleString() : "First session" },
                  { label: "Password Last Changed", value: user?.lastPasswordChange ? new Date(user.lastPasswordChange).toLocaleString() : "Never changed" },
                ].map((item) => (
                  <div key={item.label} className="bg-black/20 rounded-xl p-4 border border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{item.label}</p>
                    <p className="text-sm font-medium text-slate-200 mt-1">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button type="button" onClick={() => logout()} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/8 text-white hover:bg-white/10 transition-all">
                  <LogOut size={14} /> Logout Current Session
                </button>
                <button type="button" onClick={handleRevokeAllSessions} className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 transition-all">
                  <Shield size={14} /> Logout All Other Sessions
                </button>
              </div>
            </div>
          </motion.div>
        );

      case "ai":
        return (
          <motion.div key="ai" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Cpu} title="AI Provider" subtitle="Select your default inference provider." />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {providers.map((prov) => {
                  const sel = aiDraft.defaultProvider === prov.id;
                  return (
                    <button type="button" key={prov.id} onClick={() => {
                      const models = providerModels[prov.id] || [];
                      const next = { ...aiDraft, defaultProvider: prov.id, defaultModel: models[0] || aiDraft.defaultModel };
                      setAiDraft(next);
                      markDirty("ai");
                    }}
                      className={(sel ? "bg-[var(--accent-soft)] border-[var(--accent)] shadow-lg" : "bg-white/3 border-white/8 hover:border-white/15") + " text-left p-4 rounded-xl border transition-all duration-200 hover:-translate-y-0.5"}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-lg">{prov.icon}</span>
                        <div className={(sel ? "border-[var(--accent)]" : "border-slate-600") + " w-4 h-4 rounded-full border flex items-center justify-center"}>{sel && <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />}</div>
                      </div>
                      <p className="text-sm font-bold text-white">{prov.name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-normal">{prov.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Sliders} title="Model Parameters" subtitle="Fine-tune inference behaviour." color="text-[#F49CC4]" />
              <div className="space-y-6">
                <div>
                  <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Default Model</label>
                  <select
                    value={aiDraft.defaultModel}
                    onChange={(e) => { setAiDraft((p) => ({ ...p, defaultModel: e.target.value })); markDirty("ai"); }}
                    className="w-full px-4 py-3 rounded-xl text-sm bg-slate-950/50 border border-white/8 text-white outline-none focus:border-[var(--accent)]/60"
                  >
                    {(modelOptions.length ? modelOptions : [aiDraft.defaultModel]).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2"><label className="text-sm font-medium text-white">Temperature</label><span className="text-sm font-bold text-[var(--accent)] tabular-nums">{aiDraft.temperature}</span></div>
                  <input type="range" min="0" max="2" step="0.1" value={aiDraft.temperature} onChange={(e) => { setAiDraft((p) => ({ ...p, temperature: Number(e.target.value) })); markDirty("ai"); }} className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/10" style={{ accentColor: "var(--accent)" }} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <InputField id="max-ctx" label="Context Window (messages)" type="number" value={aiDraft.maxContext} onChange={(e) => { setAiDraft((p) => ({ ...p, maxContext: Number(e.target.value) })); markDirty("ai"); }} />
                  <InputField id="max-tokens" label="Max Tokens" type="number" value={aiDraft.maxTokens} onChange={(e) => { setAiDraft((p) => ({ ...p, maxTokens: Number(e.target.value) })); markDirty("ai"); }} />
                </div>
              </div>
            </div>
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Brain} title="Autonomy & Behaviour" color="text-emerald-400" />
              <div className="divide-y divide-white/5">
                <Toggle id="auto-memory" label="Auto Memory Ingestion" description="Parse messages and store facts automatically." checked={aiDraft.autoMemorySave} disabled={!!persisting["ai-autoMemorySave"]} onChange={(v) => updateAiToggle("autoMemorySave", v)} />
                <Toggle id="skill-routing" label="Auto Skill Routing" description="Match intent to skills automatically." checked={aiDraft.autoSkillRouting} disabled={!!persisting["ai-autoSkillRouting"]} onChange={(v) => updateAiToggle("autoSkillRouting", v)} />
                <Toggle id="web-search" label="Enable Web Search" description="Allow real-time web search on prompts." checked={aiDraft.webSearchDefault} disabled={!!persisting["ai-webSearchDefault"]} onChange={(v) => updateAiToggle("webSearchDefault", v)} />
                <Toggle id="streaming" label="Streaming Responses" description="Stream AI tokens as they generate." checked={aiDraft.streamingEnabled} disabled={!!persisting["ai-streamingEnabled"]} onChange={(v) => updateAiToggle("streamingEnabled", v)} />
              </div>
            </div>
            <SaveButton onClick={handleSaveAiSettings} loading={savingAi} dirty={!!dirtyTabs.ai} label="Save AI Preferences" />
          </motion.div>
        );

      case "sessions":
        return (
          <motion.div key="sessions" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <div className="flex items-start justify-between pb-5 border-b border-white/5 mb-5 gap-3">
                <SectionHeader icon={Monitor} title="Active Sessions" subtitle="Devices currently signed in to your account." color="text-[#7CAADC]" />
                <div className="flex gap-2 flex-shrink-0 mt-1">
                  <button type="button" onClick={loadSessions} className="text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5">
                    <RefreshCw size={12} className={loadingSessions ? "animate-spin" : ""} /> Refresh
                  </button>
                  {sessions.filter((s) => !s.isCurrent).length > 0 && (
                    <button type="button" onClick={handleRevokeAllSessions} className="text-xs font-semibold text-red-400 hover:text-red-300 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg transition-all">Revoke All Others</button>
                  )}
                </div>
              </div>
              {loadingSessions ? (
                <div className="space-y-4">{[1, 2].map((i) => <div key={i} className="flex gap-4 items-center"><SkeletonBlock className="w-12 h-12 rounded-xl flex-shrink-0" /><div className="flex-1 space-y-2"><SkeletonBlock className="h-3 w-1/2" /><SkeletonBlock className="h-2.5 w-3/4" /></div></div>)}</div>
              ) : sessions.length === 0 ? (
                <div className="py-10 text-center text-slate-500 text-sm">No sessions found.</div>
              ) : (
                <div className="space-y-3">
                  {sessions.map((sess, i) => (
                    <motion.div key={sess.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.06 }} className="flex items-center gap-4 p-4 rounded-xl bg-white/3 border border-white/5 hover:border-white/10 transition-all">
                      <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-slate-400 flex-shrink-0">{sess.device === "mobile" ? <Smartphone size={18} /> : <Laptop size={18} />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-white truncate">{sess.os || "Unknown OS"} · {sess.browser || "Unknown Browser"}</span>
                          {sess.isCurrent && <span className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">Current</span>}
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span>{sess.ipAddress || "Unknown IP"}</span>
                          <span>·</span>
                          <span>Login {new Date(sess.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                      <button type="button" onClick={() => handleRevokeSession(sess.id, sess.isCurrent)} className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all flex-shrink-0" aria-label="Revoke session"><LogOut size={15} /></button>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        );

      case "appearance":
        return (
          <motion.div key="appearance" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Palette} title="Theme" subtitle="Changes apply immediately and save automatically." color="text-[#F49CC4]" />
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[{ id: "light", icon: Sun, label: "Light" }, { id: "dark", icon: Moon, label: "Dark" }, { id: "system", icon: Monitor, label: "System" }].map(({ id, icon: Icon, label }) => (
                  <button type="button" key={id} onClick={() => updateAppearance({ theme: id })} className={(appearance.theme === id ? "bg-[var(--accent-soft)] border-[var(--accent)]" : "bg-white/3 border-white/8 hover:border-white/15") + " flex flex-col items-center gap-2 p-4 rounded-xl border transition-all"}>
                    <Icon size={18} className={appearance.theme === id ? "text-[var(--accent)]" : "text-slate-400"} />
                    <span className={(appearance.theme === id ? "text-white" : "text-slate-400") + " text-xs font-medium"}>{label}</span>
                  </button>
                ))}
              </div>
              <div className="mb-6 pb-6 border-b border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Accent Color</p>
                <div className="flex gap-2 flex-wrap">{accentColors.map((c) => <button type="button" key={c} onClick={() => updateAppearance({ accentColor: c })} style={{ background: c }} className={(appearance.accentColor === c ? "border-white scale-110" : "border-transparent hover:scale-105") + " w-7 h-7 rounded-full transition-all border-2"} aria-label={"Accent " + c} />)}</div>
              </div>
              <div className="mb-4 pb-4 border-b border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Layout Density</p>
                <div className="grid grid-cols-2 gap-3">{[{ id: "comfortable", icon: Layout, label: "Comfortable" }, { id: "compact", icon: Columns, label: "Compact" }].map(({ id, icon: Icon, label }) => (
                  <button type="button" key={id} onClick={() => updateAppearance({ layout: id })} className={(appearance.layout === id ? "bg-[var(--accent-soft)] border-[var(--accent)]" : "bg-white/3 border-white/8 hover:border-white/15") + " flex items-center gap-3 p-3 rounded-xl border transition-all"}>
                    <Icon size={16} className={appearance.layout === id ? "text-[var(--accent)]" : "text-slate-400"} />
                    <span className={(appearance.layout === id ? "text-white" : "text-slate-400") + " text-sm font-medium"}>{label}</span>
                  </button>
                ))}</div>
              </div>
              <div className="mb-4 pb-4 border-b border-white/5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Font Size</p>
                <div className="grid grid-cols-3 gap-3">
                  {[{ id: "small", label: "Small" }, { id: "medium", label: "Medium" }, { id: "large", label: "Large" }].map(({ id, label }) => (
                    <button type="button" key={id} onClick={() => updateAppearance({ fontSize: id })} className={(appearance.fontSize === id ? "bg-[var(--accent-soft)] border-[var(--accent)] text-white" : "bg-white/3 border-white/8 text-slate-400 hover:border-white/15") + " py-2.5 rounded-xl border text-xs font-semibold transition-all"}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <Toggle id="sidebar-collapsed" label="Collapse Sidebar by Default" description="Start with sidebar minimized on every session." checked={!!appearance.sidebarCollapsed} disabled={!!persisting.appearance} onChange={(v) => updateAppearance({ sidebarCollapsed: v })} />
            </div>
          </motion.div>
        );

      case "notifications":
        return (
          <motion.div key="notifications" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Bell} title="Notification Preferences" subtitle="Toggles save automatically." color="text-amber-400" />
              <div className="divide-y divide-white/5">
                <Toggle id="email-notifs" label="Email Notifications" description="Receive important updates via email." checked={!!notifications.emailNotifications} disabled={!!persisting["notif-emailNotifications"]} onChange={(v) => updateNotification("emailNotifications", v)} />
                <Toggle id="workflow-notifs" label="Workflow Completion" description="Alert when a workflow finishes." checked={!!notifications.workflowCompletion} disabled={!!persisting["notif-workflowCompletion"]} onChange={(v) => updateNotification("workflowCompletion", v)} />
                <Toggle id="ai-task-notifs" label="AI Execution" description="Notify when long AI tasks complete." checked={!!notifications.aiTaskNotifications} disabled={!!persisting["notif-aiTaskNotifications"]} onChange={(v) => updateNotification("aiTaskNotifications", v)} />
                <Toggle id="security-alerts" label="Security Alerts" description="Alerts for suspicious account activity." checked={!!notifications.securityAlerts} disabled={!!persisting["notif-securityAlerts"]} onChange={(v) => updateNotification("securityAlerts", v)} />
                <Toggle id="marketing-emails" label="Marketing Emails" description="Product updates and offers." checked={!!notifications.marketingEmails} disabled={!!persisting["notif-marketingEmails"]} onChange={(v) => updateNotification("marketingEmails", v)} />
              </div>
            </div>
          </motion.div>
        );

      case "integrations":
        return (
          <motion.div key="integrations" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Link} title="Integrations" subtitle="API keys are encrypted at rest." color="text-cyan-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {integrationList.map(({ id, name, icon }) => {
                  const intData = integrations[id] || { status: "disconnected" };
                  const isConnected = intData.status === "connected";
                  return (
                    <IntegrationRow
                      key={id}
                      name={name}
                      icon={icon}
                      intData={intData}
                      isConnected={isConnected}
                      keyInput={intKeyInputs[id] || ""}
                      busy={!!intBusy[id]}
                      testing={!!intBusy[id + "_test"]}
                      onKeyChange={(v) => setIntKeyInputs((p) => ({ ...p, [id]: v }))}
                      onConnect={() => {
                        const key = (intKeyInputs[id] || "").trim();
                        if (key.length < 8) { showToast("Enter a valid API key.", "error"); return; }
                        handleConnectIntegration(id, key);
                      }}
                      onDisconnect={() => handleDisconnectIntegration(id)}
                      onTest={() => handleTestIntegration(id)}
                    />
                  );
                })}
              </div>
            </div>
          </motion.div>
        );

      case "data":
        return (
          <motion.div key="data" {...pageVariants} className="space-y-5">
            <div className="glass rounded-2xl p-6 border border-white/5">
              <SectionHeader icon={Database} title="Data & Privacy" subtitle="Export or permanently delete stored data." color="text-indigo-400" />
              <div className="divide-y divide-white/5">
                <DataActionCard icon={Download} label="Export Account Data" description="Download a full copy of your account data as JSON." buttonLabel="Export" loading={dataLoading.export} onClick={() => handleDataAction("export", async () => { downloadJson("clawos-export.json", await exportAccountData()); }, "Export downloaded.")} />
                <DataActionCard icon={FileText} label="Download Conversations" description="Export all chat conversations with messages." buttonLabel="Download" loading={dataLoading.conversationsDl} onClick={() => handleDataAction("conversationsDl", async () => { downloadJson("clawos-conversations.json", await downloadConversations()); }, "Conversations downloaded.")} />
                <DataActionCard icon={Brain} label="Export Memories" description="Download all stored memories as JSON." buttonLabel="Export" loading={dataLoading.memoriesExport} onClick={() => handleDataAction("memoriesExport", async () => { downloadJson("clawos-memories.json", await exportMemories()); }, "Memories exported.")} />
                <DataActionCard icon={Brain} label="Clear Memories" description="Permanently delete all stored memories." buttonLabel="Clear" buttonVariant="danger" loading={dataLoading.memories} onClick={() => { if (window.confirm("Delete all memories?")) handleDataAction("memories", () => deleteAllMemories(), "Memories deleted."); }} />
                <DataActionCard icon={Database} label="Delete Documents" description="Remove all uploaded documents." buttonLabel="Delete" buttonVariant="danger" loading={dataLoading.documents} onClick={() => { if (window.confirm("Delete all documents?")) handleDataAction("documents", () => deleteAllDocuments(), "Documents deleted."); }} />
                <DataActionCard icon={FileText} label="Delete Conversations" description="Permanently delete all chats." buttonLabel="Delete" buttonVariant="danger" loading={dataLoading.conversations} onClick={() => { if (window.confirm("Delete all conversations?")) handleDataAction("conversations", () => deleteAllConversations(), "Conversations deleted."); }} />
                <DataActionCard icon={Zap} label="Clear Cache" description="Clear temporary cached files." buttonLabel="Clear" loading={dataLoading.cache} onClick={() => handleDataAction("cache", () => clearCache(), "Cache cleared.")} />
              </div>
            </div>
          </motion.div>
        );

      case "danger":
        return (
          <motion.div key="danger" {...pageVariants} className="space-y-5">
            <div className="rounded-2xl p-6 border border-red-500/20 bg-red-950/10">
              <SectionHeader icon={AlertTriangle} title="Danger Zone" subtitle="Irreversible actions." color="text-red-400" />
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-red-500/10 rounded-xl text-red-400 flex-shrink-0"><Trash2 size={18} /></div>
                <div>
                  <h3 className="text-sm font-bold text-white">Delete Account</h3>
                  <p className="text-xs text-slate-400 mt-1 leading-normal max-w-lg">Permanently deletes your account and all associated data.</p>
                </div>
              </div>
              <button type="button" onClick={() => setShowDeleteModal(true)} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all"><Trash2 size={15} /><span>Delete My Account</span></button>
            </div>
          </motion.div>
        );

      default:
        return null;
    }
  }

  return (
    <div className="flex h-screen bg-[var(--page-bg)] text-[var(--page-fg)] overflow-hidden font-sans relative">
      <div className="orb orb-orange absolute top-[-15%] left-[-5%] w-[40%] h-[40%] pointer-events-none z-0" />
      <div className="orb orb-pink absolute bottom-[-15%] right-[-5%] w-[40%] h-[40%] pointer-events-none z-0" />
      <Sidebar />
      <div className="flex-1 overflow-hidden flex flex-col relative z-10">
        <div className="px-4 sm:px-6 pt-6 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between mb-6 gap-3">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2"><Sliders size={22} className="text-[var(--accent)]" />Settings</h1>
              <p className="text-slate-400 text-xs mt-1">Manage your account, preferences, and integrations.</p>
            </div>
            {Object.values(dirtyTabs).some(Boolean) && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                <Info size={13} />Unsaved changes
              </motion.div>
            )}
          </div>
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none border-b border-white/5" role="tablist">
            {TABS.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id;
              const isDanger = id === "danger";
              return (
                <button type="button" key={id} onClick={() => setActiveTab(id)} aria-selected={active} role="tab"
                  className={(active ? (isDanger ? "text-red-400" : "text-white") : (isDanger ? "text-red-500/60 hover:text-red-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/3")) + " relative flex items-center gap-2 px-3 sm:px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all rounded-t-lg"}>
                  <Icon size={13} /><span className="hidden sm:inline">{label}</span>
                  {active && <motion.div layoutId="tab-indicator" className={(isDanger ? "bg-red-400" : "bg-[var(--accent)]") + " absolute bottom-0 left-0 right-0 h-0.5 rounded-full"} />}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
          <div className="max-w-2xl">
            <AnimatePresence mode="wait">{renderTab()}</AnimatePresence>
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showDeleteModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={(e) => e.target === e.currentTarget && setShowDeleteModal(false)}>
            <motion.div initial={{ opacity: 0, scale: 0.93, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md glass-strong border border-red-500/30 rounded-2xl p-6 shadow-2xl" role="dialog" aria-modal="true">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-red-500/15 rounded-xl text-red-400"><AlertTriangle size={20} /></div>
                <div><h3 className="text-white font-bold text-base">Delete Account</h3><p className="text-slate-400 text-xs">Permanent and irreversible.</p></div>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Type <span className="font-bold text-white font-mono">DELETE</span></label>
                  <input type="text" value={deleteConfirmation} onChange={(e) => setDeleteConfirmation(e.target.value)} placeholder="DELETE" className="w-full px-4 py-3 rounded-xl bg-black/40 border border-white/10 focus:border-red-500/60 text-white text-center font-mono font-bold tracking-widest text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPwd.delete ? "text" : "password"} value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder="Current password" className="w-full px-4 py-3 pr-12 rounded-xl bg-black/40 border border-white/10 focus:border-red-500/60 text-white text-sm outline-none" />
                    <button type="button" onClick={() => setShowPwd((p) => ({ ...p, delete: !p.delete }))} className="absolute right-3 inset-y-0 text-slate-500 hover:text-slate-300">{showPwd.delete ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => { setShowDeleteModal(false); setDeleteConfirmation(""); setDeletePassword(""); }} className="flex-1 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white text-sm font-semibold">Cancel</button>
                  <button type="button" onClick={handleDeleteAccount} disabled={deleteConfirmation !== "DELETE" || !deletePassword || deleting} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-30 text-white text-sm font-semibold">
                    {deleting ? <><Loader size={14} className="animate-spin" /><span>Deleting...</span></> : <><Trash2 size={14} /><span>Delete Account</span></>}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function IntegrationRow({ name, icon, intData, isConnected, keyInput, busy, testing, onKeyChange, onConnect, onDisconnect, onTest }) {
  const [revealed, setRevealed] = useState(false);
  const displayKey = intData.maskedKey || (intData.keyHint ? `****${intData.keyHint}` : "");

  return (
    <div className="glass-subtle rounded-xl p-4 border border-white/5 hover:border-white/10 transition-all">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-lg">{icon}</div>
          <div>
            <p className="text-sm font-semibold text-white">{name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={"w-1.5 h-1.5 rounded-full " + (isConnected ? "bg-emerald-400" : "bg-slate-600")} />
              <span className={"text-[10px] font-medium " + (isConnected ? "text-emerald-400" : "text-slate-500")}>{isConnected ? "Connected" : "Not connected"}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-1.5">
          {isConnected && (
            <button type="button" onClick={onTest} disabled={testing || busy} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/5 text-slate-300 border border-white/8 hover:bg-white/10 disabled:opacity-50">
              {testing ? <Loader size={12} className="animate-spin" /> : "Test"}
            </button>
          )}
          <button type="button" onClick={isConnected ? onDisconnect : onConnect} disabled={busy}
            className={(isConnected ? "bg-white/5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 border border-white/5" : "bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20") + " text-xs font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"}>
            {busy ? <Loader size={12} className="animate-spin" /> : isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>
      </div>
      {isConnected && displayKey && (
        <div className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 mt-2">
          <Key size={12} className="text-slate-500 flex-shrink-0" />
          <code className="text-[11px] text-slate-400 font-mono flex-1 truncate">{revealed ? displayKey : "*".repeat(Math.min(displayKey.length || 12, 32))}</code>
          <button type="button" onClick={() => setRevealed((v) => !v)} className="text-slate-600 hover:text-slate-300">
            {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
          </button>
        </div>
      )}
      {!isConnected && (
        <input type="password" placeholder={name + " API key"} value={keyInput} onChange={(e) => onKeyChange(e.target.value)}
          className="w-full mt-2 px-3 py-2 text-xs rounded-lg bg-black/30 border border-white/8 text-white outline-none focus:border-[var(--accent)]/60 placeholder-slate-600"
          aria-label={name + " API key input"} />
      )}
      {isConnected && (
        <input type="password" placeholder={"Replace " + name + " API key"} value={keyInput} onChange={(e) => onKeyChange(e.target.value)}
          className="w-full mt-2 px-3 py-2 text-xs rounded-lg bg-black/30 border border-white/8 text-white outline-none focus:border-[var(--accent)]/60 placeholder-slate-600"
          aria-label={"Update " + name + " API key"} />
      )}
      {isConnected && keyInput && (
        <button type="button" onClick={onConnect} disabled={busy} className="w-full mt-2 text-xs font-semibold py-2 rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20 disabled:opacity-50">
          Update Key
        </button>
      )}
    </div>
  );
}
