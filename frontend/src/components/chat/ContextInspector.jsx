/**
 * Context Inspector — token budget, ranking, compression, retrieved sources, timeline.
 */

import { useMemo, useState, useEffect } from "react";
import {
  X,
  Layers,
  Search,
  FileText,
  Brain,
  FolderTree,
  Gauge,
  GitBranch,
  Clock,
  Filter,
  ChevronRight,
} from "lucide-react";
import { contextApi } from "../../api/contextApi";

function pct(part, whole) {
  if (!whole) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function BudgetBar({ allocation = {}, usedTokens = 0, packBudget = 0 }) {
  const entries = Object.entries(allocation || {});
  const total = packBudget || entries.reduce((s, [, v]) => s + v, 0) || 1;
  const colors = {
    system: "bg-slate-400",
    planner: "bg-violet-400",
    tools: "bg-amber-400",
    retrieved: "bg-sky-400",
    conversation: "bg-emerald-400",
    response: "bg-rose-400",
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>Token budget</span>
        <span className="font-mono">
          {usedTokens} / {packBudget || total}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-black/40 overflow-hidden flex">
        {entries.map(([k, v]) => (
          <div
            key={k}
            className={`${colors[k] || "bg-slate-500"} h-full`}
            style={{ width: `${pct(v, total)}%` }}
            title={`${k}: ${v}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([k, v]) => (
          <span key={k} className="text-[9px] text-slate-500 font-mono">
            <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${colors[k] || "bg-slate-500"}`} />
            {k}:{v}
          </span>
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ score }) {
  const s = Math.round((Number(score) || 0) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 rounded bg-black/40 overflow-hidden">
        <div className="h-full bg-[#F15B42]" style={{ width: `${s}%` }} />
      </div>
      <span className="text-[9px] font-mono text-slate-400 w-8 text-right">{(Number(score) || 0).toFixed(2)}</span>
    </div>
  );
}

function ItemRow({ item, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
        selected
          ? "border-[#F15B42]/40 bg-[#F15B42]/10"
          : "border-transparent hover:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold text-slate-200 truncate">
          {item.source}/{item.type}
        </span>
        <span className="text-[9px] text-slate-500 font-mono shrink-0">{item.tokenCount || item.tokens || 0} tok</span>
      </div>
      <ScoreBar score={item.score} />
      <p className="text-[9px] text-slate-500 mt-1 line-clamp-2">{item.reason || item.snippet}</p>
    </button>
  );
}

export default function ContextInspector({ data, liveContext, onClose }) {
  const [tab, setTab] = useState("budget");
  const [session, setSession] = useState(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const sessionId = liveContext?.sessionId || data?.contextSessionId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!sessionId) return;
      setLoading(true);
      try {
        const s = await contextApi.inspect(sessionId);
        if (!cancelled) setSession(s);
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const obs = liveContext?.observability || {};
  const allocation = liveContext?.allocation || session?.allocation || {};
  const usedTokens = liveContext?.tokens ?? session?.usedTokens ?? 0;
  const packBudget = liveContext?.budget || session?.tokenBudget || 0;
  const compressionRatio = liveContext?.compressionRatio ?? session?.compressionRatio ?? 1;
  const dropped = liveContext?.dropped ?? session?.dropped ?? [];
  const reasoningPath = liveContext?.reasoningPath || session?.reasoningPath || [];
  const sections = liveContext?.sections || [];
  const graph = liveContext?.graph || session?.graph || {};

  const retrieved = useMemo(() => {
    const fromSession = session?.retrieved || [];
    const fromLive = [
      ...(obs.retrieved?.memories || []),
      ...(obs.retrieved?.files || []),
      ...(obs.retrieved?.documents || []),
      ...(obs.retrieved?.executions || []),
    ];
    const merged = fromSession.length ? fromSession : fromLive;
    const q = search.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter(
      (i) =>
        String(i.content || "").toLowerCase().includes(q) ||
        String(i.source || "").toLowerCase().includes(q) ||
        String(i.reason || "").toLowerCase().includes(q),
    );
  }, [session, obs, search]);

  const memories = retrieved.filter((i) =>
    ["semantic_memory", "long_term_memory", "short_term_memory", "pinned", "user_profile"].includes(
      i.source,
    ),
  );
  const files = retrieved.filter((i) =>
    ["project_files", "repository", "git_history"].includes(i.source),
  );
  const documents = retrieved.filter((i) => i.source === "documents");

  const ranking = liveContext?.observability?.ranking?.topScores || session?.scores || [];

  const tabs = [
    { id: "budget", label: "Budget", icon: Gauge },
    { id: "graph", label: "Graph", icon: GitBranch },
    { id: "memories", label: "Memories", icon: Brain },
    { id: "files", label: "Files", icon: FolderTree },
    { id: "documents", label: "Docs", icon: FileText },
    { id: "ranking", label: "Ranking", icon: Layers },
    { id: "timeline", label: "Timeline", icon: Clock },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[90vh] bg-[#0D1626] border border-white/[0.08] rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Layers size={14} className="text-[#F15B42]" />
            <span className="text-xs font-bold text-slate-200">Context Inspector</span>
            {liveContext?.agent && (
              <span className="text-[10px] font-semibold text-sky-400">{liveContext.agent}</span>
            )}
            {sessionId && (
              <span className="text-[10px] text-slate-500 font-mono">{String(sessionId).slice(0, 8)}</span>
            )}
            {loading && <span className="text-[10px] text-slate-500">loading…</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-2 flex flex-wrap gap-4 text-[10px] text-slate-500 border-b border-white/[0.04]">
          <span>Used: {usedTokens} tok</span>
          <span>Budget: {packBudget} tok</span>
          <span>Compression: {(Number(compressionRatio) * 100).toFixed(0)}%</span>
          <span>Retrieved: {retrieved.length}</span>
          <span>Dropped: {Array.isArray(dropped) ? dropped.length : 0}</span>
        </div>

        <div className="flex gap-1 px-4 pt-3 text-[10px] font-bold overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 shrink-0 ${
                  tab === t.id
                    ? "bg-white/[0.08] text-white"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                <Icon size={11} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {tab === "budget" && (
              <>
                <BudgetBar allocation={allocation} usedTokens={usedTokens} packBudget={packBudget} />
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Packed sections</p>
                  {sections.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] text-slate-400">
                      <ChevronRight size={10} />
                      <span className="text-slate-200">{s.label}</span>
                      <span className="font-mono">{s.tokens} tok</span>
                      {s.score != null && <span className="font-mono">score={Number(s.score).toFixed(2)}</span>}
                    </div>
                  ))}
                  {!sections.length && (
                    <p className="text-[10px] text-slate-600">No packed sections in live event yet.</p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Dropped</p>
                  {(Array.isArray(dropped) ? dropped : []).slice(0, 20).map((d, i) => (
                    <div key={i} className="text-[9px] text-slate-500 font-mono">
                      {d.label || d.source}: {d.reason} ({d.tokens || 0} tok)
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === "graph" && (
              <div className="space-y-3">
                <p className="text-[10px] text-slate-400">
                  Files: {(graph.files || []).length} · Symbols: {(graph.symbols || []).length} · Routes:{" "}
                  {(graph.routes || []).length} · Models: {(graph.models || []).length}
                </p>
                <pre className="text-[9px] font-mono text-slate-500 bg-black/40 rounded-xl p-3 overflow-auto max-h-96">
                  {JSON.stringify(
                    {
                      dependencies: (graph.dependencies || []).slice(0, 40),
                      routes: (graph.routes || []).slice(0, 20),
                      models: graph.models || [],
                      envVars: (graph.envVars || []).slice(0, 30),
                      symbols: (graph.symbols || []).slice(0, 30),
                    },
                    null,
                    2,
                  )}
                </pre>
              </div>
            )}

            {(tab === "memories" || tab === "files" || tab === "documents") && (
              <>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-2.5 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search retrieved context…"
                    className="w-full bg-black/40 border border-white/[0.06] rounded-lg pl-8 pr-3 py-2 text-[11px] text-slate-200 outline-none focus:border-[#F15B42]/40"
                  />
                </div>
                <div className="space-y-1">
                  {(tab === "memories" ? memories : tab === "files" ? files : documents).map((item, i) => (
                    <ItemRow
                      key={item.id || item.sourceId || i}
                      item={item}
                      selected={selected === item}
                      onSelect={setSelected}
                    />
                  ))}
                  {(tab === "memories" ? memories : tab === "files" ? files : documents).length === 0 && (
                    <p className="text-[10px] text-slate-600 flex items-center gap-1">
                      <Filter size={10} /> No items in this category
                    </p>
                  )}
                </div>
              </>
            )}

            {tab === "ranking" && (
              <div className="space-y-2">
                {(ranking || []).slice(0, 30).map((r, i) => (
                  <div key={i} className="px-3 py-2 rounded-lg bg-black/30">
                    <div className="flex justify-between text-[10px]">
                      <span className="text-slate-200 font-bold">
                        {r.source || r.itemKey}/{r.type || ""}
                      </span>
                      <span className="font-mono text-slate-400">
                        {(r.finalScore ?? r.score ?? 0).toFixed(3)}
                      </span>
                    </div>
                    <ScoreBar score={r.finalScore ?? r.score} />
                    <p className="text-[9px] text-slate-500 mt-1">{r.reason}</p>
                    {r.factors && (
                      <pre className="text-[8px] text-slate-600 mt-1 font-mono overflow-auto">
                        {JSON.stringify(r.factors)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "timeline" && (
              <div className="space-y-2">
                {(Array.isArray(reasoningPath) ? reasoningPath : []).map((step, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className="w-5 h-5 rounded-full bg-white/[0.06] flex items-center justify-center text-[9px] text-slate-400 shrink-0">
                      {i + 1}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-200">{step.step}</p>
                      <p className="text-[9px] text-slate-500">{step.detail}</p>
                    </div>
                  </div>
                ))}
                {!reasoningPath?.length && (
                  <p className="text-[10px] text-slate-600">Waiting for context build events…</p>
                )}
              </div>
            )}
          </div>

          {selected && (
            <div className="w-[320px] border-l border-white/[0.06] p-4 overflow-y-auto bg-black/20">
              <p className="text-[10px] font-bold text-slate-300 mb-2">Selected item</p>
              <p className="text-[9px] text-slate-500 mb-1">
                {selected.source} · {selected.type} · score={(selected.score || 0).toFixed(3)}
              </p>
              <p className="text-[9px] text-amber-400/80 mb-2">{selected.reason}</p>
              <pre className="text-[9px] font-mono text-slate-400 whitespace-pre-wrap">
                {String(selected.content || selected.snippet || "").slice(0, 4000)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
