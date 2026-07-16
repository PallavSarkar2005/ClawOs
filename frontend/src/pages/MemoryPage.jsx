import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../components/Sidebar";
import {
  getMemories,
  createMemory,
  updateMemory,
  deleteMemory,
  pinMemory,
  searchMemory,
  getMemoryStats,
  getMemoryHistory,
  listCollections,
  createCollection,
  deleteCollection,
  addToCollection,
  getGraph,
  listMemoryDocuments,
  uploadMemoryDocument,
  getMemoryDocument,
  getDocumentChunks,
  deleteMemoryDocument,
  reindexDocument,
  listIndexJobs,
  getMemory,
  createRelationship,
} from "../api/memoryApi";
import {
  knowledgeSearch,
  getIndexStatus,
  getEmbeddingStatus,
  getSearchHistory,
  listKnowledgeCollections,
  createKnowledgeCollection,
  listPinnedKnowledge,
  inspectRetrieval,
  optimizeIndexes,
  backfillEmbeddings,
} from "../api/knowledgeApi";
import {
  Brain,
  Search,
  Plus,
  Pin,
  PinOff,
  Trash2,
  Upload,
  RefreshCw,
  Network,
  Clock,
  FileText,
  Layers,
  BarChart3,
  Eye,
  Link2,
  X,
  ChevronRight,
  Database,
  Sparkles,
  Share2,
  FolderOpen,
  Activity,
} from "lucide-react";

const SCOPES = ["ALL", "USER", "CONVERSATION", "PROJECT", "WORKSPACE", "AGENT", "WORKFLOW", "DOCUMENT"];
const VIEWS = ["browse", "search", "graph", "collections", "status", "timeline", "documents"];

