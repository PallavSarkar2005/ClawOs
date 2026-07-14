import { useState, useEffect, useRef, lazy, Suspense } from "react";
import {
  Terminal,
  GitBranch,
  AlertTriangle,
  Bot,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Clock,
  Upload,
  Download,
  GitCommit,
  Plus,
  Play,
} from "lucide-react";
import { formatTime, computeLineDiff, statusColor } from "./workspaceUtils";
import * as projectApi from "../../api/projectApi";
import "./ide.css";

const XTermTerminal = lazy(() => import("./XTermTerminal"));

const TABS = [
  { id: "terminal", label: "Terminal", icon: Terminal },
  { id: "problems", label: "Problems", icon: AlertTriangle },
  { id: "git", label: "Git", icon: GitBranch },
  { id: "logs", label: "Logs", icon: Play },
  { id: "diff", label: "AI Diff", icon: GitBranch },
  { id: "ai", label: "AI Output", icon: Bot },
];

function GitPanel({ projectId }) {
  const [status, setStatus] = useState(null);
  const [diff, setDiff] = useState(null);
  const [message, setMessage] = useState("");
  const [branchName, setBranchName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    if (!projectId) return;
    try {
      setStatus(await projectApi.gitStatus(projectId));
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  useEffect(() => {
    refresh();
  }, [projectId]); // eslint-disable-line

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) return <p className="text-[var(--ide-dim)] text-xs p-3">No project</p>;

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3 text-[12px]">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-white">{status?.branch || "…"}</span>
        {status?.clean && (
          <span className="text-[9px] text-emerald-400 font-bold uppercase">Clean</span>
        )}
        <button className="ide-btn" disabled={busy} onClick={() => run(() => projectApi.gitStage(projectId))}>
          Stage All
        </button>
        <button className="ide-btn" disabled={busy} onClick={() => run(() => projectApi.gitPull(projectId))}>
          <Download size={11} /> Pull
        </button>
        <button className="ide-btn" disabled={busy} onClick={() => run(() => projectApi.gitPush(projectId))}>
          <Upload size={11} /> Push
        </button>
        <button className="ide-btn ml-auto" onClick={refresh}>Refresh</button>
      </div>
      {error && <p className="text-red-400 text-[11px]">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!message.trim()) return;
          run(async () => {
            await projectApi.gitCommit(projectId, message);
            setMessage("");
          });
        }}
      >
        <input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Commit message"
          className="flex-1 h-7 px-2 rounded-md bg-black/30 text-[12px] text-white outline-none"
        />
        <button type="submit" className="ide-btn ide-btn--primary" disabled={busy || !message.trim()}>
          <GitCommit size={12} /> Commit
        </button>
      </form>
      <div className="flex gap-2">
        <input
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          placeholder="new-branch"
          className="flex-1 h-7 px-2 rounded-md bg-black/30 text-[12px] text-white outline-none"
        />
        <button
          className="ide-btn"
          disabled={busy || !branchName.trim()}
          onClick={() =>
            run(async () => {
              await projectApi.gitCheckout(projectId, branchName.trim(), true);
              setBranchName("");
            })
          }
        >
          <Plus size={11} /> Branch
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {(status?.branches || []).map((b) => (
          <button
            key={b.name}
            className={`ide-btn ${b.current ? "ide-btn--ghost-active" : ""}`}
            disabled={busy || b.current}
            onClick={() => run(() => projectApi.gitCheckout(projectId, b.name))}
          >
            {b.name}
          </button>
        ))}
      </div>
      <div className="space-y-0.5">
        {(status?.files || []).map((f) => (
          <button
            key={f.path}
            className="w-full flex gap-2 text-left hover:bg-white/[0.04] rounded px-1 py-1"
            onClick={async () => setDiff(await projectApi.gitDiff(projectId, f.path))}
          >
            <span className="text-amber-400 uppercase text-[9px] font-bold w-16">{f.status}</span>
            <span className="text-slate-300 truncate">{f.path}</span>
          </button>
        ))}
        {!status?.files?.length && <p className="text-[var(--ide-dim)]">No changes</p>}
      </div>
      {diff && (
        <pre className="text-[10px] text-slate-400 bg-black/30 rounded-lg p-2 overflow-auto max-h-36 whitespace-pre-wrap">
          {diff.unstaged || diff.staged || "(no diff)"}
        </pre>
      )}
    </div>
  );
}

