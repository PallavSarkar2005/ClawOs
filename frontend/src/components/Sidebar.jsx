import { useState, useEffect } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  MessageSquare,
  Brain,
  FileText,
  GitBranch,
  Settings,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LogOut,
  Plus,
  Zap,
  FolderGit2,
  Pin,
  PinOff,
  Search,
  Star,
  Activity,
  Bot,
  Trash2,
  X
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";
import { Avatar, Tooltip } from "./ui";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", to: "/dashboard", color: "text-[#7CAADC]" },
  { icon: MessageSquare, label: "AI Chat", to: "/chat", color: "text-[#F15B42]" },
  { icon: FolderGit2, label: "Workspaces", to: "/projects", color: "text-[#F49CC4]" },
  { icon: Brain, label: "Memory Node", to: "/memory", color: "text-emerald-400" },
  { icon: FileText, label: "Documents", to: "/documents", color: "text-amber-400" },
  { icon: GitBranch, label: "Workflows", to: "/workflows", color: "text-purple-400" },
  { icon: Activity, label: "Observability", to: "/observability", color: "text-sky-400" },
  { icon: Bot, label: "Autonomy", to: "/autonomy", color: "text-emerald-400" },
  { icon: Zap, label: "Skills Hub", to: "/skills", color: "text-cyan-400" },
];