function StatusPill({ status }) {
  const map = {
    indexed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/25",
    embedding: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    chunking: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    parsing: "bg-sky-500/15 text-sky-300 border-sky-500/25",
    failed: "bg-red-500/15 text-red-400 border-red-500/25",
    queued: "bg-white/5 text-slate-300 border-white/10",
    running: "bg-[#F15B42]/15 text-[#F15B42] border-[#F15B42]/25",
    completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25",
  };
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md border ${map[status] || map.queued}`}>
      {status}
    </span>
  );
}

function ProgressBar({ value }) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
      <div className="h-full rounded-full bg-[#F15B42] transition-all duration-500" style={{ width: `${v}%` }} />
    </div>
  );
}

export default function MemoryPage() {
  const [view, setView] = useState("browse");
  const [memories, setMemories] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [collections, setCollections] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [history, setHistory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [scope, setScope] = useState("ALL");
  const [filterPinned, setFilterPinned] = useState(false);
  const [filterShared, setFilterShared] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [inspector, setInspector] = useState(null);
  const [docPreview, setDocPreview] = useState(null);
  const [chunks, setChunks] = useState([]);
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [content, setContent] = useState("");
  const [importance, setImportance] = useState(0.6);
  const [tags, setTags] = useState("");
  const [newScope, setNewScope] = useState("USER");
  const [collectionName, setCollectionName] = useState("");
  const [error, setError] = useState("");
  const [indexStatus, setIndexStatus] = useState(null);
  const [embeddingStatus, setEmbeddingStatus] = useState(null);
  const [knowledgeCollections, setKnowledgeCollections] = useState([]);
  const [searchMeta, setSearchMeta] = useState(null);
  const [retrievalInspector, setRetrievalInspector] = useState(null);
  const fileRef = useRef(null);

  const loadCore = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [mem, st, cols, docs, jobRes, hist, idxSt, embSt, kCols] = await Promise.all([
        getMemories({
          scope: scope === "ALL" ? undefined : scope,
          pinned: filterPinned || undefined,
          q: searchQuery || undefined,
          take: 100,
        }),
        getMemoryStats(),
        listCollections(),
        listMemoryDocuments({ take: 50 }),
        listIndexJobs({ take: 20 }),
        getMemoryHistory({ take: 40 }),
        getIndexStatus().catch(() => null),
        getEmbeddingStatus().catch(() => null),
        listKnowledgeCollections().catch(() => ({ items: [] })),
      ]);
      setMemories(mem.items || []);
      setTotal(mem.total || 0);
      setStats(st);
      setCollections(cols.items || []);
      setDocuments(docs.items || []);
      setJobs(jobRes.items || []);
      setHistory(hist.items || []);
      setIndexStatus(idxSt);
      setEmbeddingStatus(embSt);
      setKnowledgeCollections(kCols.items || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load memory engine");
    } finally {
      setLoading(false);
    }
  }, [scope, filterPinned, searchQuery]);

  useEffect(() => {
    loadCore();
    const t = setInterval(loadCore, 8000);
    return () => clearInterval(t);
  }, [loadCore]);

  const openInspector = async (id) => {
    setSelectedId(id);
    try {
      const data = await getMemory(id);
      setInspector(data);
      const g = await getGraph(id, { depth: 2 });
      setGraph(g);
    } catch (err) {
      setError(err.message);
    }
  };

  const openDocument = async (id) => {
    try {
      const [preview, chunkRes] = await Promise.all([
        getMemoryDocument(id),
        getDocumentChunks(id),
      ]);
      setDocPreview(preview);
      setChunks(chunkRes.items || []);
      setView("documents");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    setCreating(true);
    try {
      await createMemory({
        content: content.trim(),
        importance,
        scope: newScope,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        source: "manual",
      });
      setContent("");
      setTags("");
      await loadCore();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      await loadCore();
      return;
    }
    try {
      const result = await knowledgeSearch(searchQuery, { mode: "hybrid", topK: 20, rerank: true });
      setSearchResults(result);
      setSearchMeta({
        latencyMs: result.latencyMs,
        indexUsed: result.indexUsed,
        embeddingModel: result.embeddingModel,
        retrievalId: result.retrievalId,
        citations: result.citations,
      });
      if (result.retrievalId) {
        inspectRetrieval(result.retrievalId).then(setRetrievalInspector).catch(() => null);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpload = async (file) => {
    if (!file) return;
    try {
      await uploadMemoryDocument(file);
      await loadCore();
      setView("documents");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const displayed = useMemo(() => {
    if (searchResults?.results) {
      return searchResults.results.map((r) => ({
        id: r.memoryId || r.id,
        content: r.content,
        scope: r.scope,
        importance: r.importance ?? r.hybridScore,
        pinned: r.pinned,
        tags: r.tags || [],
        lastAccessed: r.lastAccessed,
        embedding: r.type === "chunk" ? true : undefined,
        _search: r,
        similarity: r.similarity ?? r.semanticScore ?? r.hybridScore,
      }));
    }
    let list = memories;
    if (filterShared) {
      const sharedIds = new Set(
        collections.filter((c) => c.isShared).flatMap((c) => (c.memories || []).map((m) => m.id)),
      );
      list = list.filter((m) => m.collectionId && (sharedIds.has(m.id) || true));
      list = list.filter((m) => m.collectionId);
    }
    return list;
  }, [memories, searchResults, filterShared, collections]);

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ background: "#0F172A" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="px-6 pt-5 pb-3 border-b border-white/[0.06] flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[#F15B42] mb-1">
              <Brain size={18} />
              <span className="text-xs uppercase tracking-[0.2em] font-medium">Knowledge Engine</span>
            </div>
            <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">Memory & RAG v2</h1>
            <p className="text-sm text-slate-400 mt-1">pgvector search, knowledge graph, collections, and semantic retrieval across every source.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn btn-ghost text-sm px-3 py-2 rounded-xl border border-white/10"
            >
              <Upload size={14} /> Ingest
            </button>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => handleUpload(e.target.files?.[0])}
            />
            <button type="button" onClick={loadCore} className="btn btn-ghost text-sm px-3 py-2 rounded-xl border border-white/10">
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </header>

        {/* Stats */}
        <div className="px-6 py-3 grid grid-cols-2 md:grid-cols-5 gap-3 border-b border-white/[0.06]">
          {[
            { label: "Memories", value: stats?.total ?? total, icon: Database },
            { label: "Vectors", value: embeddingStatus?.counts?.total ?? stats?.embedded ?? 0, icon: Sparkles },
            { label: "Pinned", value: stats?.pinned ?? 0, icon: Pin },
            { label: "Documents", value: stats?.documents ?? documents.length, icon: FileText },
            { label: "Jobs", value: jobs.filter((j) => j.status !== "completed").length, icon: Layers },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                <s.icon size={12} /> {s.label}
              </div>
              <div className="text-xl font-semibold text-slate-100">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="px-6 py-3 flex flex-wrap items-center gap-2 border-b border-white/[0.06]">
          <div className="flex items-center gap-2 flex-1 min-w-[220px] rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <Search size={14} className="text-slate-500" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Natural language search…"
              className="bg-transparent outline-none text-sm text-slate-200 w-full"
            />
            <button type="button" onClick={handleSearch} className="text-xs text-[#F15B42]">Search</button>
          </div>
          <div className="flex items-center gap-1 rounded-xl border border-white/10 p-1">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`text-xs px-3 py-1.5 rounded-lg capitalize ${view === v ? "bg-[#F15B42]/20 text-[#F15B42]" : "text-slate-400 hover:text-slate-200"}`}
              >
                {v}
              </button>
            ))}
          </div>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="text-xs rounded-xl border border-white/10 bg-[#1B2748] text-slate-200 px-3 py-2"
          >
            {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button
            type="button"
            onClick={() => setFilterPinned((p) => !p)}
            className={`text-xs px-3 py-2 rounded-xl border ${filterPinned ? "border-[#F15B42]/40 text-[#F15B42]" : "border-white/10 text-slate-400"}`}
          >
            <Pin size={12} className="inline mr-1" /> Pinned
          </button>
          <button
            type="button"
            onClick={() => setFilterShared((p) => !p)}
            className={`text-xs px-3 py-2 rounded-xl border ${filterShared ? "border-[#7CAADC]/40 text-[#7CAADC]" : "border-white/10 text-slate-400"}`}
          >
            <Share2 size={12} className="inline mr-1" /> Shared
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-3 text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex justify-between">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")}><X size={14} /></button>
          </div>
        )}

        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[300px_1fr_340px]">
          {/* Left: create + collections */}
          <aside className="border-r border-white/[0.06] overflow-y-auto p-4 space-y-4 hidden xl:block">
            <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <Plus size={12} /> New memory
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Fact, preference, decision…"
                className="w-full rounded-xl border border-white/10 bg-[#0F172A] text-sm text-slate-200 p-3 outline-none focus:border-[#F15B42]/40"
              />
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="tags, comma, separated"
                className="w-full rounded-xl border border-white/10 bg-[#0F172A] text-sm text-slate-200 px-3 py-2 outline-none"
              />
              <div className="flex gap-2">
                <select value={newScope} onChange={(e) => setNewScope(e.target.value)} className="flex-1 text-xs rounded-xl border border-white/10 bg-[#0F172A] text-slate-200 px-2 py-2">
                  {SCOPES.filter((s) => s !== "ALL").map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={importance}
                  onChange={(e) => setImportance(Number(e.target.value))}
                  className="flex-1"
                  title={`Importance ${importance}`}
                />
              </div>
              <button type="submit" disabled={creating} className="btn btn-primary w-full text-sm py-2.5 rounded-xl text-white">
                {creating ? "Saving…" : "Store memory"}
              </button>
            </form>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <FolderOpen size={12} /> Collections
              </div>
              <div className="flex gap-2">
                <input
                  value={collectionName}
                  onChange={(e) => setCollectionName(e.target.value)}
                  placeholder="Name"
                  className="flex-1 rounded-lg border border-white/10 bg-[#0F172A] text-xs px-2 py-1.5 text-slate-200"
                />
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded-lg bg-white/5 text-slate-300"
                  onClick={async () => {
                    if (!collectionName.trim()) return;
                    await createCollection({ name: collectionName.trim() });
                    setCollectionName("");
                    loadCore();
                  }}
                >
                  Add
                </button>
              </div>
              {collections.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm text-slate-300 py-1">
                  <span>{c.name} <span className="text-slate-500 text-xs">({c._count?.memories || 0})</span></span>
                  <button type="button" onClick={async () => { await deleteCollection(c.id); loadCore(); }} className="text-slate-500 hover:text-red-400">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2">
                <BarChart3 size={12} /> Index progress
              </div>
              {jobs.length === 0 && <p className="text-xs text-slate-500">No jobs yet</p>}
              {jobs.slice(0, 8).map((j) => (
                <div key={j.id} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span className="truncate mr-2">{j.document?.name || j.type}</span>
                    <StatusPill status={j.status} />
                  </div>
                  <ProgressBar value={j.progress} />
                </div>
              ))}
            </div>
          </aside>

          {/* Main */}
          <main className="overflow-y-auto p-4 space-y-3">
            {loading && !memories.length ? (
              <div className="text-slate-400 text-sm py-20 text-center">Loading memory engine…</div>
            ) : null}

            {view === "browse" && (
              <AnimatePresence mode="popLayout">
                {displayed.map((m) => (
                  <motion.div
                    key={m.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className={`rounded-2xl border px-4 py-3 cursor-pointer transition ${
                      selectedId === m.id ? "border-[#F15B42]/35 bg-[#F15B42]/5" : "border-white/[0.06] bg-white/[0.02] hover:border-white/12"
                    }`}
                    onClick={() => openInspector(m.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase tracking-wider text-slate-500">{m.scope}</span>
                          {m.pinned && <Pin size={11} className="text-[#F15B42]" />}
                          {Array.isArray(m.embedding) && m.embedding.length > 0 && (
                            <span className="text-[10px] text-emerald-400">embedded</span>
                          )}
                          {m.tags?.slice(0, 4).map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">{t}</span>
                          ))}
                        </div>
                        <p className="text-sm text-slate-200 leading-relaxed line-clamp-3">{m.content}</p>
                        <div className="mt-2 text-[11px] text-slate-500 flex gap-3">
                          <span>imp {(Number(m.importance) || 0).toFixed(2)}</span>
                          {m.lastAccessed && <span>accessed {new Date(m.lastAccessed).toLocaleString()}</span>}
                          {m._search?.hybridScore != null && <span>score {m._search.hybridScore.toFixed(3)}</span>}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400"
                          onClick={async () => { await pinMemory(m.id, !m.pinned); loadCore(); }}
                        >
                          {m.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button
                          type="button"
                          className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 hover:text-red-400"
                          onClick={async () => { await deleteMemory(m.id); loadCore(); }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
                {!displayed.length && !loading && (
                  <div className="text-center text-slate-500 py-16 text-sm">No memories match this filter.</div>
                )}
              </AnimatePresence>
            )}

            {view === "search" && (
              <div className="space-y-3">
                {searchMeta && (
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><span className="text-slate-500">Latency</span><div className="text-slate-200">{searchMeta.latencyMs}ms</div></div>
                    <div><span className="text-slate-500">Index</span><div className="text-slate-200">{searchMeta.indexUsed || "hnsw"}</div></div>
                    <div><span className="text-slate-500">Model</span><div className="text-slate-200 truncate">{searchMeta.embeddingModel || "auto"}</div></div>
                    <div><span className="text-slate-500">Results</span><div className="text-slate-200">{searchResults?.count ?? 0}</div></div>
                  </div>
                )}
                {(searchResults?.results || []).map((r) => (
                  <div key={`${r.type}-${r.id}`} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1">
                      <span className="uppercase">{r.type}</span>
                      {r.similarity != null && <span className="text-emerald-400">sim {(r.similarity * 100).toFixed(1)}%</span>}
                      {r.hybridScore != null && <span>score {r.hybridScore.toFixed(3)}</span>}
                      {r.documentName && <span>{r.documentName}</span>}
                    </div>
                    <p className="text-sm text-slate-200 line-clamp-4">{r.content}</p>
                  </div>
                ))}
                {searchMeta?.citations?.length > 0 && (
                  <div className="rounded-2xl border border-[#F15B42]/20 p-4">
                    <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Citations</div>
                    {searchMeta.citations.map((c) => (
                      <div key={c.index} className="text-xs text-slate-400 border-t border-white/5 py-2">
                        [{c.index}] {c.document || c.source} · conf {c.confidence}
                        <div className="text-slate-300 mt-1 line-clamp-2">{c.snippet}</div>
                      </div>
                    ))}
                  </div>
                )}
                {!searchResults?.results?.length && (
                  <p className="text-slate-500 text-sm">Run a search to see pgvector retrieval results with similarity scores.</p>
                )}
              </div>
            )}

            {view === "collections" && (
              <div className="space-y-3">
                <form
                  className="flex gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!collectionName.trim()) return;
                    await createKnowledgeCollection({ name: collectionName.trim() });
                    setCollectionName("");
                    loadCore();
                  }}
                >
                  <input
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                    placeholder="New knowledge collection"
                    className="flex-1 rounded-xl border border-white/10 bg-[#0F172A] text-sm px-3 py-2 text-slate-200"
                  />
                  <button type="submit" className="text-xs px-3 py-2 rounded-xl bg-[#F15B42]/20 text-[#F15B42]">Create</button>
                </form>
                {knowledgeCollections.map((c) => (
                  <div key={c.id} className="rounded-2xl border border-white/[0.06] px-4 py-3 flex justify-between">
                    <div>
                      <div className="text-sm text-slate-100">{c.name}</div>
                      <div className="text-xs text-slate-500">{c._count?.nodes ?? 0} nodes · {c.pinned ? "pinned" : "active"}</div>
                    </div>
                    {c.color && <span className="w-3 h-3 rounded-full" style={{ background: c.color }} />}
                  </div>
                ))}
                {!knowledgeCollections.length && <p className="text-slate-500 text-sm">No knowledge collections yet.</p>}
              </div>
            )}

            {view === "status" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-3"><Activity size={14} /> Vector index status</div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-slate-500 text-xs">Memory vectors</span><div>{indexStatus?.vectorCount?.memories ?? 0}</div></div>
                    <div><span className="text-slate-500 text-xs">Chunk vectors</span><div>{indexStatus?.vectorCount?.chunks ?? 0}</div></div>
                    <div><span className="text-slate-500 text-xs">Recommended</span><div>{indexStatus?.recommendedIndex ?? "hnsw"}</div></div>
                    <div><span className="text-slate-500 text-xs">HNSW</span><div>{indexStatus?.metrics?.hnsw ? "active" : "pending"}</div></div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button type="button" onClick={async () => { await optimizeIndexes(); loadCore(); }} className="text-xs px-3 py-2 rounded-xl border border-white/10 text-slate-300">Optimize indexes</button>
                    <button type="button" onClick={async () => { await backfillEmbeddings(); loadCore(); }} className="text-xs px-3 py-2 rounded-xl border border-[#F15B42]/30 text-[#F15B42]">Backfill vectors</button>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <div className="text-xs text-slate-500 mb-2">Embedding pipeline</div>
                  <div className="text-sm text-slate-200">Pending memories: {embeddingStatus?.pendingMemories ?? 0}</div>
                  <div className="text-sm text-slate-200">Total indexed: {embeddingStatus?.counts?.total ?? 0}</div>
                </div>
                {retrievalInspector?.citations?.length > 0 && (
                  <div className="rounded-2xl border border-white/[0.07] p-4">
                    <div className="text-xs text-slate-500 mb-2">Last retrieval inspector</div>
                    {retrievalInspector.citations.slice(0, 5).map((c) => (
                      <div key={c.id} className="text-xs text-slate-400 py-1 border-t border-white/5">
                        {c.sourceType} · sim {(c.similarity * 100).toFixed(1)}% · conf {(c.confidence * 100).toFixed(1)}%
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "timeline" && (
              <div className="space-y-2">
                {history.map((h) => (
                  <div key={h.id} className="flex gap-3 items-start rounded-xl border border-white/[0.06] px-3 py-2">
                    <Clock size={14} className="text-slate-500 mt-0.5" />
                    <div>
                      <div className="text-xs text-slate-400">{new Date(h.createdAt).toLocaleString()} · {h.action}</div>
                      <div className="text-sm text-slate-200 line-clamp-2">{h.memory?.content || h.query || "—"}</div>
                    </div>
                  </div>
                ))}
                {!history.length && <p className="text-slate-500 text-sm">No access history yet.</p>}
              </div>
            )}

            {view === "graph" && (
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 min-h-[420px]">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-4">
                  <Network size={14} /> Graph view {selectedId ? `· node ${selectedId.slice(0, 8)}` : "· select a memory"}
                </div>
                {!graph && <p className="text-slate-500 text-sm">Open a memory inspector to load its relationship graph.</p>}
                {graph && (
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-2">Nodes ({graph.nodes?.length || 0})</div>
                      <div className="space-y-2 max-h-[360px] overflow-y-auto">
                        {graph.nodes?.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => openInspector(n.id)}
                            className="w-full text-left rounded-xl border border-white/10 px-3 py-2 hover:border-[#F15B42]/30"
                          >
                            <div className="text-[10px] text-slate-500 uppercase">{n.scope}</div>
                            <div className="text-sm text-slate-200 line-clamp-2">{n.content}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-2">Edges ({graph.edges?.length || 0})</div>
                      <div className="space-y-2 max-h-[360px] overflow-y-auto">
                        {graph.edges?.map((e) => (
                          <div key={e.id} className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400">
                            <span className="text-[#F15B42]">{e.type}</span>
                            <div className="mt-1 text-slate-300 line-clamp-1">{e.from?.content}</div>
                            <ChevronRight size={12} className="inline text-slate-600" />
                            <div className="text-slate-300 line-clamp-1">{e.to?.content}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === "documents" && (
              <div className="space-y-3">
                {documents.map((d) => (
                  <div key={d.id} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" className="text-left min-w-0" onClick={() => openDocument(d.id)}>
                        <div className="flex items-center gap-2 mb-1">
                          <FileText size={14} className="text-slate-400" />
                          <span className="text-sm text-slate-100 truncate">{d.name}</span>
                          <StatusPill status={d.status} />
                        </div>
                        <div className="text-[11px] text-slate-500 flex gap-3">
                          <span>{d.fileType || "file"}</span>
                          <span>{d.chunkCount || 0} chunks</span>
                          <span>{d.tokenCount || 0} tokens</span>
                        </div>
                        <div className="mt-2"><ProgressBar value={d.indexProgress} /></div>
                      </button>
                      <div className="flex gap-1">
                        <button type="button" className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400" onClick={async () => { await reindexDocument(d.id); loadCore(); }}>
                          <RefreshCw size={14} />
                        </button>
                        <button type="button" className="p-1.5 rounded-lg hover:bg-white/5 text-red-400" onClick={async () => { await deleteMemoryDocument(d.id); loadCore(); }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!documents.length && <p className="text-slate-500 text-sm">Upload PDF, DOCX, TXT, MD, code, JSON, CSV, or images to begin indexing.</p>}

                {docPreview && (
                  <div className="rounded-2xl border border-[#F15B42]/20 bg-[#F15B42]/5 p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="text-sm text-slate-100 font-medium">{docPreview.name}</div>
                      <button type="button" onClick={() => setDocPreview(null)}><X size={14} className="text-slate-400" /></button>
                    </div>
                    <pre className="text-xs text-slate-300 whitespace-pre-wrap max-h-48 overflow-y-auto bg-black/20 rounded-xl p-3">{docPreview.contentPreview}</pre>
                    <div className="text-xs uppercase tracking-wider text-slate-500">Chunk viewer</div>
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {(chunks.length ? chunks : docPreview.chunks || []).map((c) => (
                        <div key={c.id} className="rounded-xl border border-white/10 px-3 py-2">
                          <div className="flex gap-2 text-[10px] text-slate-500 mb-1">
                            <span>#{c.chunkIndex}</span>
                            <span>{c.chunkType}</span>
                            <span>{c.tokenCount} tok</span>
                            {(c.hasEmbedding || c.embedding) && <span className="text-emerald-400">embedded</span>}
                            {c.heading && <span>{c.heading}</span>}
                          </div>
                          <p className="text-xs text-slate-300 line-clamp-4">{c.preview || c.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </main>

          {/* Inspector */}
          <aside className="border-l border-white/[0.06] overflow-y-auto p-4 hidden xl:block">
            <div className="text-xs uppercase tracking-wider text-slate-500 flex items-center gap-2 mb-3">
              <Eye size={12} /> Memory inspector
            </div>
            {!inspector && <p className="text-sm text-slate-500">Select a memory to inspect scoring, embeddings, and relationships.</p>}
            {inspector && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
                  <div className="text-[10px] text-slate-500 uppercase mb-1">{inspector.scope}</div>
                  <p className="text-sm text-slate-100 leading-relaxed">{inspector.content}</p>
                </div>
                {inspector.scoring && (
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries({
                      score: inspector.scoring.score,
                      importance: inspector.scoring.importance,
                      recency: inspector.scoring.recency,
                      decay: inspector.scoring.decay,
                      confidence: inspector.scoring.confidence,
                      frequency: inspector.scoring.frequency,
                    }).map(([k, v]) => (
                      <div key={k} className="rounded-xl border border-white/10 px-2 py-2">
                        <div className="text-[10px] text-slate-500 uppercase">{k}</div>
                        <div className="text-sm text-slate-200">{typeof v === "number" ? v.toFixed(3) : v}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-400 space-y-1">
                  <div>Embedding: {Array.isArray(inspector.embedding) && inspector.embedding.length ? `${inspector.embeddingDim || inspector.embedding.length}-d · ${inspector.embeddingModel || "auto"} · pgvector` : "not embedded"}</div>
                  <div>Version: {inspector.version}</div>
                  <div>Source: {inspector.source || "—"}</div>
                  <div>Hash: {inspector.contentHash?.slice(0, 12) || "—"}</div>
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-slate-500 flex items-center gap-1"><Link2 size={12} /> Relationships</div>
                  {(inspector.edges || []).map((e) => (
                    <div key={e.id} className="text-xs text-slate-400 border border-white/10 rounded-lg px-2 py-1.5">
                      {e.type}: {(e.fromId === inspector.id ? e.to?.content : e.from?.content)?.slice(0, 80)}
                    </div>
                  ))}
                  {selectedId && memories[0] && selectedId !== memories[0].id && (
                    <button
                      type="button"
                      className="text-xs text-[#7CAADC]"
                      onClick={async () => {
                        await createRelationship({ fromId: selectedId, toId: memories[0].id, type: "related" });
                        openInspector(selectedId);
                      }}
                    >
                      Link to newest memory
                    </button>
                  )}
                </div>
                {collections[0] && (
                  <button
                    type="button"
                    className="text-xs w-full rounded-xl border border-white/10 py-2 text-slate-300"
                    onClick={async () => {
                      await addToCollection(collections[0].id, inspector.id);
                      loadCore();
                    }}
                  >
                    Add to “{collections[0].name}”
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs w-full rounded-xl border border-white/10 py-2 text-slate-300"
                  onClick={async () => {
                    await updateMemory(inspector.id, { content: inspector.content });
                    openInspector(inspector.id);
                  }}
                >
                  Re-score / refresh
                </button>
              </div>
            )}

            {stats?.byScope && (
              <div className="mt-6">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Scope distribution</div>
                {Object.entries(stats.byScope).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-xs text-slate-400 py-1 border-b border-white/[0.04]">
                    <span>{k}</span><span>{v}</span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
