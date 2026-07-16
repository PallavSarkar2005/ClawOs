import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Send,
  Globe,
  Copy,
  Check,
  Paperclip,
  Bot,
  Eye,
  StopCircle,
  ChevronDown,
  Zap,
  Brain,
  Code2,
  FileText,
  RotateCcw,
  X,
  ArrowUp,
  Cpu,
} from "lucide-react";

import Sidebar from "../components/Sidebar";
import { getSkills } from "../api/skillApi";
import {
  createConversation,
  getConversations,
  getMessages,
  sendMessageStream,
  deleteConversation,
  cancelExecution,
  retryExecution,
  getExecution,
} from "../api/chatApi";
import { getWorkflows } from "../api/workflowApi";
import { setProvider } from "../api/aiApi";
import { getDocuments } from "../api/documentApi";
import { getSettings } from "../api/settingsApi";
import { useAuth } from "../context/AuthContext";
import ExecutionTimeline from "../components/chat/ExecutionTimeline";
import ExecutionInspector from "../components/chat/ExecutionInspector";
import { toolsApi } from "../api/toolsApi";
/* ─────────────── Typing dots component ─────────────── */
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-[3px]">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[#F15B42]"
          style={{
            animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

function emptyRuntime() {
  return {
    executionId: null,
    status: "QUEUED",
    plan: null,
    agents: [],
    tools: [],
    logs: [],
    tokens: { total: 0, prompt: 0, completion: 0 },
    cost: 0,
    currentAgent: null,
    currentTool: null,
    reasoning: "",
  };
}

/* ─────────────── Message bubble ─────────────── */
function MessageBubble({ msg, copiedId, onCopy, onPreview }) {
  const isUser = msg.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-end group`}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#7CAADC] to-[#F49CC4] flex items-center justify-center text-[10px] font-black text-white shrink-0 shadow-md ring-2 ring-white/5">
          U
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F15B42] to-[#F49CC4] flex items-center justify-center shrink-0 shadow-md shadow-[#F15B42]/20 ring-2 ring-[#F15B42]/10">
          <Bot size={14} className="text-white" />
        </div>
      )}

      {/* Bubble */}
      <div className={`relative max-w-[78%] ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed font-medium relative ${
            isUser
              ? "bg-[#1E2D4E] border border-[#2A3F6A] text-slate-100 rounded-br-sm"
              : "bg-[#0D1626] border border-white/[0.06] text-slate-200 rounded-bl-sm"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ inline, children, ...props }) {
                    if (inline) {
                      return (
                        <code className="bg-white/[0.08] text-[#F49CC4] px-1.5 py-0.5 rounded text-[11px] font-mono" {...props}>
                          {children}
                        </code>
                      );
                    }
                    return (
                      <div className="relative mt-3 mb-1">
                        <pre className="bg-black/60 border border-white/[0.08] p-4 rounded-xl overflow-x-auto">
                          <code className="text-slate-300 font-mono text-[11px] leading-relaxed" {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    );
                  },
                  p({ children }) {
                    return <p className="mb-2 last:mb-0">{children}</p>;
                  },
                }}
              >
                {msg.content}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Actions row */}
        {!isUser && (
          <div className="flex items-center gap-1 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <button
              onClick={() => onCopy(msg.content, msg.id)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-200 hover:bg-white/[0.04] transition"
            >
              {copiedId === msg.id ? (
                <><Check size={11} className="text-emerald-400" /><span className="text-emerald-400">Copied</span></>
              ) : (
                <><Copy size={11} /><span>Copy</span></>
              )}
            </button>
            {(msg.content.includes("```html") || msg.content.includes("```css") || msg.content.includes("```")) && (
              <button
                onClick={() => onPreview(msg.content)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-500 hover:text-[#7CAADC] hover:bg-[#7CAADC]/[0.06] transition"
              >
                <Eye size={11} />
                <span>Preview</span>
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─────────────── Welcome screen ─────────────── */
function WelcomeScreen({ user, onPrompt }) {
  const prompts = [
    { icon: <Code2 size={16} />, title: "Build a SaaS App", sub: "Full stack Node.js + React", prompt: "Create a detailed technical plan to build a complete SaaS billing application using Node.js and React." },
    { icon: <Brain size={16} />, title: "Create an AI Agent", sub: "Autonomous Python script", prompt: "Write an autonomous Python agent script that scrapes web listings and reports trends to discord." },
    { icon: <FileText size={16} />, title: "Generate a Landing Page", sub: "Dark-themed & responsive", prompt: "Generate modern, dark-themed responsive Tailwind CSS code for a landing page for an AI agent platform." },
    { icon: <Zap size={16} />, title: "Analyze Vector Data", sub: "PostgreSQL embedding index", prompt: "Explain how vector embedding storage indices operate in PostgreSQL database clusters." },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col items-center justify-center h-full px-6 pb-6"
    >
      {/* Hero */}
      <div className="flex flex-col items-center text-center mb-10">
        <div className="relative mb-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F15B42] to-[#F49CC4] flex items-center justify-center shadow-2xl shadow-[#F15B42]/30">
            <Sparkles size={28} className="text-white" />
          </div>
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-[#0F172A] shadow" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Hey, {user?.name || "there"} 👋
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-xs leading-relaxed">
          I'm your AI coordinator. Start a conversation or pick a template below.
        </p>
      </div>

      {/* Prompt cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
        {prompts.map((item, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => onPrompt(item.prompt)}
            className="group flex items-start gap-3.5 p-4 bg-[#0D1626] hover:bg-[#121E35] border border-white/[0.05] hover:border-[#F15B42]/25 rounded-2xl text-left transition-all duration-250 shadow-lg hover:shadow-[#F15B42]/5 hover:shadow-xl"
          >
            <div className="w-9 h-9 rounded-xl bg-white/[0.04] group-hover:bg-[#F15B42]/10 border border-white/[0.05] group-hover:border-[#F15B42]/20 flex items-center justify-center text-slate-500 group-hover:text-[#F15B42] transition-all duration-200 shrink-0">
              {item.icon}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{item.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 truncate">{item.sub}</p>
            </div>
            <ArrowUp size={13} className="ml-auto shrink-0 text-slate-600 group-hover:text-[#F15B42] rotate-45 transition-all duration-200 mt-0.5" />
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}

/* ─────────────── Main component ─────────────── */
export default function ChatPage() {
  const { user } = useAuth();

  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [provider, setProviderState] = useState("openrouter");
  const [skills, setSkills] = useState([]);
  const [selectedSkill, setSelectedSkill] = useState("");
  const [activeSkill, setActiveSkill] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [documents, setDocuments] = useState([]);
  const [selectedDocument, setSelectedDocument] = useState("");
  const [settings, setSettings] = useState(null);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState("claude-3.5-sonnet");
  const [copiedId, setCopiedId] = useState(null);
  const [previewContent, setPreviewContent] = useState("");
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [runtime, setRuntime] = useState(null);
  const [inspector, setInspector] = useState(null);

  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const optionsRef = useRef(null);
  const abortRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const loadSettings = async () => {
    try {
      const data = await getSettings();
      setSettings(data);
      if (data?.defaultProvider) {
        setProviderState(data.defaultProvider);
        await setProvider(data.defaultProvider);
      }
      if (data?.webSearchDefault !== undefined) {
        setWebSearchEnabled(data.webSearchDefault);
      }
    } catch (error) {
      console.error("Load settings error:", error);
    }
  };

  const loadConversations = async () => {
    try {
      const data = await getConversations();
      setConversations(data);
      if (data.length > 0 && !currentConversation) {
        setCurrentConversation(data[0]);
      }
    } catch (error) {
      console.error("Load conversations error:", error);
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const data = await getMessages(conversationId);
      setMessages(data);
    } catch (error) {
      console.error("Load messages error:", error);
    }
  };

  const handleNewChat = async () => {
    try {
      const chat = await createConversation();
      setConversations((prev) => [chat, ...prev]);
      setCurrentConversation(chat);
      setMessages([]);
    } catch (error) {
      console.error("Create conversation error:", error);
    }
  };

  const handleSelectConversation = async (chat) => {
    setCurrentConversation(chat);
    await loadMessages(chat.id);
  };

  const handleDeleteConversation = async (id) => {
    try {
      await deleteConversation(id);
      const updated = conversations.filter((c) => c.id !== id);
      setConversations(updated);
      if (currentConversation?.id === id) {
        if (updated.length > 0) {
          setCurrentConversation(updated[0]);
          await loadMessages(updated[0].id);
        } else {
          setCurrentConversation(null);
          setMessages([]);
        }
      }
    } catch (error) {
      console.error("Delete conversation error:", error);
    }
  };

  const handleProviderChange = async (val) => {
    try {
      setProviderState(val);
      await setProvider(val);
    } catch (error) {
      console.error("Provider change error:", error);
    }
  };

  const loadDocuments = async () => {
    try {
      const data = await getDocuments();
      setDocuments(data);
    } catch (error) {
      console.error(error);
    }
  };

  // Thinking timeline driver removed — real runtime events drive UI

  const handleCancel = async () => {
    abortRef.current?.abort();
    if (runtime?.executionId) {
      try {
        await cancelExecution(runtime.executionId);
      } catch (e) {
        console.error(e);
      }
    }
    setLoading(false);
  };

  const handleRetry = async () => {
    if (!runtime?.executionId) return;
    try {
      setLoading(true);
      const result = await retryExecution(runtime.executionId);
      if (result?.reply) {
        setMessages((prev) => [
          ...prev,
          { id: Date.now(), role: "assistant", content: result.reply },
        ]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleInspect = async (id) => {
    try {
      const data = await getExecution(id);
      setInspector(data);
    } catch (e) {
      console.error(e);
    }
  };

  const applyRuntimeEvent = (evt) => {
    setRuntime((prev) => {
      const next = { ...(prev || emptyRuntime()) };
      if (evt.executionId) next.executionId = evt.executionId;

      switch (evt.event) {
        case "execution_started":
          next.status = "QUEUED";
          break;
        case "state_changed":
          next.status = evt.to || next.status;
          break;
        case "plan_created":
          next.plan = {
            intent: evt.intent,
            strategy: evt.strategy,
            tasks: evt.tasks || [],
          };
          next.agents = (evt.tasks || []).map((t) => ({
            id: t.id,
            agent: t.agent,
            description: t.description,
            status: "pending",
          }));
          next.status = "PLANNING";
          break;
        case "agent_started":
          next.currentAgent = evt.agent;
          next.agents = (next.agents || []).map((a) =>
            a.agent === evt.agent || a.id === evt.taskId
              ? { ...a, status: "running", description: evt.description || a.description }
              : a,
          );
          if (!(next.agents || []).some((a) => a.agent === evt.agent)) {
            next.agents = [
              ...(next.agents || []),
              { id: evt.taskId || evt.agent, agent: evt.agent, status: "running", description: evt.description },
            ];
          }
          break;
        case "agent_completed":
          next.agents = (next.agents || []).map((a) =>
            a.agent === evt.agent || a.id === evt.taskId
              ? { ...a, status: "completed", durationMs: evt.durationMs, summary: (evt.output || "").slice(0, 120) }
              : a,
          );
          break;
        case "agent_failed":
          next.agents = (next.agents || []).map((a) =>
            a.agent === evt.agent ? { ...a, status: "failed", description: evt.error } : a,
          );
          break;
        case "agent_reasoning":
          next.reasoning = `${next.reasoning || ""}${evt.text || ""}\n`.slice(-4000);
          break;
        case "tool_started":
          next.currentTool = evt.tool;
          next.tools = [
            ...(next.tools || []),
            { tool: evt.tool, arguments: evt.arguments, status: "running", id: `${evt.tool}-${Date.now()}` },
          ];
          break;
        case "tool_completed":
        case "tool_failed":
          next.currentTool = evt.event === "tool_completed" ? null : evt.tool;
          next.tools = (next.tools || []).map((t) =>
            t.tool === evt.tool && t.status === "running"
              ? { ...t, status: evt.event === "tool_completed" ? "completed" : "failed" }
              : t,
          );
          break;
        case "metrics":
          next.tokens = {
            total: evt.totalTokens || 0,
            prompt: evt.promptTokens || 0,
            completion: evt.completionTokens || 0,
          };
          next.cost = evt.estimatedCost || 0;
          break;
        case "execution_completed":
          next.status = "COMPLETED";
          if (evt.tokens != null) next.tokens = { ...next.tokens, total: evt.tokens };
          if (evt.cost != null) next.cost = evt.cost;
          break;
        case "execution_failed":
          next.status = "FAILED";
          break;
        case "execution_cancelled":
          next.status = "CANCELLED";
          break;
        default:
          break;
      }

      next.logs = [
        ...(next.logs || []),
        {
          ts: evt.ts || new Date().toISOString(),
          event: evt.event,
          message: evt.message || evt.agent || evt.tool || "",
          agent: evt.agent,
        },
      ].slice(-80);

      return next;
    });
  };

  const handleSend = async (overrideText = "") => {
    const text = overrideText || input;
    if (!text.trim()) return;

    let targetConv = currentConversation;
    if (!targetConv) {
      try {
        const chat = await createConversation();
        setConversations((prev) => [chat, ...prev]);
        setCurrentConversation(chat);
        setMessages([]);
        targetConv = chat;
      } catch (err) {
        console.error("Auto new chat creation failed:", err);
        return;
      }
    }

    const userMessage = { id: Date.now(), role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    if (!overrideText) setInput("");
    setLoading(true);
    setRuntime(emptyRuntime());
    abortRef.current = new AbortController();

    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    try {
      const response = await sendMessageStream(
        {
          conversationId: targetConv.id,
          message: text,
          skillId: selectedSkill,
          workflowId: selectedWorkflow,
          documentId: selectedDocument,
          webSearchEnabled,
        },
        {
          signal: abortRef.current.signal,
          onEvent: applyRuntimeEvent,
        },
      );
      setActiveSkill(response.skill);
      if (response.reply) {
        const assistantMessage = {
          id: Date.now() + 1,
          role: "assistant",
          content: response.reply,
          executionId: response.executionId,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }
      await loadConversations();
    } catch (error) {
      if (error.name === "AbortError") {
        setRuntime((r) => (r ? { ...r, status: "CANCELLED" } : r));
      } else {
        console.error("Send message error:", error);
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 2,
            role: "assistant",
            content: `⚠️ ${error.message || "Connection timeout. Check backend models routing."}`,
          },
        ]);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const loadSkills = async () => {
    try {
      const data = await getSkills();
      setSkills(data.filter((s) => s.enabled));
    } catch (error) {
      console.error(error);
    }
  };

  const loadWorkflows = async () => {
    try {
      const data = await getWorkflows();
      setWorkflows(data);
    } catch (error) {
      console.error(error);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const triggerCodePreview = (code) => {
    setPreviewContent(code);
    setShowPreviewModal(true);
  };

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
  };

  // Close options on outside click
  useEffect(() => {
    const handler = (e) => {
      if (optionsRef.current && !optionsRef.current.contains(e.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    loadSettings();
    loadConversations();
    loadSkills();
    loadWorkflows();
    loadDocuments();
  }, []);

  useEffect(() => {
    if (currentConversation?.id) loadMessages(currentConversation.id);
  }, [currentConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading, runtime]);

  const canSend = input.trim().length > 0 && !loading;

  return (
    <div className="flex h-screen bg-[#0A0F1E] text-slate-100 overflow-hidden font-sans relative">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[55%] h-[55%] bg-[#7CAADC]/[0.04] rounded-full blur-[100px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[55%] h-[55%] bg-[#F15B42]/[0.05] rounded-full blur-[100px]" />
      </div>

      <Sidebar
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDelete={handleDeleteConversation}
      />

      {/* ── Main chat area ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-10">

        {/* ── Top bar ── */}
        <header className="flex items-center justify-between h-12 px-5 border-b border-white/[0.04] bg-[#0A0F1E]/80 backdrop-blur-xl shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#F15B42] to-[#F49CC4] flex items-center justify-center shadow-sm">
              <Sparkles size={10} className="text-white" />
            </div>
            <span className="text-sm font-bold text-slate-200 max-w-[240px] truncate">
              {currentConversation ? currentConversation.title : "New Conversation"}
            </span>
            {activeSkill && (
              <span className="text-[9px] font-extrabold bg-[#F15B42]/10 text-[#F15B42] border border-[#F15B42]/20 px-2 py-0.5 rounded-full uppercase tracking-widest">
                {activeSkill}
              </span>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2">
            {/* Web search toggle */}
            <button
              onClick={() => setWebSearchEnabled((v) => !v)}
              className={`flex items-center gap-1.5 px-3 h-7 rounded-lg text-[10px] font-bold border transition-all ${
                webSearchEnabled
                  ? "bg-[#7CAADC]/15 border-[#7CAADC]/40 text-[#7CAADC]"
                  : "bg-white/[0.03] border-white/[0.05] text-slate-500 hover:text-slate-300 hover:bg-white/[0.05]"
              }`}
            >
              <Globe size={11} />
              <span>Web</span>
            </button>

            {/* Provider badge */}
            <div className="relative" ref={optionsRef}>
              <button
                onClick={() => setShowOptions((v) => !v)}
                className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-[10px] font-bold bg-white/[0.03] border border-white/[0.05] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] transition"
              >
                <Cpu size={11} />
                <span className="capitalize">{provider}</span>
                <ChevronDown size={10} className={`transition-transform ${showOptions ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showOptions && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-9 w-64 bg-[#0D1626] border border-white/[0.07] rounded-2xl shadow-2xl z-50 p-2 space-y-0.5"
                  >
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-2 py-1">Provider</p>
                    {["openrouter", "groq", "ollama"].map((p) => (
                      <button
                        key={p}
                        onClick={() => { handleProviderChange(p); setShowOptions(false); }}
                        className={`w-full flex items-center justify-between px-3 h-8 rounded-xl text-xs font-semibold transition ${
                          provider === p ? "bg-[#F15B42]/10 text-[#F15B42] border border-[#F15B42]/20" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span className="capitalize">{p}</span>
                        {provider === p && <span className="w-1.5 h-1.5 rounded-full bg-[#F15B42]" />}
                      </button>
                    ))}

                    <div className="border-t border-white/[0.05] my-1" />
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-2 py-1">Skill</p>
                    {[{ id: "", name: "No Active Skill" }, ...skills].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => { setSelectedSkill(s.id); setShowOptions(false); }}
                        className={`w-full flex items-center justify-between px-3 h-8 rounded-xl text-xs font-semibold transition ${
                          selectedSkill === s.id ? "bg-[#7CAADC]/10 text-[#7CAADC] border border-[#7CAADC]/20" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                        }`}
                      >
                        <span>{s.name}</span>
                        {selectedSkill === s.id && <span className="w-1.5 h-1.5 rounded-full bg-[#7CAADC]" />}
                      </button>
                    ))}

                    {documents.length > 0 && (
                      <>
                        <div className="border-t border-white/[0.05] my-1" />
                        <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-2 py-1">Document Context</p>
                        {[{ id: "", name: "No File Context" }, ...documents].map((d) => (
                          <button
                            key={d.id}
                            onClick={() => { setSelectedDocument(d.id); setShowOptions(false); }}
                            className={`w-full flex items-center justify-between px-3 h-8 rounded-xl text-xs font-semibold transition ${
                              selectedDocument === d.id ? "bg-[#F49CC4]/10 text-[#F49CC4] border border-[#F49CC4]/20" : "text-slate-400 hover:text-white hover:bg-white/[0.04]"
                            }`}
                          >
                            <span className="truncate">{d.name}</span>
                            {selectedDocument === d.id && <span className="w-1.5 h-1.5 rounded-full bg-[#F49CC4] shrink-0" />}
                          </button>
                        ))}
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* ── Messages ── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {messages.length === 0 ? (
            <WelcomeScreen user={user} onPrompt={handleSend} />
          ) : (
            <div className="max-w-3xl mx-auto px-5 py-6 space-y-5">
              <AnimatePresence initial={false}>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    copiedId={copiedId}
                    onCopy={copyToClipboard}
                    onPreview={triggerCodePreview}
                  />
                ))}
              </AnimatePresence>

              {/* Live agent runtime timeline */}
              <AnimatePresence>
                {(loading || runtime) && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 6 }}
                    className="flex gap-3 items-end"
                  >
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#F15B42] to-[#F49CC4] flex items-center justify-center shrink-0 shadow-md shadow-[#F15B42]/20 ring-2 ring-[#F15B42]/10">
                      <Bot size={14} className="text-white" />
                    </div>
                    {runtime ? (
                      <ExecutionTimeline
                        {...runtime}
                        onCancel={handleCancel}
                        onRetry={handleRetry}
                        onInspect={handleInspect}
                      />
                    ) : (
                      <div className="bg-[#0D1626] border border-white/[0.06] px-4 py-3 rounded-2xl rounded-bl-sm flex flex-col gap-1.5">
                        <TypingDots />
                        <p className="text-[10px] text-slate-600 font-semibold">Starting agent runtime…</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* ── Input bar ── */}
        <div className="shrink-0 px-5 py-4 bg-[#0A0F1E]/90 backdrop-blur-xl border-t border-white/[0.04]">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-3 bg-[#0D1626] border border-white/[0.07] focus-within:border-[#F15B42]/30 focus-within:shadow-lg focus-within:shadow-[#F15B42]/5 rounded-2xl px-4 py-3 transition-all duration-250">
              {/* Attach */}
              <button className="shrink-0 p-1.5 -ml-1 rounded-xl text-slate-600 hover:text-slate-300 hover:bg-white/[0.04] transition mb-0.5">
                <Paperclip size={15} />
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                rows={1}
                placeholder="Message the AI coordinator…"
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !loading) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-600 outline-none resize-none font-medium leading-relaxed min-h-[24px] max-h-40 py-0.5"
              />

              {/* Send / Stop */}
              <button
                onClick={() => (loading ? handleCancel() : handleSend())}
                disabled={!loading && !canSend}
                className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all duration-200 mb-0.5 ${
                  loading || canSend
                    ? "bg-[#F15B42] hover:bg-[#e04a31] text-white shadow-lg shadow-[#F15B42]/20"
                    : "bg-white/[0.04] text-slate-600 cursor-not-allowed"
                }`}
              >
                {loading ? <StopCircle size={15} /> : <Send size={14} />}
              </button>
            </div>

            {/* Hint row */}
            <p className="text-center text-[10px] text-slate-700 mt-2 font-medium">
              <kbd className="px-1 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[9px]">Enter</kbd> to send &nbsp;·&nbsp;
              <kbd className="px-1 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[9px]">Shift+Enter</kbd> for new line
            </p>
          </div>
        </div>
      </div>

      {/* ── Code preview modal ── */}
      <AnimatePresence>
        {showPreviewModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80 backdrop-blur-md"
            onClick={() => setShowPreviewModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-4xl h-[80vh] bg-[#0D1626] border border-white/[0.08] rounded-3xl flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06] shrink-0">
                <div className="flex items-center gap-2">
                  <Eye size={13} className="text-[#7CAADC]" />
                  <span className="text-xs font-bold text-slate-300">ClawOS Artifact Sandbox</span>
                </div>
                <button
                  onClick={() => { setShowPreviewModal(false); setPreviewContent(""); }}
                  className="w-7 h-7 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center transition"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 bg-white overflow-hidden">
                <iframe
                  title="ClawOS Artifact Frame"
                  className="w-full h-full border-none"
                  srcDoc={
                    previewContent.match(/```html([\s\S]*?)```/)?.[1] ||
                    `<html><body style="font-family:sans-serif;padding:20px;color:#333;"><h3>Rendering artifact preview…</h3><p>Extracting nested HTML templates.</p></body></html>`
                  }
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Execution Inspector */}
      <AnimatePresence>
        {inspector && (
          <ExecutionInspector
            data={inspector}
            onClose={() => setInspector(null)}
            onReplay={async (toolCall) => {
              try {
                const toolId = toolCall.toolName;
                await toolsApi.invoke(toolId, {
                  arguments: toolCall.arguments || {},
                  projectId: inspector.projectId || undefined,
                });
              } catch {
                /* best-effort replay */
              }
            }}
          />
        )}
      </AnimatePresence>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