export default function BottomPanel({
  open,
  onToggle,
  activeTab,
  onTabChange,
  logs,
  diffs,
  problems,
  executions,
  onAcceptDiff,
  onRejectDiff,
  onProblemClick,
  projectId,
  runInfo,
}) {
  const logsEnd = useRef(null);
  const latestExecution = executions?.[0];

  useEffect(() => {
    logsEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, activeTab]);

  if (!open) {
    return (
      <div className="ide-panel" style={{ height: 28 }}>
        <div className="ide-panel__tabs">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              className="ide-panel__tab"
              onClick={() => {
                onTabChange(id);
                onToggle(true);
              }}
            >
              {label}
            </button>
          ))}
          <div className="flex-1" />
          <button className="ide-btn ide-btn--icon" onClick={() => onToggle(true)} title="Expand">
            <ChevronUp size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ide-panel">
      <div className="ide-panel__tabs">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`ide-panel__tab ${activeTab === id ? "is-active" : ""}`}
            onClick={() => onTabChange(id)}
          >
            <Icon size={11} />
            {label}
            {id === "problems" && problems?.length > 0 && (
              <span className="ide-panel__badge">{problems.length}</span>
            )}
            {id === "diff" && diffs?.length > 0 && (
              <span className="ide-panel__badge" style={{ background: "rgba(245,158,11,0.2)", color: "#fbbf24" }}>
                {diffs.length}
              </span>
            )}
          </button>
        ))}
        <div className="flex-1" />
        {runInfo?.status === "running" && (
          <span className="text-[10px] text-[#7CAADC] px-2 flex items-center gap-1">
            <Play size={10} /> Running
          </span>
        )}
        {runInfo?.exitCode != null && (
          <span className="text-[10px] text-[var(--ide-muted)] px-1">exit {runInfo.exitCode}</span>
        )}
        {runInfo?.durationMs != null && (
          <span className="text-[10px] text-[var(--ide-muted)] px-1 flex items-center gap-1">
            <Clock size={10} /> {runInfo.durationMs}ms
          </span>
        )}
        <button className="ide-btn ide-btn--icon" onClick={() => onToggle(false)} title="Collapse">
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="ide-panel__body">
        {activeTab === "terminal" && (
          <Suspense fallback={<div className="p-3 text-[var(--ide-dim)] text-xs">Loading terminal…</div>}>
            <XTermTerminal projectId={projectId} active />
          </Suspense>
        )}

        {activeTab === "problems" && (
          <div className="h-full overflow-y-auto p-2 font-mono text-[11px] space-y-0.5">
            {!problems?.length && <p className="text-emerald-400/80 p-2">No problems detected.</p>}
            {(problems || []).map((p, i) => (
              <button
                key={i}
                className="w-full flex gap-2 items-start text-left hover:bg-white/[0.04] rounded px-2 py-1"
                onClick={() => onProblemClick?.(p)}
              >
                <span
                  className="uppercase text-[9px] font-bold mt-0.5"
                  style={{ color: p.severity === "error" ? "#EF4444" : "#F59E0B" }}
                >
                  {p.severity}
                </span>
                <span className="text-[#7CAADC]">
                  {p.filePath}:{p.line}
                </span>
                <span className="text-slate-300">{p.message}</span>
              </button>
            ))}
          </div>
        )}

        {activeTab === "git" && <GitPanel projectId={projectId} />}

        {activeTab === "logs" && (
          <div className="h-full overflow-y-auto p-3 font-mono text-[11px] space-y-1">
            {!logs?.length && <p className="text-[var(--ide-dim)]">No runtime logs yet.</p>}
            {[...(logs || [])].reverse().map((log) => (
              <div key={log.id} className="flex gap-2 leading-relaxed">
                <span className="text-[var(--ide-dim)] shrink-0">{formatTime(log.createdAt)}</span>
                <span
                  className="shrink-0 uppercase font-bold text-[9px] mt-0.5"
                  style={{
                    color:
                      log.level === "error"
                        ? "#EF4444"
                        : log.level === "warning"
                          ? "#F59E0B"
                          : "#7CAADC",
                  }}
                >
                  {log.level}
                </span>
                <span className="text-slate-500">[{log.source}]</span>
                <span className="text-slate-300 break-all">{log.message}</span>
              </div>
            ))}
            <div ref={logsEnd} />
          </div>
        )}

        {activeTab === "diff" && (
          <div className="h-full overflow-y-auto p-3 space-y-3">
            {!diffs?.length && (
              <p className="text-[var(--ide-dim)] text-xs">No pending AI changes.</p>
            )}
            {(diffs || []).map((diff) => {
              const rows = computeLineDiff(diff.before, diff.after);
              return (
                <div key={diff.id} className="rounded-lg overflow-hidden bg-black/25 shadow-[var(--ide-shadow)]">
                  <div className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="text-white font-semibold text-xs">{diff.filePath}</span>
                      {diff.reason && (
                        <span className="text-[var(--ide-muted)] ml-2 text-[10px]">{diff.reason}</span>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <button className="ide-btn ide-btn--success" onClick={() => onAcceptDiff(diff.id)}>
                        <Check size={12} /> Accept
                      </button>
                      <button className="ide-btn ide-btn--danger" onClick={() => onRejectDiff(diff.id)}>
                        <X size={12} /> Reject
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 text-[10px] max-h-36 overflow-y-auto">
                    <div className="p-2 border-r border-white/[0.04]">
                      {rows
                        .filter((r) => r.type !== "add")
                        .slice(0, 40)
                        .map((r, i) => (
                          <div
                            key={`b-${i}`}
                            className={r.type === "remove" ? "bg-red-500/10 text-red-300" : "text-slate-600"}
                          >
                            {r.before || " "}
                          </div>
                        ))}
                    </div>
                    <div className="p-2">
                      {rows
                        .filter((r) => r.type !== "remove")
                        .slice(0, 40)
                        .map((r, i) => (
                          <div
                            key={`a-${i}`}
                            className={r.type === "add" ? "bg-emerald-500/10 text-emerald-300" : "text-slate-600"}
                          >
                            {r.after || " "}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "ai" && (
          <div className="h-full overflow-y-auto p-3 space-y-2 text-[12px]">
            {!latestExecution && <p className="text-[var(--ide-dim)]">No AI execution output yet.</p>}
            {latestExecution && (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: statusColor(latestExecution.status) }}
                  />
                  <span className="font-semibold text-white">
                    Execution {latestExecution.status}
                  </span>
                  <span className="text-[var(--ide-dim)]">{formatTime(latestExecution.createdAt)}</span>
                </div>
                {(latestExecution.stages || []).map((stage, i) => (
                  <div key={i} className="pl-3 border-l border-white/[0.06]">
                    <div className="text-slate-300 font-semibold">
                      {stage.name}{" "}
                      <span style={{ color: statusColor(stage.status) }} className="text-[10px]">
                        {stage.status}
                      </span>
                    </div>
                    {stage.summary && (
                      <p className="text-[var(--ide-muted)] mt-0.5 whitespace-pre-wrap text-[11px]">
                        {stage.summary}
                      </p>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