export default function Sidebar({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewChat,
  onDelete
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Collapsed state
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("clawos_sidebar_collapsed");
    return saved === "true";
  });

  useEffect(() => {
    const syncCollapsed = (value) => {
      if (typeof value === "boolean") setCollapsed(value);
    };
    const onAppear = (e) => syncCollapsed(e.detail?.sidebarCollapsed);
    const onStorage = (e) => {
      if (e.key === "clawos_sidebar_collapsed") syncCollapsed(e.newValue === "true");
    };
    window.addEventListener("clawos-appearance", onAppear);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("clawos-appearance", onAppear);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Sidebar drag width
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem("clawos_sidebar_width");
    return saved ? parseInt(saved) : 240;
  });

  const [isResizing, setIsResizing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Stats & Dynamic Content Lists (local state fallbacks)
  const [stats, setStats] = useState(null);
  const [chats, setChats] = useState([]);
  const [projects, setProjects] = useState([]);

  // Pinned/Favorites lists
  const [pinnedChats, setPinnedChats] = useState(() => {
    try {
      const saved = localStorage.getItem("clawos_pinned_chats");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [pinnedProjects, setPinnedProjects] = useState(() => {
    try {
      const saved = localStorage.getItem("clawos_pinned_projects");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const loadData = async () => {
    try {
      const [statsRes, chatsRes, projectsRes] = await Promise.allSettled([
        api.get("/dashboard/stats"),
        api.get("/chat"),
        api.get("/projects")
      ]);
      if (statsRes.status === "fulfilled") setStats(statsRes.value.data);
      if (chatsRes.status === "fulfilled") setChats(chatsRes.value.data || []);
      if (projectsRes.status === "fulfilled") setProjects(projectsRes.value.data || []);
    } catch (err) {
      console.error("Failed to sync sidebar data nodes", err);
    }
  };

  useEffect(() => {
    loadData();
    // Refresh stats periodically
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const startResizing = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizing) return;
      const newWidth = e.clientX;
      if (newWidth >= 200 && newWidth <= 420) {
        setWidth(newWidth);
        localStorage.setItem("clawos_sidebar_width", newWidth.toString());
      }
    };
    const handleMouseUp = () => {
      setIsResizing(false);
    };
    if (isResizing) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Global hotkeys (Ctrl+B / Cmd+B)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setCollapsed((prev) => {
          const next = !prev;
          localStorage.setItem("clawos_sidebar_collapsed", next.toString());
          return next;
        });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Pins logic
  const togglePinChat = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setPinnedChats((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("clawos_pinned_chats", JSON.stringify(next));
      return next;
    });
  };

  const togglePinProject = (e, id) => {
    e.preventDefault();
    e.stopPropagation();
    setPinnedProjects((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      localStorage.setItem("clawos_pinned_projects", JSON.stringify(next));
      return next;
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const queryLower = searchQuery.toLowerCase();

  // Resolve conversations list from props or local fallback
  const displayChats = conversations !== undefined ? conversations : chats;

  const filteredPinnedChats = displayChats.filter(
    (c) => pinnedChats.includes(c.id) && c.title.toLowerCase().includes(queryLower)
  );
  const filteredRecentChats = displayChats.filter(
    (c) => !pinnedChats.includes(c.id) && c.title.toLowerCase().includes(queryLower)
  );

  const filteredPinnedProjects = projects.filter(
    (p) => pinnedProjects.includes(p.id) && p.name.toLowerCase().includes(queryLower)
  );
  const filteredRecentProjects = projects.filter(
    (p) => !pinnedProjects.includes(p.id) && p.name.toLowerCase().includes(queryLower)
  );

  const getBadgeValue = (to) => {
    if (!stats) return null;
    switch (to) {
      case "/chat":
        return displayChats.length || stats.conversationsCount || null;
      case "/projects":
        return stats.projectsCount || null;
      case "/memory":
        return stats.memoriesCount || null;
      case "/documents":
        return stats.docsCount || null;
      case "/skills":
        return stats.skillsCount || null;
      default:
        return null;
    }
  };

  const handleChatSelect = (chat) => {
    if (onSelectConversation) {
      onSelectConversation(chat);
    } else {
      navigate("/chat");
    }
  };

  const handleNewChatAction = () => {
    if (onNewChat) {
      onNewChat();
    } else {
      navigate("/chat");
    }
  };

  const handleChatDelete = (chatId, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDelete) {
      onDelete(chatId);
    } else {
      // Local fallback deletion via API
      api.delete(`/chat/${chatId}`)
        .then(() => loadData())
        .catch(err => console.error("Failed to delete chat", err));
    }
  };

  return (
    <div className="flex h-full flex-shrink-0 relative select-none">
      <motion.aside
        animate={{ width: collapsed ? 68 : width }}
        transition={isResizing ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="h-full flex flex-col relative overflow-hidden bg-[#070A13]/95 backdrop-blur-xl border-r border-white/[0.04] z-20"
      >
        {/* Glow Header Accent Line */}
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#F15B42]/25 to-transparent"></div>

        {/* 1. Header Logo Block */}
        <div className="flex items-center justify-between h-14 px-4 flex-shrink-0 border-b border-white/[0.03]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] flex items-center justify-center shadow-lg shadow-[#F15B42]/15 shrink-0">
              <Sparkles size={14} className="text-white" />
            </div>
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.15 }}
                  className="min-w-0"
                >
                  <div className="text-white font-black text-[13px] tracking-wider leading-none">
                    Claw<span className="text-[#F15B42]">OS</span>
                  </div>
                  <span className="text-[8px] text-slate-500 font-bold tracking-widest mt-1 block leading-none">
                    OPERATING KERNEL
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!collapsed && (
            <button
              onClick={() => {
                setCollapsed(true);
                localStorage.setItem("clawos_sidebar_collapsed", "true");
              }}
              className="text-slate-500 hover:text-slate-200 transition-colors p-1.5 hover:bg-white/[0.04] rounded-lg animate-in fade-in"
              title="Collapse (Ctrl+B)"
            >
              <ChevronLeft size={13} />
            </button>
          )}
        </div>

        {/* 2. New Thread Quick Button */}
        <div className="px-3 pt-3 pb-1.5 flex-shrink-0">
          {collapsed ? (
            <Tooltip label="New Chat Thread" side="right">
              <button
                onClick={handleNewChatAction}
                className="w-full flex items-center justify-center h-9 rounded-xl bg-[#F15B42]/10 border border-[#F15B42]/15 text-[#F15B42] hover:bg-[#F15B42]/15 transition-all duration-200"
              >
                <Plus size={16} />
              </button>
            </Tooltip>
          ) : (
            <button
              onClick={handleNewChatAction}
              className="w-full flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-[#F15B42]/10 hover:bg-[#F15B42]/15 border border-[#F15B42]/15 text-[#F15B42] transition-all duration-200 text-[11px] font-extrabold uppercase tracking-widest shadow-sm"
            >
              <Plus size={12} className="shrink-0" />
              <span>New Thread</span>
            </button>
          )}
        </div>

        {/* 3. Primary Application Routes */}
        <nav className="px-2 py-2 space-y-1 flex-shrink-0">
          {navItems.map(({ icon: Icon, label, to, color }) => {
            const isActive = location.pathname === to || (to !== "/dashboard" && location.pathname.startsWith(to));
            const badgeCount = getBadgeValue(to);

            return collapsed ? (
              <Tooltip key={to} label={label} side="right">
                <div className="relative">
                  <NavLink
                    to={to}
                    className={`nav-item justify-center px-0 h-9 rounded-xl flex items-center relative transition-all duration-200 ${isActive ? "bg-white/[0.04] text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                      }`}
                  >
                    <Icon size={16} className={isActive ? color : "text-slate-400"} />
                    {isActive && (
                      <motion.div
                        layoutId="active-indicator-dot"
                        className="absolute left-1.5 w-1 h-3 rounded-full bg-[#F15B42]"
                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                      ></motion.div>
                    )}
                    {badgeCount !== null && (
                      <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#F15B42]"></span>
                    )}
                  </NavLink>
                </div>
              </Tooltip>
            ) : (
              <NavLink
                key={to}
                to={to}
                className={`nav-item relative flex items-center justify-between px-3 h-8.5 rounded-xl text-xs font-bold tracking-tight transition-all duration-200 ${isActive ? "text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                  }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-route-glow"
                    className="absolute inset-0 bg-[#F15B42]/[0.06] border-l-2 border-[#F15B42] rounded-xl z-0"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}

                <div className="flex items-center gap-2.5 z-10">
                  <Icon size={15} className={`flex-shrink-0 ${isActive ? color : "text-slate-500"}`} />
                  <span>{label}</span>
                </div>

                {badgeCount !== null && (
                  <span className="z-10 text-[9.5px] font-extrabold text-slate-500 bg-[#06080e] border border-white/[0.04] px-1.5 py-0.2 rounded-md font-mono">
                    {badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* 4. Filter lists, Search Trigger (only visible when expanded) */}
        {!collapsed && (
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4 border-t border-white/[0.03] min-h-0 scrollbar-thin">

            {/* Styled Search Palette Trigger */}
            <div className="space-y-1">
              {!searchOpen ? (
                <button
                  onClick={() => setSearchOpen(true)}
                  className="w-full flex items-center justify-between px-2.5 h-8 rounded-lg bg-[#06080e] hover:bg-[#0B0F19] border border-white/[0.02] hover:border-white/[0.05] text-xs text-slate-500 hover:text-slate-400 transition shadow-inner font-semibold"
                >
                  <div className="flex items-center gap-2">
                    <Search size={11} className="text-slate-600" />
                    <span>Search workspace...</span>
                  </div>
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.03] border border-white/[0.05] text-[8.5px] text-slate-500 font-mono tracking-tighter">
                    ⌘K
                  </kbd>
                </button>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex items-center"
                >
                  <Search className="absolute left-2.5 text-slate-500" size={11} />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Type to filter..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-[#06080e] border border-[#F15B42]/20 focus:border-[#F15B42]/45 focus:ring-1 focus:ring-[#F15B42]/25 px-8 h-8 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none transition shadow-inner font-semibold"
                  />
                  <button
                    onClick={() => {
                      setSearchOpen(false);
                      setSearchQuery("");
                    }}
                    className="absolute right-2.5 text-slate-500 hover:text-white"
                  >
                    <X size={10} />
                  </button>
                </motion.div>
              )}
            </div>

            {/* Tree Pinned Section */}
            <div className="space-y-1">
              <span className="block text-[10px] uppercase font-black text-slate-500 tracking-widest px-1">
                <Star size={10} className="text-amber-400 shrink-0 inline mr-1" />
                <span>Favorites</span>
              </span>

              {filteredPinnedChats.length === 0 && filteredPinnedProjects.length === 0 ? (
                <span className="block text-xs text-slate-600 italic pl-4 py-1">
                  No pinned favorites
                </span>
              ) : (
                <div className="space-y-0.5 pl-2.5 border-l border-white/[0.02]">
                  {/* Pinned Chats */}
                  {filteredPinnedChats.map((chat) => {
                    const isChatActive = currentConversation?.id === chat.id;
                    return (
                      <div
                        key={chat.id}
                        onClick={() => handleChatSelect(chat)}
                        className={`group flex items-center justify-between px-2.5 h-8 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${isChatActive
                            ? "bg-[#F15B42]/[0.08] text-white border border-[#F15B42]/25 font-bold"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.02] border border-transparent"
                          }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <MessageSquare size={11} className="text-[#F15B42] shrink-0" />
                          <span className="truncate max-w-[125px]">{chat.title}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => togglePinChat(e, chat.id)}
                            className="text-slate-600 hover:text-[#F15B42] transition p-0.5"
                            title="Unpin thread"
                          >
                            <PinOff size={10} />
                          </button>
                          <button
                            onClick={(e) => handleChatDelete(chat.id, e)}
                            className="text-slate-600 hover:text-red-400 transition p-0.5"
                            title="Delete thread"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* Pinned Projects */}
                  {filteredPinnedProjects.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => navigate("/projects")}
                      className="group flex items-center justify-between px-2.5 h-8 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.02] cursor-pointer transition-colors border border-transparent"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderGit2 size={11} className="text-[#7CAADC] shrink-0" />
                        <span className="truncate max-w-[125px]">{p.name}</span>
                      </div>
                      <button
                        onClick={(e) => togglePinProject(e, p.id)}
                        className="text-slate-600 hover:text-[#7CAADC] transition p-0.5 opacity-0 group-hover:opacity-100 shrink-0"
                        title="Unpin workspace"
                      >
                        <PinOff size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Tree Recents Chats */}
            <div className="space-y-1">
              <span className="block text-[10px] uppercase font-black text-slate-500 tracking-widest px-1">
                <Activity size={10} className="text-purple-400 shrink-0 inline mr-1" />
                <span>Recent Threads</span>
              </span>

              {filteredRecentChats.length === 0 ? (
                <span className="block text-xs text-slate-600 italic pl-4 py-1">
                  No recent threads
                </span>
              ) : (
                <div className="space-y-0.5 pl-2.5 border-l border-white/[0.02]">
                  {filteredRecentChats.slice(0, 8).map((chat) => {
                    const isChatActive = currentConversation?.id === chat.id;
                    return (
                      <div
                        key={chat.id}
                        onClick={() => handleChatSelect(chat)}
                        className={`group flex items-center justify-between px-2.5 h-8 rounded-lg text-xs font-semibold transition cursor-pointer ${isChatActive
                            ? "bg-[#F15B42]/[0.08] text-white border border-[#F15B42]/25 font-bold"
                            : "text-slate-400 hover:text-white hover:bg-white/[0.02] border border-transparent"
                          }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <MessageSquare size={11} className="text-slate-600 shrink-0 group-hover:text-slate-400" />
                          <span className="truncate max-w-[125px]">{chat.title}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => togglePinChat(e, chat.id)}
                            className="text-slate-600 hover:text-amber-400 transition p-0.5"
                            title="Pin thread"
                          >
                            <Pin size={10} />
                          </button>
                          <button
                            onClick={(e) => handleChatDelete(chat.id, e)}
                            className="text-slate-600 hover:text-red-400 transition p-0.5"
                            title="Delete thread"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tree Recent Projects */}
            <div className="space-y-1">
              <span className="block text-[10px] uppercase font-black text-slate-500 tracking-widest px-1">
                <FolderGit2 size={10} className="text-slate-500 shrink-0 inline mr-1" />
                <span>Workspaces</span>
              </span>

              {filteredRecentProjects.length === 0 ? (
                <span className="block text-xs text-slate-600 italic pl-4 py-1">
                  No active workspaces
                </span>
              ) : (
                <div className="space-y-0.5 pl-2.5 border-l border-white/[0.02]">
                  {filteredRecentProjects.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      onClick={() => navigate("/projects")}
                      className="group flex items-center justify-between px-2.5 h-8 rounded-lg text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.02] cursor-pointer transition border border-transparent"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FolderGit2 size={11} className="text-slate-600 shrink-0 group-hover:text-slate-400" />
                        <span className="truncate max-w-[125px]">{p.name}</span>
                      </div>
                      <button
                        onClick={(e) => togglePinProject(e, p.id)}
                        className="text-slate-600 hover:text-amber-400 transition p-0.5 opacity-0 group-hover:opacity-100 shrink-0"
                        title="Pin workspace"
                      >
                        <Pin size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

        {/* Space Spacer in Collapsed Mode */}
        {collapsed && <div className="flex-1"></div>}

        {/* 5. Sticky Footer Account Module */}
        <div className="px-3 pt-2 pb-2 border-t border-white/[0.03] flex-shrink-0 z-20">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1.5">
              <Tooltip label="Account Settings" side="right">
                <NavLink
                  to="/settings"
                  className={`nav-item justify-center px-0 h-9 w-9 rounded-xl flex items-center transition ${location.pathname === "/settings" ? "bg-white/[0.04] text-white" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                    }`}
                >
                  <Settings size={16} />
                </NavLink>
              </Tooltip>

              <Tooltip label="Terminate Session" side="right">
                <button
                  onClick={handleLogout}
                  className="nav-item w-9 h-9 justify-center px-0 rounded-xl flex items-center text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={16} />
                </button>
              </Tooltip>
            </div>
          ) : (
            <div className="space-y-2">
              <NavLink
                to="/settings"
                className={`nav-item flex items-center justify-between px-3 h-8.5 rounded-xl text-xs font-bold transition-all duration-200 ${location.pathname === "/settings" ? "text-white bg-white/[0.04]" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]"
                  }`}
              >
                <div className="flex items-center gap-2.5">
                  <Settings size={14} className="text-slate-500" />
                  <span>Settings Config</span>
                </div>
              </NavLink>

              <div className="flex items-center gap-2 px-2 py-2 mt-1 border-t border-white/[0.03] justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar name={user?.name || "User"} size="sm" className="ring-1 ring-white/[0.08]" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-extrabold text-white truncate leading-none">{user?.name || "User"}</div>
                    <div className="text-[10px] font-semibold text-slate-400 truncate mt-1 leading-none">{user?.email || ""}</div>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-red-400 transition-colors p-1 hover:bg-white/[0.04] rounded-lg shrink-0"
                  title="Logout"
                >
                  <LogOut size={13} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6. Expand button hover element (when collapsed) */}
        {collapsed && (
          <button
            onClick={() => {
              setCollapsed(false);
              localStorage.setItem("clawos_sidebar_collapsed", "false");
            }}
            className="absolute top-[16px] -right-3 z-30 w-6 h-6 rounded-full bg-slate-900 border border-white/[0.04] flex items-center justify-center text-slate-500 hover:text-white hover:border-[#F15B42]/30 transition-all duration-200 shadow-md animate-in fade-in"
            title="Expand Sidebar (Ctrl+B)"
          >
            <ChevronRight size={12} />
          </button>
        )}

        {/* 7. Col-resize dragging handle */}
        {!collapsed && (
          <div
            onMouseDown={startResizing}
            className={`absolute top-0 right-0 w-[4px] h-full cursor-col-resize hover:bg-[#F15B42]/20 active:bg-[#F15B42]/40 transition-colors z-30 ${isResizing ? "bg-[#F15B42]/30" : ""
              }`}
          />
        )}
      </motion.aside>
    </div>
  );
}
