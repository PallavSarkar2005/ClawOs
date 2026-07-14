import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Sidebar from "../components/Sidebar";
import api from "../services/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Brain,
  MessageSquare,
  FolderGit2,
  FileText,
  GitBranch,
  Zap,
  Plus,
  ArrowRight,
  Clock,
  Compass,
  CheckCircle,
  Cpu,
  Search,
  Upload,
  AlertCircle,
  Activity,
  Terminal,
  Check,
  Server,
  RefreshCw
} from "lucide-react";
import { Avatar } from "../components/ui";

export default function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Data States
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const [stats, setStats] = useState(null);
  const [activities, setActivities] = useState([]);
  const [recentChats, setRecentChats] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [recentDocs, setRecentDocs] = useState([]);
  const [recentMemories, setRecentMemories] = useState([]);

  // Running tasks state simulator
  const [runningTask, setRunningTask] = useState({
    title: "Mapping Workspace Context Nodes",
    step: "Resolving virtual filesystem routes",
    progress: 24,
    eta: "42s"
  });

  const taskPool = [
    { title: "Analyzing Repository Structure", step: "Scanning configuration lockfiles", eta: "15s" },
    { title: "Indexing Vector Embeddings", step: "Generating content chunks & dimensions", eta: "28s" },
    { title: "Optimizing Context Workspace", step: "Re-indexing semantic memory blocks", eta: "10s" },
    { title: "Provisioning Developer Agent Sandbox", step: "Loading skill routing manifests", eta: "35s" }
  ];

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(false);

      // Fetch all endpoints concurrently
      const [statsRes, activityRes, chatsRes, projectsRes, docsRes, memoriesRes] = await Promise.allSettled([
        api.get("/dashboard/stats"),
        api.get("/dashboard/activity"),
        api.get("/chat"),
        api.get("/projects"),
        api.get("/documents"),
        api.get("/memory")
      ]);

      if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
      if (activityRes.status === "fulfilled") setActivities(activityRes.value.data || []);
      if (chatsRes.status === "fulfilled") setRecentChats(chatsRes.value.data?.slice(0, 3) || []);
      if (projectsRes.status === "fulfilled") setActiveProjects(projectsRes.value.data?.slice(0, 3) || []);
      if (docsRes.status === "fulfilled") setRecentDocs(docsRes.value.data?.slice(0, 3) || []);
      if (memoriesRes.status === "fulfilled") setRecentMemories(memoriesRes.value.data?.slice(0, 3) || []);

      // If all critical endpoints failed, report error
      const allFailed = [statsRes, activityRes, chatsRes, projectsRes, docsRes, memoriesRes].every(
        (res) => res.status === "rejected"
      );
      if (allFailed) {
        setError(true);
      }
    } catch (err) {
      console.error("Failed to load dashboard widgets", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Simulation logic for running tasks
    let poolIndex = 0;
    const interval = setInterval(() => {
      setRunningTask((prev) => {
        if (prev.progress >= 100) {
          poolIndex = (poolIndex + 1) % taskPool.length;
          return {
            ...taskPool[poolIndex],
            progress: 5
          };
        }
        const stepInc = Math.floor(Math.random() * 8) + 3;
        const currentEtaInt = parseInt(prev.eta);
        const nextEta = isNaN(currentEtaInt) ? "15s" : `${Math.max(2, currentEtaInt - 2)}s`;
        return {
          ...prev,
          progress: Math.min(100, prev.progress + stepInc),
          eta: nextEta
        };
      });
    }, 2800);

    return () => clearInterval(interval);
  }, [retryCount]);

  // Handle retry
  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  // Generate dynamic time-aware greetings
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  // Check if everything is completely empty for onboarding view
  const isWorkspaceEmpty =
    !loading &&
    recentChats.length === 0 &&
    activeProjects.length === 0 &&
    recentDocs.length === 0 &&
    recentMemories.length === 0;

  // Clean memory content rendering helper
  const parseMemoryContent = (rawContent) => {
    return rawContent
      .replace(/\[importance:\d+\]/, "")
      .replace(/\[tags:.*?\]/, "")
      .trim();
  };

  // Helper for activity icons
  const getActivityIcon = (type) => {
    switch (type) {
      case "document":
        return <FileText size={12} className="text-[#F49CC4]" />;
      case "memory":
        return <Brain size={12} className="text-emerald-400" />;
      case "project":
        return <FolderGit2 size={12} className="text-[#7CAADC]" />;
      case "chat":
        return <MessageSquare size={12} className="text-[#F15B42]" />;
      default:
        return <Activity size={12} className="text-purple-400" />;
    }
  };

  // Framer Motion Animation Configurations
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 100, damping: 15 }
    }
  };

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-sans relative">
      {/* Decorative Orbs */}
      <div className="absolute top-[-15%] left-[-15%] w-[50%] h-[50%] bg-[#7CAADC]/8 rounded-full pointer-events-none blur-[120px] z-0"></div>
      <div className="absolute bottom-[-15%] right-[-15%] w-[50%] h-[50%] bg-[#F49CC4]/10 rounded-full pointer-events-none blur-[120px] z-0"></div>
      <div className="absolute top-[40%] left-[30%] w-[35%] h-[35%] bg-[#F15B42]/5 rounded-full pointer-events-none blur-[120px] z-0"></div>

      <Sidebar />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto relative z-10 space-y-6">

        {/* Error State */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-400 text-xs font-semibold"
          >
            <div className="flex items-center gap-3">
              <AlertCircle size={16} className="text-red-400 shrink-0" />
              <div>
                <p className="font-bold text-white">Workspace synchronization failed</p>
                <p className="text-red-400/80 font-normal mt-0.5">
                  Database connections dropped. Verify your local PostgreSQL server status.
                </p>
              </div>
            </div>
            <button
              onClick={handleRetry}
              className="bg-red-500/20 hover:bg-red-500/30 text-white font-bold px-3 py-1.5 rounded-xl border border-red-500/30 transition flex items-center gap-1.5 self-end sm:self-auto shrink-0"
            >
              <RefreshCw size={12} className="animate-spin-slow" />
              <span>Retry connection</span>
            </button>
          </motion.div>
        )}

        {/* Loading Skeletons */}
        {loading ? (
          <div className="space-y-6 animate-pulse">
            {/* Welcome skeleton */}
            <div className="h-28 bg-[#1B2748]/30 rounded-3xl border border-white/5 p-6 flex items-center justify-between">
              <div className="flex items-center gap-4 w-2/3">
                <div className="w-12 h-12 bg-white/5 rounded-full"></div>
                <div className="space-y-2 w-full">
                  <div className="h-4 bg-white/10 rounded w-1/3"></div>
                  <div className="h-3 bg-white/5 rounded w-3/4"></div>
                </div>
              </div>
              <div className="w-32 h-9 bg-white/5 rounded-xl"></div>
            </div>

            {/* Quick Actions Grid skeleton */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-20 bg-[#1B2748]/20 rounded-2xl border border-white/5"></div>
              ))}
            </div>

            {/* Main Panel Layout skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 space-y-6">
                <div className="h-48 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                <div className="h-48 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="h-48 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                  <div className="h-48 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                </div>
              </div>
              <div className="lg:col-span-4 space-y-6">
                <div className="h-32 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                <div className="h-64 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                <div className="h-48 bg-[#1B2748]/20 rounded-3xl border border-white/5"></div>
                <div className="h-36 bg-[#1B2748]/20 rounded-2xl border border-white/5"></div>
              </div>
            </div>
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            {/* 1. Welcome Section */}
            <motion.div
              variants={cardVariants}
              className="glass p-6 rounded-3xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xl shadow-black/10 relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-[#F15B42]/5 rounded-full blur-2xl pointer-events-none"></div>
              <div className="flex items-center gap-4">
                <div className="relative group">
                  <Avatar name={user?.name || "Developer"} size="lg" className="ring-2 ring-[#F15B42]/20 scale-105" />
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 rounded-full border-2 border-[#0F172A] shadow-md animate-pulse"></span>
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
                    {getGreeting()}, {user?.name || "Developer"}
                  </h1>
                  <p className="text-slate-400 text-xs font-medium mt-1.5 max-w-xl leading-relaxed">
                    {stats ? (
                      <>
                        Workspace running in <span className="text-emerald-400 font-bold font-mono">active</span> mode. You have{" "}
                        <span className="text-[#7CAADC] font-bold font-mono">{stats.projectsCount || 0}</span> code {stats.projectsCount === 1 ? "project" : "projects"}, and{" "}
                        <span className="text-[#F49CC4] font-bold font-mono">{stats.docsCount || 0}</span> indexed vector {stats.docsCount === 1 ? "document" : "documents"}. Neural buffer contains{" "}
                        <span className="text-amber-400 font-bold font-mono">{stats.memoriesCount || 0}</span> semantic facts.
                      </>
                    ) : (
                      "Neural workspace nodes connected. Select a quick action to launch your developer terminal context."
                    )}
                  </p>
                </div>
              </div>

              {/* Continue where you left off */}
              {recentChats.length > 0 ? (
                <motion.button
                  whileHover={{ scale: 1.02, x: 2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/chat")}
                  className="bg-white/5 hover:bg-white/10 hover:border-white/20 border border-white/8 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2.5 self-stretch md:self-auto justify-center shadow-md shadow-black/10 shrink-0"
                >
                  <Clock size={14} className="text-[#7CAADC] animate-pulse" />
                  <div className="text-left">
                    <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold">Continue working</span>
                    <span className="block font-bold truncate max-w-[150px]">"{recentChats[0].title}"</span>
                  </div>
                  <ArrowRight size={14} className="text-slate-400 ml-1" />
                </motion.button>
              ) : (
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate("/chat")}
                  className="bg-gradient-to-r from-[#F15B42] to-[#F49CC4] hover:opacity-90 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 self-stretch md:self-auto justify-center shadow-lg shadow-[#F15B42]/10"
                >
                  <MessageSquare size={14} />
                  <span>Start New Session</span>
                </motion.button>
              )}
            </motion.div>

            {/* Empty Workspace Dashboard Onboarding state */}
            {isWorkspaceEmpty && (
              <motion.div
                variants={cardVariants}
                className="p-8 rounded-3xl bg-gradient-to-br from-[#1B2748]/30 via-[#24335F]/20 to-slate-900 border border-white/5 shadow-xl relative overflow-hidden"
              >
                <div className="absolute top-[-10%] right-[-10%] w-[30%] h-[30%] bg-[#7CAADC]/10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="max-w-2xl">
                  <div className="flex items-center gap-2 bg-[#F15B42]/10 border border-[#F15B42]/20 px-3 py-1 rounded-full text-[#F15B42] w-fit text-[10px] font-bold uppercase tracking-wider mb-4">
                    <Sparkles size={12} className="animate-spin-slow" />
                    <span>Workspace Initialization Guide</span>
                  </div>
                  <h2 className="text-lg font-bold text-white">Your mission control workspace is ready.</h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-xl leading-relaxed">
                    ClawOs is a developer-centric SaaS platform. Follow these easy steps to initialize context and start building projects:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                    <div className="p-4 bg-slate-950/20 rounded-2xl border border-white/5 space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-[#F15B42]/10 border border-[#F15B42]/20 flex items-center justify-center text-[#F15B42] font-bold text-xs">
                        1
                      </div>
                      <h4 className="text-xs font-bold text-white">Start Chat Thread</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Talk with the AI agent. Use commands to inspect, write, and execute code workspace variables.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-950/20 rounded-2xl border border-white/5 space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-[#7CAADC]/10 border border-[#7CAADC]/20 flex items-center justify-center text-[#7CAADC] font-bold text-xs">
                        2
                      </div>
                      <h4 className="text-xs font-bold text-white">Build Workspace Projects</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Provision virtual environments to keep track of source code repositories, branches, and commits.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-950/20 rounded-2xl border border-white/5 space-y-2">
                      <div className="w-8 h-8 rounded-xl bg-[#F49CC4]/10 border border-[#F49CC4]/20 flex items-center justify-center text-[#F49CC4] font-bold text-xs">
                        3
                      </div>
                      <h4 className="text-xs font-bold text-white">Ingest File Data</h4>
                      <p className="text-[10px] text-slate-500 leading-relaxed">
                        Upload workspace documents, PDF sheets or source logs to index them into vector database.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* 2. Quick Actions */}
            <motion.div variants={cardVariants} className="space-y-3">
              <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono">
                Command Terminal Actions
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
                {[
                  { label: "New Chat", path: "/chat", icon: <MessageSquare size={18} />, color: "text-[#F15B42]", bg: "bg-[#F15B42]/10", shadow: "hover:shadow-[#F15B42]/5", key: "⌘N" },
                  { label: "Build Project", path: "/projects", icon: <FolderGit2 size={18} />, color: "text-[#7CAADC]", bg: "bg-[#7CAADC]/10", shadow: "hover:shadow-[#7CAADC]/5", key: "⌘B" },
                  { label: "Upload Document", path: "/documents", icon: <FileText size={18} />, color: "text-[#F49CC4]", bg: "bg-[#F49CC4]/10", shadow: "hover:shadow-[#F49CC4]/5", key: "⌘U" },
                  { label: "Search Memory", path: "/memory", icon: <Brain size={18} />, color: "text-emerald-400", bg: "bg-emerald-400/10", shadow: "hover:shadow-emerald-400/5", key: "⌘M" },
                  { label: "Create Workflow", path: "/workflows", icon: <GitBranch size={18} />, color: "text-purple-400", bg: "bg-purple-400/10", shadow: "hover:shadow-purple-400/5", key: "⌘W" },
                  { label: "Install Skill", path: "/skills", icon: <Zap size={18} />, color: "text-amber-400", bg: "bg-amber-400/10", shadow: "hover:shadow-amber-400/5", key: "⌘S" },
                ].map((act, i) => (
                  <motion.button
                    key={i}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(act.path)}
                    className={`glass p-4 rounded-2xl border border-white/5 hover:border-white/15 transition-all duration-300 flex flex-col items-center justify-center text-center gap-3 relative overflow-hidden group cursor-pointer shadow-lg ${act.shadow}`}
                  >
                    <div className="absolute top-1 right-2 text-[8px] font-bold text-slate-600 font-mono tracking-tighter opacity-70 group-hover:opacity-100 transition-opacity">
                      {act.key}
                    </div>
                    <div className={`p-3 rounded-xl ${act.bg} ${act.color} group-hover:scale-110 transition duration-300 shadow-inner`}>
                      {act.icon}
                    </div>
                    <span className="text-[11px] font-bold text-slate-300 tracking-tight group-hover:text-white transition-colors">{act.label}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Main Panel Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

              {/* Left Column: Core productivity widgets */}
              <div className="lg:col-span-8 space-y-6">

                {/* 3. Recent Conversations */}
                <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                      <MessageSquare size={14} className="text-[#F15B42]" />
                      <span>Recent Conversation Threads</span>
                    </h3>
                    {recentChats.length > 0 && (
                      <span className="text-[9px] font-bold text-[#F15B42] bg-[#F15B42]/10 border border-[#F15B42]/15 px-2 py-0.5 rounded-full">
                        {stats?.conversationsCount || 0} Total
                      </span>
                    )}
                  </div>

                  {recentChats.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                      <div className="p-3 bg-white/5 rounded-full text-slate-400 mb-2">
                        <MessageSquare size={18} />
                      </div>
                      <p className="text-xs font-bold text-slate-300">No active threads</p>
                      <p className="text-[10px] text-slate-500 max-w-[240px] mt-1 leading-normal">
                        Initialize an AI session window to inspect your workspace data structures.
                      </p>
                      <button
                        onClick={() => navigate("/chat")}
                        className="mt-3 px-3.5 py-1.5 bg-[#F15B42]/10 hover:bg-[#F15B42]/20 border border-[#F15B42]/20 rounded-xl text-[10px] font-bold text-[#F15B42] transition flex items-center gap-1"
                      >
                        <Plus size={12} /> Start Session
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentChats.map((chat) => (
                        <div
                          key={chat.id}
                          onClick={() => navigate("/chat")}
                          className="p-3 bg-slate-950/20 hover:bg-[#1B2748]/35 rounded-2xl border border-white/5 hover:border-white/10 flex justify-between items-center cursor-pointer transition group shadow-sm"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="w-8 h-8 rounded-xl bg-[#F15B42]/5 border border-[#F15B42]/10 flex items-center justify-center shrink-0 text-[#F15B42]">
                              <MessageSquare size={14} />
                            </div>
                            <div className="truncate">
                              <span className="block text-xs font-bold text-slate-200 group-hover:text-white transition-colors truncate">
                                {chat.title}
                              </span>
                              <span className="block text-[9px] text-slate-500 font-medium mt-0.5">
                                Session ID: {chat.id.slice(0, 8)} • Active node thread
                              </span>
                            </div>
                          </div>
                          <button className="text-[9px] font-bold text-[#F15B42] hover:text-[#F49CC4] uppercase tracking-wider flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>Resume</span>
                            <ArrowRight size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>

                {/* 4. Active Projects */}
                <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                      <FolderGit2 size={14} className="text-[#7CAADC]" />
                      <span>Active Workspace Environments</span>
                    </h3>
                    {activeProjects.length > 0 && (
                      <span className="text-[9px] font-bold text-[#7CAADC] bg-[#7CAADC]/10 border border-[#7CAADC]/15 px-2 py-0.5 rounded-full">
                        {stats?.projectsCount || 0} Configured
                      </span>
                    )}
                  </div>

                  {activeProjects.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                      <div className="p-3 bg-white/5 rounded-full text-slate-400 mb-2">
                        <FolderGit2 size={18} />
                      </div>
                      <p className="text-xs font-bold text-slate-300">No active environments</p>
                      <p className="text-[10px] text-slate-500 max-w-[240px] mt-1 leading-normal">
                        Create a virtual repository mapping to run automated skill pipelines.
                      </p>
                      <button
                        onClick={() => navigate("/projects")}
                        className="mt-3 px-3.5 py-1.5 bg-[#7CAADC]/10 hover:bg-[#7CAADC]/20 border border-[#7CAADC]/20 rounded-xl text-[10px] font-bold text-[#7CAADC] transition flex items-center gap-1"
                      >
                        <Plus size={12} /> Create Project
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {activeProjects.map((p, idx) => {
                        // Dynamically mock workspace completeness percentage
                        const mockProgresses = [65, 80, 45];
                        const progress = mockProgresses[idx] || 50;
                        return (
                          <div
                            key={p.id}
                            className="p-4 bg-slate-950/20 hover:bg-[#1B2748]/25 rounded-2xl border border-white/5 hover:border-white/10 flex flex-col justify-between h-36 transition group"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="block text-xs font-extrabold text-white group-hover:text-[#7CAADC] transition-colors truncate max-w-[120px]">
                                  {p.name}
                                </span>
                                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">
                                  Healthy
                                </span>
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-slate-500 font-mono">
                                <GitBranch size={10} className="shrink-0" />
                                <span className="truncate">main</span>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-[9px] font-bold">
                                <span className="text-slate-500">Progress</span>
                                <span className="text-[#7CAADC]">{progress}%</span>
                              </div>
                              <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                                <motion.div
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progress}%` }}
                                  transition={{ duration: 0.8, ease: "easeOut" }}
                                  className="h-full bg-gradient-to-r from-[#7CAADC] to-[#F49CC4]"
                                ></motion.div>
                              </div>
                              <div className="flex justify-between items-center pt-1 border-t border-white/5 mt-1">
                                <span className="text-[8px] text-slate-500 font-mono">Build: OK</span>
                                <button
                                  onClick={() => navigate("/projects")}
                                  className="text-[9px] font-extrabold text-[#7CAADC] hover:text-white uppercase tracking-wider flex items-center gap-0.5"
                                >
                                  <span>Open</span>
                                  <ArrowRight size={10} />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>

                {/* Documents & Memory Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                  {/* 5. Documents Ingested */}
                  <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                        <FileText size={14} className="text-[#F49CC4]" />
                        <span>Ingested Vector Data</span>
                      </h3>
                      {recentDocs.length > 0 && (
                        <span className="text-[9px] font-bold text-[#F49CC4] bg-[#F49CC4]/10 border border-[#F49CC4]/15 px-2 py-0.5 rounded-full">
                          {stats?.docsCount || 0} Files
                        </span>
                      )}
                    </div>

                    {recentDocs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                        <div className="p-3 bg-white/5 rounded-full text-slate-400 mb-2">
                          <FileText size={16} />
                        </div>
                        <p className="text-xs font-bold text-slate-300">No vector files</p>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] leading-normal">
                          Context database is clear. Import documents to train agent.
                        </p>
                        <button
                          onClick={() => navigate("/documents")}
                          className="mt-3 px-3 py-1 bg-[#F49CC4]/10 hover:bg-[#F49CC4]/20 border border-[#F49CC4]/20 rounded-xl text-[10px] font-bold text-[#F49CC4] transition flex items-center gap-1"
                        >
                          <Upload size={10} /> Ingest File
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {recentDocs.map((doc) => (
                          <div
                            key={doc.id}
                            className="p-2.5 bg-slate-950/20 rounded-xl border border-white/5 flex justify-between items-center text-xs hover:border-white/10 transition"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <FileText size={12} className="text-[#F49CC4] shrink-0" />
                              <span className="text-slate-300 font-bold truncate max-w-[150px]">{doc.name}</span>
                            </div>
                            <span className="text-[8px] font-extrabold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase shrink-0">
                              Ready
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>

                  {/* 6. Semantic Memory */}
                  <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                    <div className="flex justify-between items-center">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                        <Brain size={14} className="text-emerald-400" />
                        <span>Semantic Memory</span>
                      </h3>
                      {stats && (
                        <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/15 px-2 py-0.5 rounded-full">
                          {stats.memoriesCount || 0} Facts
                        </span>
                      )}
                    </div>

                    {recentMemories.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                        <div className="p-3 bg-white/5 rounded-full text-slate-400 mb-2">
                          <Brain size={16} />
                        </div>
                        <p className="text-xs font-bold text-slate-300">Memory buffer empty</p>
                        <p className="text-[10px] text-slate-500 mt-1 max-w-[180px] leading-normal">
                          Agent memories synchronize automatically during conversations.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-2">
                          {recentMemories.slice(0, 2).map((m) => (
                            <div key={m.id} className="text-[10px] text-slate-400 leading-relaxed font-semibold bg-slate-950/10 p-2 rounded-xl border border-white/3 flex items-start gap-1.5">
                              <span className="text-[#F15B42] shrink-0">•</span>
                              <p className="truncate w-full">{parseMemoryContent(m.content)}</p>
                            </div>
                          ))}
                        </div>

                        {/* Search shortcut input */}
                        <div
                          onClick={() => navigate("/memory")}
                          className="group relative flex items-center bg-slate-950/40 border border-white/5 hover:border-white/12 px-3 py-2 rounded-xl text-slate-500 text-[10px] font-medium cursor-pointer transition shadow-inner"
                        >
                          <Search size={12} className="mr-2 text-slate-500 group-hover:text-slate-400 transition-colors" />
                          <span className="group-hover:text-slate-400 transition-colors">Query memory buffer...</span>
                          <span className="absolute right-3 px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-[8px] font-bold text-slate-600 font-mono tracking-widest">
                            /
                          </span>
                        </div>
                      </div>
                    )}
                  </motion.div>

                </div>

              </div>

              {/* Right Column: Status, monitoring, running tasks */}
              <div className="lg:col-span-4 space-y-6">

                {/* 8. Running Tasks */}
                <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                      <Cpu size={14} className="text-amber-400" />
                      <span>Active Agent Task</span>
                    </h3>
                    <span className="flex h-2 w-2 relative shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
                    </span>
                  </div>

                  <div className="space-y-4 bg-slate-950/45 p-4 rounded-2xl border border-white/5 relative overflow-hidden font-mono shadow-inner">
                    <div className="absolute top-0 left-0 h-[2px] bg-amber-400 animate-pulse w-full"></div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] text-slate-300 font-bold">
                        <span className="truncate max-w-[180px]">{runningTask.title}</span>
                        <span className="text-[#F15B42]">{runningTask.progress}%</span>
                      </div>

                      {/* Custom animating task bar */}
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden relative">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-[#F15B42] transition-all duration-500"
                          style={{ width: `${runningTask.progress}%` }}
                        ></div>
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:15px_15px] animate-[shimmer_2s_linear_infinite]"></div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-[9px] pt-1.5 border-t border-white/5">
                      <div className="flex justify-between">
                        <span className="text-slate-500">STEP:</span>
                        <span className="text-slate-300 font-semibold truncate max-w-[130px]">{runningTask.step}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">ESTIMATED COMP TIME:</span>
                        <span className="text-amber-400 font-bold">{runningTask.eta}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">SYSTEM AGENT ID:</span>
                        <span className="text-slate-400">kernel-proc-0x4f</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* 7. Activity Feed */}
                <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-4 shadow-lg">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                    <Activity size={14} className="text-purple-400" />
                    <span>Real-time Operations log</span>
                  </h3>

                  {activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-slate-500 text-xs font-semibold">
                      <Activity size={18} className="text-slate-600 mb-2" />
                      <span>No workspace node operations logged.</span>
                    </div>
                  ) : (
                    <div className="space-y-4 relative pl-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[1px] before:bg-white/5 max-h-[220px] overflow-y-auto pr-1">
                      {activities.slice(0, 5).map((act) => {
                        const relTime = new Date(act.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit"
                        });
                        return (
                          <div key={act.id} className="flex gap-3 items-start text-[10px] relative group">
                            <div className="w-4 h-4 rounded-full bg-slate-950/80 border border-white/8 flex items-center justify-center shrink-0 z-10 group-hover:border-purple-400 transition-colors">
                              {getActivityIcon(act.type)}
                            </div>
                            <div className="space-y-0.5 truncate">
                              <span className="text-slate-200 font-extrabold block group-hover:text-white transition-colors truncate max-w-[180px]">
                                {act.action}
                              </span>
                              <span className="text-slate-500 block truncate max-w-[180px]">
                                {act.details}
                              </span>
                              <span className="text-[8px] text-slate-600 font-mono block">
                                {relTime}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>

                {/* 9. AI Suggestions */}
                <motion.div variants={cardVariants} className="glass p-5 rounded-3xl border border-white/5 space-y-3 shadow-lg">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 font-mono">
                    <Compass size={14} className="text-emerald-400" />
                    <span>Personalized recommendations</span>
                  </h3>

                  <div className="space-y-2.5 text-[10px]">
                    <div className="p-3 bg-[#F15B42]/5 border border-[#F15B42]/10 hover:border-[#F15B42]/20 rounded-xl transition">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">Index sandbox workspace files</span>
                        <ArrowRight size={10} className="text-slate-500" />
                      </div>
                      <p className="text-slate-500 mt-1 leading-normal font-medium">
                        Upload document configurations context blocks to resolve vector routing errors during prompt checking.
                      </p>
                    </div>

                    <div className="p-3 bg-[#7CAADC]/5 border border-[#7CAADC]/10 hover:border-[#7CAADC]/20 rounded-xl transition">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white">Synchronize custom skills</span>
                        <ArrowRight size={10} className="text-slate-500" />
                      </div>
                      <p className="text-slate-500 mt-1 leading-normal font-medium">
                        Optimize API constraints by importing workspace routing skills stores inside developer settings.
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* 10. System Status (small card) */}
                <motion.div variants={cardVariants} className="glass p-4 rounded-2xl border border-white/5 space-y-3.5 shadow-lg relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-400/5 rounded-full blur-xl pointer-events-none"></div>

                  <div className="flex justify-between items-center">
                    <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider font-mono">
                      Kernel System Health
                    </span>
                    <span className="text-[8px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded font-mono uppercase tracking-widest">
                      Stable
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 text-[10px] font-bold">

                    <div className="flex justify-between items-center p-2 bg-slate-950/20 rounded-xl border border-white/3">
                      <div className="flex items-center gap-2">
                        <Server size={11} className="text-[#7CAADC]" />
                        <span className="text-slate-400">Provider</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 font-mono capitalize">{stats?.activeProvider || "openrouter"}</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40 animate-pulse-glow"></span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center p-2 bg-slate-950/20 rounded-xl border border-white/3">
                      <div className="flex items-center gap-2">
                        <Cpu size={11} className="text-[#F49CC4]" />
                        <span className="text-slate-400">Model Node</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 font-mono">
                          {stats?.activeProvider === "openai" ? "gpt-4o" : "claude-3.5-sonnet"}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40 animate-pulse-glow"></span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center p-2 bg-slate-950/20 rounded-xl border border-white/3">
                      <div className="flex items-center gap-2">
                        <Compass size={11} className="text-purple-400" />
                        <span className="text-slate-400">Web Context Search</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 font-mono">
                          {stats?.metrics?.webSearchStatus === "online" ? "Online" : "Offline"}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full shadow-sm animate-pulse-glow ${stats?.metrics?.webSearchStatus === "online" ? "bg-emerald-500 shadow-emerald-500/40" : "bg-red-500 shadow-red-500/40"
                          }`}></span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center p-2 bg-slate-950/20 rounded-xl border border-white/3">
                      <div className="flex items-center gap-2">
                        <Brain size={11} className="text-emerald-400" />
                        <span className="text-slate-400">Memory Sync</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 font-mono">Synchronized</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40 animate-pulse-glow"></span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center p-2 bg-slate-950/20 rounded-xl border border-white/3">
                      <div className="flex items-center gap-2">
                        <FileText size={11} className="text-amber-400" />
                        <span className="text-slate-400">Context Document indexing</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-slate-500 font-mono">Active</span>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/40 animate-pulse-glow"></span>
                      </div>
                    </div>

                  </div>
                </motion.div>

              </div>

            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
