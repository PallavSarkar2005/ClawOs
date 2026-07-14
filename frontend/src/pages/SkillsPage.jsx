import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../components/Sidebar";
import { getSkills, createSkill, deleteSkill } from "../api/skillApi";
import {
  Cpu,
  Plus,
  Trash2,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  Search,
  Activity,
  Layers,
  HelpCircle,
  FileText
} from "lucide-react";

export default function SkillsPage() {
  const [skills, setSkills] = useState([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const loadSkills = async () => {
    try {
      const data = await getSkills();
      setSkills(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name || !prompt) return;

    try {
      await createSkill({
        name,
        description,
        prompt,
      });

      setName("");
      setDescription("");
      setPrompt("");
      setShowCreateForm(false);
      loadSkills();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteSkill(id);
      loadSkills();
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  const filteredSkills = skills.filter((skill) => {
    const matchesSearch =
      skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (skill.description && skill.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory =
      activeCategory === "all" || skill.category?.toLowerCase() === activeCategory.toLowerCase();
    return matchesSearch && matchesCategory;
  });

  const categories = ["all", "system", "custom", "database", "utility"];

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-sans relative">
      {/* Background ambient blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-[#7CAADC]/10 rounded-full pointer-events-none blur-3xl z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-[#F49CC4]/15 rounded-full pointer-events-none blur-3xl z-0"></div>

      <Sidebar />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto relative z-10 space-y-8">

        {/* Header Block */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <Cpu className="text-[#F15B42]" size={28} />
              <span>Skills Store</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 font-medium">
              Configure system prompts, personas, and action instructions loaded by agent nodes.
            </p>
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreateForm(true)}
            className="bg-[#F15B42] hover:bg-[#e04a31] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#F15B42]/10 flex items-center gap-1.5"
          >
            <Plus size={16} />
            <span>Create Skill</span>
          </motion.button>
        </div>

        {/* Categories & Search Panel */}
        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-900 border border-white/5 p-4 rounded-2xl">
          <div className="flex gap-2 w-full sm:w-auto overflow-x-auto scrollbar-none pb-2 sm:pb-0">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${activeCategory === cat
                    ? "bg-[#F15B42] border-[#F15B42] text-white"
                    : "bg-slate-950 border-white/5 text-slate-400 hover:text-white"
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search skill nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-white/5 rounded-xl focus:outline-none focus:border-[#F15B42] text-white text-xs placeholder-slate-600 font-bold"
            />
          </div>
        </div>

        {/* Skills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSkills.length === 0 ? (
            <div className="col-span-full glass p-12 text-center rounded-3xl border border-white/5 flex flex-col items-center justify-center">
              <Cpu size={32} className="text-slate-700 mb-3 animate-pulse" />
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">No skills matching query</h4>
              <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-normal">
                Assemble new skill graphs to inject constraints or execution rules.
              </p>
            </div>
          ) : (
            filteredSkills.map((skill) => (
              <motion.div
                key={skill.id}
                layoutId={`skill-card-${skill.id}`}
                className="glass p-5 rounded-2xl border border-white/5 flex flex-col justify-between hover:border-white/10 transition-all duration-300 relative group"
              >
                <button
                  onClick={() => handleDelete(skill.id)}
                  className="absolute right-4 top-4 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={13} />
                </button>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-bold text-[#F15B42] bg-[#F15B42]/5 border border-[#F15B42]/10 px-2 py-0.5 rounded-full uppercase tracking-wider">
                      {skill.category || "Custom"}
                    </span>
                    <span className="text-[8px] font-bold text-[#7CAADC] bg-[#7CAADC]/5 border border-[#7CAADC]/10 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                      <TrendingUp size={8} />
                      <span>{skill.usageCount || 0} hits</span>
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xs font-bold text-slate-200">{skill.name}</h3>
                    <p className="text-[10px] text-slate-500 leading-normal mt-1 min-h-[30px] line-clamp-2">
                      {skill.description || "Injected configuration settings parameters."}
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[9px] text-slate-600 font-bold uppercase">
                  <span>State: Active</span>
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Loaded</span>
                  </div>
                </div>
              </motion.div>
            )))}
        </div>
      </div>

      {/* Assemble custom skill modal */}
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
                  <span>Create Custom Skill Node</span>
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
                    Skill Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="React Senior Code Architect"
                    className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/5 rounded-xl focus:outline-none focus:border-[#F15B42] text-white text-xs placeholder-slate-700 font-semibold"
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
                    placeholder="Injects rigid lint rules and state constraints into react output."
                    className="w-full px-4 py-2.5 bg-slate-950/40 border border-white/5 rounded-xl focus:outline-none focus:border-[#F15B42] text-white text-xs placeholder-slate-700 font-semibold"
                  />
                </div>

                <div>
                  <label className="block mb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                    System Persona Prompt
                  </label>
                  <textarea
                    rows={4}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="You are a principal engineer. Standardize all react hooks. Enforce state safety parameters."
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
                  Save Skill Node
                </motion.button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
