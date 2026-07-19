export function MetricTile({ label, value, tone }) {
  return (
    <div className={`ae-metric ${tone || ""}`}>
      <div className="ae-metric-value">{value}</div>
      <div className="ae-metric-label">{label}</div>
    </div>
  );
}

export function StatusPill({ status }) {
  const s = String(status || "unknown").toLowerCase();
  return <span className={`ae-pill ae-pill-${s}`}>{status || "—"}</span>;
}

export function ExecutionGraph({ graph }) {
  if (!graph?.waves?.length) {
    return <div className="ae-empty">No execution graph yet.</div>;
  }
  return (
    <div className="ae-graph">
      {graph.waves.map((wave, i) => (
        <div key={i} className="ae-wave">
          <div className="ae-wave-label">Wave {i + 1}</div>
          <div className="ae-wave-nodes">
            {wave.map((id) => {
              const node = graph.nodes?.find((n) => n.id === id);
              return (
                <div key={id} className="ae-node" title={node?.agent}>
                  <strong>{id}</strong>
                  <span>{node?.agent || "agent"}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="ae-muted">
        Critical path ~ {Math.round((graph.criticalPathMs || 0) / 60000)} min
      </div>
    </div>
  );
}

export function TaskBoard({ tasks = [] }) {
  if (!tasks.length) return <div className="ae-empty">No tasks.</div>;
  const columns = ["pending", "running", "completed", "failed", "waiting_approval"];
  return (
    <div className="ae-board">
      {columns.map((col) => {
        const items = tasks.filter((t) => String(t.status || "pending").toLowerCase() === col);
        return (
          <div key={col} className="ae-column">
            <h4>
              {col.replace(/_/g, " ")} <span>{items.length}</span>
            </h4>
            {items.map((t) => (
              <div key={t.id} className="ae-task">
                <div className="ae-task-title">{t.title}</div>
                <div className="ae-task-meta">
                  {t.agentType || t.agent} · {t.complexity || "medium"}
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

export function AgentActivity({ agents = [], session }) {
  return (
    <div className="ae-agents">
      {(agents || []).map((a) => (
        <div key={a.type} className="ae-agent-card">
          <strong>{a.type}</strong>
          <p>{a.promptPreview}</p>
        </div>
      ))}
      {session?.phase && (
        <div className="ae-agent-card ae-agent-active">
          <strong>Active phase</strong>
          <p>{session.phase}</p>
        </div>
      )}
    </div>
  );
}

export function ArtifactExplorer({ artifacts = [], onOpen }) {
  if (!artifacts.length) return <div className="ae-empty">No artifacts.</div>;
  return (
    <div className="ae-artifacts">
      {artifacts.map((a) => (
        <button key={a.id} type="button" className="ae-artifact" onClick={() => onOpen?.(a)}>
          <span className="ae-artifact-kind">{a.kind}</span>
          <span className="ae-artifact-name">{a.name}</span>
          <span className="ae-muted">{a.path || ""}</span>
        </button>
      ))}
    </div>
  );
}

export function DecisionViewer({ decisions = [] }) {
  if (!decisions.length) return <div className="ae-empty">No decisions.</div>;
  return (
    <div className="ae-decisions">
      {decisions.map((d) => (
        <div key={d.id} className="ae-decision">
          <div className="ae-decision-head">
            <strong>{d.kind}</strong>
            <span>confidence {(Number(d.confidence) * 100).toFixed(0)}%</span>
          </div>
          <p>{d.summary}</p>
          <pre>{d.reasoning?.slice(0, 600)}</pre>
        </div>
      ))}
    </div>
  );
}

export function ApprovalQueue({ approvals = [], onResolve }) {
  if (!approvals.length) return <div className="ae-empty">No pending approvals.</div>;
  return (
    <div className="ae-approvals">
      {approvals.map((a) => (
        <div key={a.id} className="ae-approval">
          <div className="ae-decision-head">
            <strong>{a.kind}</strong>
            <StatusPill status={a.risk} />
          </div>
          <p>{a.description}</p>
          <code>{a.action}</code>
          {a.status === "pending" && (
            <div className="ae-actions">
              <button type="button" className="ae-btn ok" onClick={() => onResolve?.(a.id, true)}>
                Approve
              </button>
              <button type="button" className="ae-btn bad" onClick={() => onResolve?.(a.id, false)}>
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function BuildTestReview({ builds = [], tests = [], reviews = [] }) {
  return (
    <div className="ae-status-grid">
      <section>
        <h4>Builds</h4>
        {builds.slice(0, 5).map((b) => (
          <div key={b.id} className="ae-status-row">
            <StatusPill status={b.status} />
            <span>{b.command || "build"}</span>
          </div>
        ))}
        {!builds.length && <div className="ae-empty">No builds.</div>}
      </section>
      <section>
        <h4>Tests</h4>
        {tests.slice(0, 5).map((t) => (
          <div key={t.id} className="ae-status-row">
            <StatusPill status={t.status} />
            <span>
              {t.passed || 0} passed / {t.failed || 0} failed
            </span>
          </div>
        ))}
        {!tests.length && <div className="ae-empty">No tests.</div>}
      </section>
      <section>
        <h4>Reviews</h4>
        {reviews.slice(0, 5).map((r) => (
          <div key={r.id} className="ae-status-row">
            <StatusPill status={r.status} />
            <span>score {(Number(r.score) * 100).toFixed(0)}%</span>
          </div>
        ))}
        {!reviews.length && <div className="ae-empty">No reviews.</div>}
      </section>
    </div>
  );
}

export function ProgressTimeline({ session }) {
  if (!session) return <div className="ae-empty">Select a session.</div>;
  const events = [];
  if (session.startedAt) events.push({ label: "Started", at: session.startedAt });
  (session.cycles || []).forEach((c) => {
    events.push({
      label: `Cycle ${c.cycleNumber}: ${c.status}`,
      at: c.startedAt,
      detail: c.analysis,
    });
  });
  if (session.finishedAt) events.push({ label: "Finished", at: session.finishedAt });
  return (
    <div className="ae-timeline">
      <div className="ae-progress-bar">
        <div style={{ width: `${Math.round((session.progress || 0) * 100)}%` }} />
      </div>
      <div className="ae-muted">{Math.round((session.progress || 0) * 100)}% · {session.phase}</div>
      {events.map((e, i) => (
        <div key={i} className="ae-timeline-item">
          <strong>{e.label}</strong>
          <span>{e.at ? new Date(e.at).toLocaleString() : ""}</span>
          {e.detail && <p>{e.detail}</p>}
        </div>
      ))}
    </div>
  );
}
