import { useState } from "react";
import {
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  Ban,
  PanelRightClose,
  Wrench,
  Coins,
} from "lucide-react";
import { formatTime, statusColor } from "./workspaceUtils";
import "./ide.css";

const STAGE_ORDER = [
  "Planner",
  "Research",
  "Architect",
  "Coding",
  "Testing",
  "Reviewer",
  "Completed",
];

function StageIcon({ status }) {
  if (status === "running") return <Loader2 size={14} className="text-[#7CAADC] animate-spin" />;
  if (status === "completed") return <CheckCircle2 size={14} className="text-emerald-400" />;
  if (status === "failed" || status === "cancelled")
    return <XCircle size={14} className="text-red-400" />;
  return <Circle size={14} className="text-slate-600" />;
}

export default function AiExecutionPanel({
  execution,
  executions,
  loading,
  onCancel,
  onSelectExecution,
  onCollapse,
  liveTools = [],
  liveCost = 0,
  liveAgent = null,
}) {
  const [expanded, setExpanded] = useState({});
  const current = execution || executions?.[0];
  const stages = current?.stages?.length
    ? current.stages
    : STAGE_ORDER.map((name) => ({ name, status: "pending", summary: null }));

  // Prefer agent-runtime steps when present
  const runtimeSteps = current?.steps?.length
    ? current.steps.map((s) => ({
        name: s.agentType || s.name,
        status: s.status,
        summary: (s.output || s.error || "").slice(0, 200),
        startedAt: s.startedAt,
        completedAt: s.finishedAt,
        durationMs: s.durationMs,
      }))
    : stages;

  const tokens =
    current?.tokensUsed ||
    current?.totalTokens ||
    (current?.promptTokens || 0) + (current?.completionTokens || 0);

  const cost = current?.estimatedCost ?? liveCost;

  return (
    <aside className="ide-ai">
      <div className="ide-ai__head">
        <Sparkles size={14} className="text-[#F15B42]" />
        <span className="ide-sidebar__label" style={{ color: "#e2e8f0" }}>
          AI Execution
        </span>
        <div className="flex-1" />
        {(current?.status === "running" ||
          (current?.status && !["COMPLETED", "completed", "FAILED", "failed", "CANCELLED", "cancelled"].includes(current.status))) &&
          onCancel && (
          <button className="ide-btn ide-btn--danger" onClick={() => onCancel(current.id)}>
            <Ban size={11} /> Stop
          </button>
        )}
        {onCollapse && (
          <button className="ide-btn ide-btn--icon" onClick={onCollapse} title="Collapse">
            <PanelRightClose size={14} />
          </button>
        )}
      </div>

      {current && (
        <div className="px-3 pb-2 flex flex-wrap gap-3 text-[10px] text-[var(--ide-muted)]">
          <span style={{ color: statusColor(current.status) }} className="font-bold uppercase">
            {current.status}
          </span>
          {liveAgent && <span className="text-[#7CAADC]">{liveAgent}</span>}
          {tokens > 0 && <span>{tokens} tokens</span>}
          {cost > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <Coins size={10} /> ${Number(cost).toFixed(5)}
            </span>
          )}
          <span className="ml-auto">{formatTime(current.createdAt)}</span>
        </div>
      )}

      {liveTools?.length > 0 && (
        <div className="px-3 pb-2 space-y-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-600 flex items-center gap-1">
            <Wrench size={10} /> Live Tools
          </p>
          {liveTools.slice(-4).map((t, i) => (
            <div key={i} className="text-[10px] text-slate-400 font-mono truncate">
              {t.tool || t.toolName} · {t.status}
            </div>
          ))}
        </div>
      )}

      <div className="ide-ai__body">
        {loading && (
          <div className="space-y-2">
            {STAGE_ORDER.map((s) => (
              <div key={s} className="h-12 rounded-lg bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        )}

        {!loading && !current && (
          <div className="text-center py-10 px-4">
            <Sparkles className="mx-auto text-slate-700 mb-3" size={22} />
            <p className="text-xs font-semibold text-slate-400">No active execution</p>
            <p className="text-[11px] text-[var(--ide-dim)] mt-2 leading-relaxed">
              Create a project or run an AI edit to see stages stream here.
            </p>
          </div>
        )}

        {!loading &&
          runtimeSteps.map((stage, idx) => {
            const isOpen = expanded[stage.name] ?? stage.status === "running";
            const cls =
              stage.status === "running"
                ? "is-running"
                : stage.status === "failed" || stage.status === "cancelled"
                  ? "is-fail"
                  : stage.status === "completed"
                    ? "is-done"
                    : "";
            return (
              <div key={`${stage.name}-${idx}`} className={`ide-stage ${cls}`}>
                <button
                  className="ide-stage__btn"
                  onClick={() =>
                    setExpanded((e) => ({ ...e, [stage.name]: !isOpen }))
                  }
                >
                  <StageIcon status={stage.status} />
                  <div className="flex-1 min-w-0">
                    <div className="ide-stage__name capitalize">{stage.name}</div>
                    <div
                      className="ide-stage__status"
                      style={{ color: statusColor(stage.status) }}
                    >
                      {stage.status}
                    </div>
                  </div>
                  {isOpen ? (
                    <ChevronDown size={12} className="text-slate-500" />
                  ) : (
                    <ChevronRight size={12} className="text-slate-500" />
                  )}
                </button>
                {isOpen && (
                  <div className="ide-stage__body">
                    {(stage.startedAt || stage.completedAt) && (
                      <div className="text-[10px] text-[var(--ide-dim)] mb-1 space-y-0.5">
                        {stage.startedAt && <div>Started {formatTime(stage.startedAt)}</div>}
                        {stage.completedAt && (
                          <div>Finished {formatTime(stage.completedAt)}</div>
                        )}
                        {stage.durationMs != null && <div>{stage.durationMs}ms</div>}
                      </div>
                    )}
                    {stage.summary || (
                      <span className="italic text-[var(--ide-dim)]">
                        {stage.status === "running" ? "Running…" : "Waiting…"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>

      {executions?.length > 0 && (
        <div className="shrink-0 p-3 pt-2" style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}>
          <p className="ide-sidebar__label mb-2">History</p>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {executions.slice(0, 8).map((ex) => (
              <button
                key={ex.id}
                onClick={() => onSelectExecution?.(ex)}
                className={`w-full flex items-center gap-2 text-[10px] text-left rounded px-1.5 py-1 hover:bg-white/[0.04] ${
                  current?.id === ex.id ? "bg-white/[0.05] text-white" : "text-[var(--ide-muted)]"
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: statusColor(ex.status) }}
                />
                <span className="truncate flex-1">{ex.currentStage || ex.status}</span>
                <span>{formatTime(ex.createdAt)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
