/**
 * Execution Inspector — tool graph, timeline, args, outputs, logs, retries, latency, replay.
 */

import { useMemo, useState } from "react";
import {
  X,
  Copy,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Wrench,
  GitBranch,
} from "lucide-react";

function formatMs(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function StatusIcon({ status }) {
  const s = String(status || "").toLowerCase();
  if (s === "running" || s === "pending") {
    return <Loader2 size={12} className="animate-spin text-sky-400" />;
  }
  if (s === "completed" || s === "done") {
    return <CheckCircle2 size={12} className="text-emerald-400" />;
  }
  return <XCircle size={12} className="text-red-400" />;
}

function JsonBlock({ value, max = 4000 }) {
  const text = useMemo(() => {
    try {
      return JSON.stringify(value ?? null, null, 2).slice(0, max);
    } catch {
      return String(value);
    }
  }, [value, max]);

  return (
    <pre className="text-[10px] font-mono text-slate-400 bg-black/40 rounded-lg p-2.5 overflow-auto max-h-40 whitespace-pre-wrap">
      {text}
    </pre>
  );
}

export default function ExecutionInspector({ data, onClose, onReplay }) {
  const [selectedToolId, setSelectedToolId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState("timeline");

  const toolCalls = data?.toolCalls || [];
  const steps = data?.steps || [];
  const selected = toolCalls.find((t) => t.id === selectedToolId) || toolCalls[0];

  const graph = useMemo(() => {
    const byAgent = {};
    for (const t of toolCalls) {
      const a = t.agentType || "unknown";
      if (!byAgent[a]) byAgent[a] = [];
      byAgent[a].push(t);
    }
    return byAgent;
  }, [toolCalls]);

  const running = toolCalls.filter((t) => String(t.status).toLowerCase() === "running");

  async function copyOutput() {
    const text = JSON.stringify(selected?.result ?? selected?.output ?? {}, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[88vh] bg-[#0D1626] border border-white/[0.08] rounded-3xl flex flex-col overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <Wrench size={14} className="text-[#F15B42]" />
            <span className="text-xs font-bold text-slate-200">Execution Inspector</span>
            <span className="text-[10px] text-slate-500 font-mono">{data?.id?.slice(0, 8)}</span>
            <span className="text-[10px] font-semibold text-sky-400">{data?.status}</span>
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
          <span>Tokens: {data?.totalTokens ?? 0}</span>
          <span>Cost: ${(data?.estimatedCost || 0).toFixed(6)}</span>
          <span>Tools: {toolCalls.length}</span>
          <span>Steps: {steps.length}</span>
          {running.length > 0 && (
            <span className="text-amber-400 flex items-center gap-1">
              <Loader2 size={10} className="animate-spin" /> {running.length} running
            </span>
          )}
        </div>

        <div className="flex gap-1 px-4 pt-3 text-[10px] font-bold">
          {["timeline", "graph", "tools", "transitions"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg capitalize ${
                tab === t ? "bg-white/[0.08] text-slate-100" : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {tab === "timeline" && (
              <>
                {steps.map((s) => (
                  <div key={s.id} className="rounded-xl border border-white/[0.05] bg-black/20 p-3">
                    <div className="flex items-center gap-2 text-[11px]">
                      <StatusIcon status={s.status} />
                      <span className="font-semibold text-slate-200 capitalize">{s.agentType}</span>
                      <span className="text-slate-600">{s.status}</span>
                      <span className="ml-auto text-slate-600 flex items-center gap-1">
                        <Clock size={10} /> {formatMs(s.durationMs)}
                      </span>
                    </div>
                    {(s.output || s.error) && (
                      <p className="mt-1.5 text-[10px] text-slate-500 line-clamp-3">
                        {s.error || s.output}
                      </p>
                    )}
                  </div>
                ))}
                <div className="pt-2 text-[9px] font-black uppercase tracking-widest text-slate-600">
                  Tool Timeline
                </div>
                {toolCalls.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedToolId(t.id);
                      setTab("tools");
                    }}
                    className="w-full text-left rounded-xl border border-white/[0.05] bg-black/20 p-3 hover:border-white/[0.12]"
                  >
                    <div className="flex items-center gap-2 text-[11px]">
                      <StatusIcon status={t.status} />
                      <span className="font-mono text-slate-200">{t.toolName}</span>
                      <span className="text-slate-600">{t.agentType}</span>
                      <span className="ml-auto text-slate-600">{formatMs(t.durationMs)}</span>
                    </div>
                    {t.error && <p className="mt-1 text-[10px] text-red-400">{t.error}</p>}
                  </button>
                ))}
              </>
            )}

            {tab === "graph" && (
              <div className="space-y-3">
                {Object.entries(graph).map(([agent, tools]) => (
                  <div key={agent} className="rounded-xl border border-white/[0.05] p-3">
                    <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-200 mb-2">
                      <GitBranch size={12} className="text-[#7CAADC]" />
                      {agent}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tools.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            setSelectedToolId(t.id);
                            setTab("tools");
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-[10px] font-mono text-slate-300 hover:bg-white/[0.08]"
                        >
                          <StatusIcon status={t.status} />{" "}
                          <span className="align-middle ml-1">{t.toolName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {!Object.keys(graph).length && (
                  <p className="text-[11px] text-slate-600 italic">No tool calls yet</p>
                )}
              </div>
            )}

            {tab === "tools" && selected && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <StatusIcon status={selected.status} />
                  <span className="font-mono text-sm text-slate-100">{selected.toolName}</span>
                  <span className="text-[10px] text-slate-500">{formatMs(selected.durationMs)}</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={copyOutput}
                    className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/[0.06]"
                  >
                    <Copy size={11} /> {copied ? "Copied" : "Copy output"}
                  </button>
                  {onReplay && (
                    <button
                      type="button"
                      onClick={() => onReplay(selected)}
                      className="flex items-center gap-1 text-[10px] font-bold text-sky-400 hover:bg-sky-500/10 px-2 py-1 rounded-lg"
                    >
                      <RotateCcw size={11} /> Replay
                    </button>
                  )}
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">
                    Arguments
                  </p>
                  <JsonBlock value={selected.arguments} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">
                    Output
                  </p>
                  <JsonBlock value={selected.result} />
                </div>
                {selected.error && (
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-red-500/80 mb-1">
                      Error
                    </p>
                    <p className="text-[11px] text-red-400 font-mono">{selected.error}</p>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-slate-600">Latency</div>
                    <div className="text-slate-200 font-semibold">{formatMs(selected.durationMs)}</div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-slate-600">Status</div>
                    <div className="text-slate-200 font-semibold">{selected.status}</div>
                  </div>
                  <div className="rounded-lg bg-black/30 p-2">
                    <div className="text-slate-600">Agent</div>
                    <div className="text-slate-200 font-semibold">{selected.agentType || "—"}</div>
                  </div>
                </div>
              </div>
            )}

            {tab === "tools" && !selected && (
              <p className="text-[11px] text-slate-600 italic">Select a tool call</p>
            )}

            {tab === "transitions" &&
              (data?.transitions || []).map((t) => (
                <div key={t.id} className="text-[11px] font-mono text-slate-400">
                  {t.fromState || "∅"} → {t.toState}{" "}
                  {t.reason ? <span className="text-slate-600">({t.reason})</span> : null}
                </div>
              ))}
          </div>

          {tab !== "tools" && toolCalls.length > 0 && (
            <div className="w-56 border-l border-white/[0.05] overflow-y-auto p-3 hidden md:block">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-2">
                Running / Recent
              </p>
              {toolCalls.slice(-12).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelectedToolId(t.id);
                    setTab("tools");
                  }}
                  className="w-full text-left flex items-center gap-1.5 py-1.5 text-[10px] text-slate-400 hover:text-slate-200"
                >
                  <StatusIcon status={t.status} />
                  <span className="font-mono truncate">{t.toolName}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
