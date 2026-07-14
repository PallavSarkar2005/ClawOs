import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../components/Sidebar";
import {
  getWorkflows,
  createWorkflow,
  deleteWorkflow,
} from "../api/workflowApi";
import {
  GitBranch,
  Plus,
  Trash2,
  Play,
  Settings,
  Activity,
  ArrowRight,
  Sparkles,
  Zap,
  HelpCircle,
  Database,
  Cpu,
  Bot
} from "lucide-react";

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeWorkflow, setActiveWorkflow] = useState(null);

  // Graph Simulation State
  const [simulationIndex, setSimulationIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  // Flow Nodes List
  const graphNodes = [
    { id: "trigger", label: "Trigger Node", desc: "User query matching criteria", icon: <Zap size={14} />, x: 10, y: 40 },
    { id: "planner", label: "Planner Core", desc: "Formulate task list & actions", icon: <Cpu size={14} />, x: 35, y: 20 },
    { id: "memories", label: "Semantic Facts", desc: "Matching similarity lookups", icon: <Database size={14} />, x: 35, y: 60 },
    { id: "agent", label: "Executor Agent", desc: "Transpile & evaluate sandbox", icon: <Bot size={14} />, x: 65, y: 40 },
    { id: "output", label: "Client Output", desc: "Stream Markdown result", icon: <ArrowRight size={14} />, x: 90, y: 40 },
  ];

  const loadWorkflows = async () => {
    try {
      const data = await getWorkflows();
      setWorkflows(data || []);
      if (data?.length > 0 && !activeWorkflow) {
        setActiveWorkflow(data[0]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !prompt) return;

    try {
      await createWorkflow({
        name,
        description,
        prompt,
      });

      setName("");
      setDescription("");
      setPrompt("");
      setShowCreateForm(false);
      loadWorkflows();
    } catch (error) {
      console.error(error);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteWorkflow(id);
      loadWorkflows();
      if (activeWorkflow?.id === id) {
        setActiveWorkflow(null);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const runSimulation = () => {
    if (isRunning) return;
    setIsRunning(true);
    setSimulationIndex(0);
    setLogs([`[00:00] Triggering node: Query matches active threshold.`]);

    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      if (step < graphNodes.length) {
        setSimulationIndex(step);
        const stateLogs = [
          `[00:02] Planner core compiling instruction arrays.`,
          `[00:04] PostgreSQL vector search matches: 2 items found.`,
          `[00:06] Executing agent Sandbox runtime code... [SUCCESS]`,
          `[00:08] Streaming Markdown response blocks to target socket.`,
        ];
        setLogs((prev) => [...prev, stateLogs[step - 1]]);
      } else {
        clearInterval(interval);
        setIsRunning(false);
        setSimulationIndex(-1);
        setLogs((prev) => [...prev, `[00:10] Flow execution finished successfully.`]);
      }
    }, 2000);
  };

  useEffect(() => {
    loadWorkflows();
  }, []);

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-sans relative">
      {/* Visual Ambient Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-[#7CAADC]/10 rounded-full pointer-events-none blur-3xl z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-[#F49CC4]/15 rounded-full pointer-events-none blur-3xl z-0"></div>

      <Sidebar />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto relative z-10 flex flex-col xl:flex-row gap-8">
        
        {/* Left Side: Workflows list */}
        <div className="flex-1 space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <GitBranch className="text-[#F15B42]" size={28} />
                <span>Workflows Engine</span>
              </h1>
              <p className="text-slate-400 text-sm mt-1.5 font-medium">
                Assemble visual node graphs to model multi-step task execution chains.
              </p>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreateForm(true)}
              className="bg-[#F15B42] hover:bg-[#e04a31] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#F15B42]/10 flex items-center gap-1.5"
            >
              <Plus size={16} />
              <span>Create Graph</span>
            </motion.button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {workflows.map((wf) => (
              <motion.div
                key={wf.id}
                layoutId={`wf-card-${wf.id}`}
                onClick={() => setActiveWorkflow(wf)}
                className={`glass p-5 rounded-2xl border cursor-pointer transition-all duration-300 relative group ${
                  activeWorkflow?.id === wf.id ? "border-[#F15B42]" : "border-white/5"
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(wf.id);
                  }}
                  className="absolute right-4 top-4 text-slate-500 hover:text-red-400 transition opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>

                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">{wf.name}</h3>
                  <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{wf.description || "No description provided."}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right Side: Graph Visual Editor */}
        <div className="w-full xl:w-96 space-y-6 shrink-0 flex flex-col justify-between">
          <div className="glass p-6 rounded-3xl border border-white/5 space-y-5 flex-1 flex flex-col justify-between min-h-[460px]">
            <div>
              <div className="flex justify-between items-center border-b border-white/5 pb-3">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Activity size={14} className="text-[#7CAADC]" />
                  <span>Interactive Node Flow</span>
                </h3>
                {activeWorkflow && (
                  <button
                    onClick={runSimulation}
                    disabled={isRunning}
                    className="p-1.5 bg-[#F15B42]/10 border border-[#F15B42]/20 text-[#F15B42] hover:bg-[#F15B42]/25 rounded-lg transition"
                  >
                    <Play size={12} />
                  </button>
                )}
              </div>

              {/* Visual Node Grid Canvas */}
              <div className="h-64 bg-slate-950/45 rounded-2xl border border-white/5 relative overflow-hidden mt-4 p-4">
                <div className="absolute inset-0 opacity-5 bg-grid"></div>

                {graphNodes.map((node, idx) => {
                  const isActive = simulationIndex === idx;
                  const isPassed = simulationIndex > idx && simulationIndex !== -1;

                  return (
                    <motion.div
                      key={node.id}
                      className={`absolute px-2.5 py-1.5 rounded-xl border flex flex-col items-start text-left z-10 transition duration-300 ${
                        isActive
                          ? "border-[#F15B42] bg-[#F15B42]/5 shadow-lg shadow-[#F15B42]/5"
                          : isPassed
                            ? "border-emerald-500 bg-emerald-500/5"
                            : "border-white/5 bg-slate-900/60"
                      }`}
                      style={{
                        left: `${node.x}%`,
                        top: `${node.y}%`,
                        transform: "translate(-50%, -50%)",
                      }}
                    >
                      <span className="flex items-center gap-1.5 text-[9px] font-bold text-white uppercase">
                        {node.icon}
                        <span>{node.label}</span>
                      </span>
                      <span className="text-[8px] text-slate-500 font-semibold leading-none mt-0.5 whitespace-nowrap">
                        {node.desc}
                      </span>
                    </motion.div>
                  );
                })}

                {/* Connecting SVG Path edges */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20 text-slate-500">
                  <line x1="10%" y1="40%" x2="35%" y2="20%" stroke="currentColor" strokeWidth="1" strokeDasharray="3" />
                  <line x1="10%" y1="40%" x2="35%" y2="60%" stroke="currentColor" strokeWidth="1" strokeDasharray="3" />
                  <line x1="35%" y1="20%" x2="65%" y2="40%" stroke="currentColor" strokeWidth="1" strokeDasharray="3" />
                  <line x1="35%" y1="60%" x2="65%" y2="40%" stroke="currentColor" strokeWidth="1" strokeDasharray="3" />
                  <line x1="65%" y1="40%" x2="90%" y2="40%" stroke="currentColor" strokeWidth="1" strokeDasharray="3" />
                </svg>
              </div>
            </div>

            {/* Run logs console */}
            <div className="p-4 bg-slate-950/40 rounded-2xl border border-white/5 space-y-1.5 font-mono text-[9px] text-slate-400 min-h-[120px] max-h-[120px] overflow-y-auto">
              {logs.map((log, idx) => (
                <div key={idx} className="truncate">
                  <span className="text-[#F15B42] mr-1">&gt;</span>
                  {log}
                </div>
              ))}
              {logs.length === 0 && <div className="text-slate-600">Timeline logs ready. Click Play.</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Assemble workflow modal */}
      <AnimatePresence>
        {showCreateForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass border border-white/5 rounded-3xl p-6 md:p-8 relative shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="text-[#F15B42]" size={16} />
                  <span>Configure Workflow Graph</span>
                </h3>
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="text-xs font-bold text-[#F15B42] hover:underline"
                >
                  Cancel
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block mb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    Graph Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Auto-indexing pipelines"
                    className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/5 rounded-xl focus:outline-none focus:border-[#F15B42] text-white text-xs transition placeholder-slate-700 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Trigger vector embeddings on text files upload."
                    className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/5 rounded-xl focus:outline-none focus:border-[#F15B42] text-white text-xs transition placeholder-slate-700 font-semibold"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    Instruction Prompt
                  </label>
                  <textarea
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Plan sequential agent steps: match user intent, scan memory buffers, compile React bundle."
                    className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 outline-none text-slate-200 text-xs focus:border-[#F15B42] placeholder-slate-700 leading-relaxed font-semibold"
                    required
                  />
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  className="w-full bg-[#F15B42] hover:bg-[#e04a31] text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-[#F15B42]/10"
                >
                  Compile Graph Node
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
