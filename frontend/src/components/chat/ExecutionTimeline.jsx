import { useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  Ban,
  RotateCcw,
  Sparkles,
  Wrench,
  Brain,
  Clock,
  Coins,
} from "lucide-react";

const STATE_LABELS = {
  QUEUED: "Queued",
  PLANNING: "Planning…",
  RESEARCHING: "Researching…",
  ARCHITECTING: "Architecting…",
  CODING: "Editing Files…",
  TESTING: "Testing…",
  REVIEWING: "Reviewing…",
  FIXING: "Fixing…",
  COMPLETED: "Completed",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

function StatusIcon({ status }) {
  const s = String(status || "").toLowerCase();
  if (s === "running" || s.endsWith("ing") || s === "queued" || s === "planning") {
    return <Loader2 size={13} className="animate-spin text-[#7CAADC]" />;
  }
  if (s === "completed" || s === "done") {
    return <CheckCircle2 size={13} className="text-emerald-400" />;
  }
  if (s === "failed" || s === "cancelled") {
    return <XCircle size={13} className="text-red-400" />;
  }
  return <Circle size={13} className="text-slate-600" />;
}

function formatMs(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Live multi-agent execution timeline for chat.
 */
export default function ExecutionTimeline({
  executionId,
  status,
  plan,
  agents,
  tools,
  logs,
  tokens,
  cost,
  currentAgent,
  currentTool,
  reasoning,
  onCancel,
  onRetry,
  onInspect,
}) {
  const [openLogs, setOpenLogs] = useState(true);
  const [openReasoning, setOpenReasoning] = useState(false);
  const [openTree, setOpenTree] = useState(true);

  const running = status && !["COMPLETED", "FAILED", "CANCELLED"].includes(status);

  return (
    <div className="w-full max-w-[78%] rounded-2xl border border-white/[0.07] bg-[#0D1626]/90 overflow-hidden shadow-lg">
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/[0.05]">
        <Sparkles size={13} className="text-[#F15B42]" />
        <span className="text-[11px] font-bold text-slate-200 tracking-wide">
          Agent Runtime
        </span>
        <span className="text-[10px] font-semibold text-[#7CAADC]">
          {STATE_LABELS[status] || status || "Starting…"}
        </span>
        {currentAgent && (
          <span className="text-[10px] text-slate-500 ml-1">
            · {currentAgent}
          </span>
        )}
        <div className="flex-1" />
        {executionId && (
          <button
            type="button"
            onClick={() => onInspect?.(executionId)}
            className="text-[9px] font-bold text-slate-500 hover:text-slate-300 px-1.5"
            title="Execution inspector"
          >
            Inspect
          </button>
        )}
        {running && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex items-center gap-1 text-[10px] font-bold text-red-400 hover:bg-red-500/10 px-2 py-1 rounded-lg"
          >
            <Ban size={11} /> Cancel
          </button>
        )}
        {!running && status === "FAILED" && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 text-[10px] font-bold text-[#7CAADC] hover:bg-[#7CAADC]/10 px-2 py-1 rounded-lg"
          >
            <RotateCcw size={11} /> Retry
          </button>
        )}
      </div>

      <div className="px-3.5 py-2 flex flex-wrap gap-3 text-[10px] text-slate-500 border-b border-white/[0.04]">
        <span className="flex items-center gap-1">
          <Brain size={11} /> {currentAgent || "—"}
        </span>
        <span className="flex items-center gap-1">
          <Wrench size={11} /> {currentTool || "idle"}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={11} /> {tokens?.total ?? 0} tok
        </span>
        <span className="flex items-center gap-1">
          <Coins size={11} /> ${(cost ?? 0).toFixed(5)}
        </span>
      </div>

      {/* Agent tree */}
      <div className="border-b border-white/[0.04]">
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3.5 py-2 text-[10px] font-bold text-slate-400 hover:text-slate-200"
          onClick={() => setOpenTree((v) => !v)}
        >
          {openTree ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Agent Tree
        </button>
        {openTree && (
          <div className="px-3.5 pb-2.5 space-y-1.5">
            {(agents?.length ? agents : plan?.tasks || []).map((a, i) => {
              const name = a.agent || a.name || a.type || `agent-${i}`;
              const st = a.status || (currentAgent === name ? "running" : "pending");
              return (
                <div
                  key={a.id || `${name}-${i}`}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 bg-white/[0.02]"
                >
                  <StatusIcon status={st} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-semibold text-slate-200 capitalize">
                      {name}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">
                      {a.description || a.summary || st}
                    </div>
                  </div>
                  {a.durationMs != null && (
                    <span className="text-[9px] text-slate-600">{formatMs(a.durationMs)}</span>
                  )}
                </div>
              );
            })}
            {!agents?.length && !plan?.tasks?.length && (
              <p className="text-[10px] text-slate-600 italic px-1">Building plan…</p>
            )}
          </div>
        )}
      </div>

      {/* Tools */}
      {tools?.length > 0 && (
        <div className="px-3.5 py-2 border-b border-white/[0.04] space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 mb-1">
            Tool Calls
          </p>
          {tools.slice(-8).map((t, i) => {
            const st = String(t.status || "").toLowerCase();
            const label =
              st === "running"
                ? t.progress?.message || "Running…"
                : st === "completed" || st === "done"
                  ? t.summary ||
                    (t.result?.count != null
                      ? `Retrieved ${t.result.count}`
                      : t.result?.ok === false
                        ? t.result.error
                        : "Done")
                  : t.error || t.summary || "";
            return (
              <div key={t.id || i} className="flex items-center gap-2 text-[10px]">
                <StatusIcon status={t.status} />
                <span className="font-mono text-slate-300">{t.tool || t.toolName}</span>
                <span className="text-slate-500 truncate flex-1">{label}</span>
                {t.durationMs != null && (
                  <span className="text-slate-600">{formatMs(t.durationMs)}</span>
                )}
                {t.retries > 0 && (
                  <span className="text-amber-500/80">↻{t.retries}</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Reasoning */}
      {reasoning && (
        <div className="border-b border-white/[0.04]">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3.5 py-2 text-[10px] font-bold text-slate-400"
            onClick={() => setOpenReasoning((v) => !v)}
          >
            {openReasoning ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            Reasoning
          </button>
          {openReasoning && (
            <pre className="px-3.5 pb-2.5 text-[10px] text-slate-400 whitespace-pre-wrap font-mono max-h-32 overflow-y-auto">
              {reasoning}
            </pre>
          )}
        </div>
      )}

      {/* Logs */}
      <div>
        <button
          type="button"
          className="w-full flex items-center gap-2 px-3.5 py-2 text-[10px] font-bold text-slate-400"
          onClick={() => setOpenLogs((v) => !v)}
        >
          {openLogs ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Logs ({logs?.length || 0})
        </button>
        {openLogs && (
          <div className="px-3.5 pb-2.5 max-h-36 overflow-y-auto space-y-0.5">
            {(logs || []).slice(-40).map((l, i) => (
              <div key={i} className="text-[10px] font-mono text-slate-500">
                <span className="text-slate-600">{l.ts ? new Date(l.ts).toLocaleTimeString() : ""}</span>{" "}
                <span className="text-[#7CAADC]">{l.event || l.level}</span>{" "}
                {l.message || l.agent || ""}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
