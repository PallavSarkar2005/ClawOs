import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../components/Sidebar";
import { getMemories, createMemory, deleteMemory } from "../api/memoryApi";
import {
  Brain,
  Plus,
  Trash2,
  Clock,
  Search,
  Tag,
  Sliders,
  Sparkles,
  Link as LinkIcon
} from "lucide-react";

export default function MemoryPage() {
  const [memories, setMemories] = useState([]);
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(5);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTagFilter, setSelectedTagFilter] = useState("all");

  const loadMemories = async () => {
    try {
      const data = await getMemories();
      setMemories(data || []);
    } catch (error) {
      console.error("Load memories error:", error);
    }
  };

  const handleCreateMemory = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;

    // We can enrich the memory text with importance and tag structure to save it in database content
    // and parse it out when rendering! This is extremely smart because it implements tags/importance
    // without requiring Prisma migrations!
    const tagsArray = tagInput.split(",").map(t => t.trim()).filter(Boolean);
    const enrichedContent = `[importance:${importance}][tags:${tagsArray.join(",")}] ${content}`;

    try {
      setLoading(true);
      await createMemory(enrichedContent);
      setContent("");
      setTagInput("");
      setImportance(5);
      await loadMemories();
    } catch (error) {
      console.error("Create memory error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMemory = async (id) => {
    try {
      await deleteMemory(id);
      await loadMemories();
    } catch (error) {
      console.error("Delete memory error:", error);
    }
  };

  useEffect(() => {
    loadMemories();
  }, []);

  // Parse out tags and importance for rendering
  const parsedMemories = memories.map((mem) => {
    const impMatch = mem.content.match(/\[importance:(\d+)\]/);
    const tagsMatch = mem.content.match(/\[tags:(.*?)\]/);
    
    let cleanContent = mem.content;
    let imp = 5;
    let tags = [];

    if (impMatch) {
      imp = parseInt(impMatch[1], 10);
      cleanContent = cleanContent.replace(impMatch[0], "");
    }
    if (tagsMatch) {
      tags = tagsMatch[1].split(",").filter(Boolean);
      cleanContent = cleanContent.replace(tagsMatch[0], "");
    }

    cleanContent = cleanContent.trim();

    return {
      ...mem,
      cleanContent,
      importance: imp,
      tags: tags.length > 0 ? tags : ["context"],
    };
  });

  // Extract unique tags list
  const allTags = ["all", ...new Set(parsedMemories.flatMap((m) => m.tags))];

  const filteredMemories = parsedMemories.filter((mem) => {
    const matchesSearch = mem.cleanContent.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTag = selectedTagFilter === "all" || mem.tags.includes(selectedTagFilter);
    return matchesSearch && matchesTag;
  });

  // Generate floating connection nodes for knowledge graph visualization
  const graphNodes = filteredMemories.map((mem, i) => ({
    id: mem.id,
    label: mem.cleanContent.length > 20 ? mem.cleanContent.slice(0, 20) + "..." : mem.cleanContent,
    x: 20 + (i * 25) % 60,
    y: 15 + (i * 35) % 70,
    size: 6 + mem.importance * 1.2,
  }));

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-sans relative">
      {/* Visual Ambient Background Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-[#7CAADC]/10 rounded-full pointer-events-none blur-3xl z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-[#F49CC4]/15 rounded-full pointer-events-none blur-3xl z-0"></div>

      <Sidebar />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto relative z-10 space-y-8">
        {/* Header Block */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <Brain className="text-[#7CAADC]" size={28} />
              <span>Memory Bank</span>
            </h1>
            <p className="text-slate-400 text-sm mt-1.5 font-medium">
              Configure semantic facts that are automatically injected into LLM chats based on similarity scores.
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full md:w-72">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search semantic database..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-900 border border-white/5 rounded-xl focus:outline-none focus:border-[#7CAADC] text-white text-xs transition placeholder-slate-600 font-bold"
            />
          </div>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Add Memory Panel */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass p-6 rounded-3xl border border-white/5 h-fit space-y-5"
          >
            <h2 className="text-white text-xs font-bold uppercase tracking-wider flex items-center gap-2">
              <Plus size={16} className="text-[#F15B42]" />
              <span>Ingest Fact</span>
            </h2>

            <form onSubmit={handleCreateMemory} className="space-y-4">
              <div>
                <label className="block mb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  Fact Details
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="I primarily build apps using NextJS and deployment servers."
                  className="w-full bg-slate-950/40 border border-white/5 rounded-2xl p-4 outline-none text-slate-200 text-xs focus:border-[#7CAADC] placeholder-slate-700 leading-relaxed font-semibold"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  <span>Importance Scale</span>
                  <span className="text-[#F15B42]">{importance} / 10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={importance}
                  onChange={(e) => setImportance(Number(e.target.value))}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-[#F15B42]"
                />
              </div>

              <div>
                <label className="block mb-1.5 text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  Tags (comma separated)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
                    <Tag size={12} />
                  </span>
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="stack, preferences"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950/40 border border-white/5 rounded-xl focus:outline-none focus:border-[#7CAADC] text-white text-xs transition placeholder-slate-700 font-semibold"
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={loading}
                className="w-full bg-[#F15B42] hover:bg-[#e04a31] disabled:opacity-50 text-white py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition shadow-lg shadow-[#F15B42]/10"
              >
                {loading ? "Ingesting..." : "Commit context fact"}
              </motion.button>
            </form>
          </motion.div>

          {/* Timeline Feed Panel */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Tag Filters Header */}
            <div className="flex gap-2 pb-2 overflow-x-auto scrollbar-none">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setSelectedTagFilter(tag)}
                  className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${
                    selectedTagFilter === tag
                      ? "bg-[#7CAADC] border-[#7CAADC] text-slate-950"
                      : "bg-slate-900 border-white/5 text-slate-400 hover:text-white"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Memories List */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <Clock size={12} className="text-[#7CAADC]" />
                  <span>Ingested Chronology</span>
                </h3>

                {filteredMemories.length === 0 ? (
                  <div className="glass rounded-3xl p-12 text-center border border-white/5 flex flex-col items-center justify-center">
                    <Brain className="text-slate-700 mb-3 animate-pulse" size={32} />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">No facts loaded</h4>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-xs leading-normal">
                      Write new facts to commit background semantic memories.
                    </p>
                  </div>
                ) : (
                  filteredMemories.map((mem) => (
                    <motion.div
                      key={mem.id}
                      layoutId={`mem-card-${mem.id}`}
                      className="glass p-5 rounded-2xl border border-white/5 space-y-3 relative group"
                    >
                      <button
                        onClick={() => handleDeleteMemory(mem.id)}
                        className="absolute right-4 top-4 text-slate-500 hover:text-red-400 transition"
                      >
                        <Trash2 size={13} />
                      </button>

                      <div className="flex items-center gap-2">
                        <span className="text-[8px] font-bold text-slate-500 bg-slate-950 border border-white/5 px-2 py-0.5 rounded-full">
                          Weight: {mem.importance}
                        </span>
                        {mem.tags.map((tag) => (
                          <span key={tag} className="text-[8px] font-bold text-[#7CAADC] uppercase tracking-wider">
                            #{tag}
                          </span>
                        ))}
                      </div>

                      <p className="text-xs text-slate-200 leading-relaxed font-semibold">
                        {mem.cleanContent}
                      </p>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Graphical Knowledge Visualizer mockup */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                  <LinkIcon size={12} className="text-[#F49CC4]" />
                  <span>Semantic Knowledge Graph</span>
                </h3>

                <div className="glass h-80 rounded-3xl border border-white/5 relative overflow-hidden bg-slate-950/20 p-4">
                  {/* Grid canvas background */}
                  <div className="absolute inset-0 opacity-5 bg-radial-grid"></div>

                  <AnimatePresence>
                    {graphNodes.map((node, i) => (
                      <motion.div
                        key={node.id}
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute rounded-full bg-[#7CAADC]/10 border border-[#7CAADC]/30 flex items-center justify-center p-2 text-[8px] text-slate-400 font-bold whitespace-nowrap cursor-pointer hover:border-[#F15B42] hover:text-white transition duration-300"
                        style={{
                          left: `${node.x}%`,
                          top: `${node.y}%`,
                          width: `${node.size * 5}px`,
                          height: `${node.size * 5}px`,
                        }}
                      >
                        {node.label}
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {/* Connecting lines mockup */}
                  <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20 text-slate-500">
                    {graphNodes.slice(1).map((node, i) => {
                      const prev = graphNodes[i];
                      return (
                        <line
                          key={i}
                          x1={`${prev.x}%`}
                          y1={`${prev.y}%`}
                          x2={`${node.x}%`}
                          y2={`${node.y}%`}
                          stroke="currentColor"
                          strokeWidth="1"
                          strokeDasharray="4"
                        />
                      );
                    })}
                  </svg>
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
