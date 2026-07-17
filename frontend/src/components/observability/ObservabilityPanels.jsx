import "./observability.css";

export function MetricCard({ label, value, suffix = "", tone = "neutral" }) {
  return (
    <div className={`obs-metric obs-metric--${tone}`}>
      <div className="obs-metric__label">{label}</div>
      <div className="obs-metric__value">
        {value}
        {suffix ? <span className="obs-metric__suffix">{suffix}</span> : null}
      </div>
    </div>
  );
}

export function StatusPill({ status }) {
  const s = String(status || "unknown").toLowerCase();
  return <span className={`obs-pill obs-pill--${s}`}>{s}</span>;
}

export function LatencyBar({ ms, max = 30000 }) {
  const pct = Math.min(100, ((Number(ms) || 0) / max) * 100);
  const tone = pct > 80 ? "bad" : pct > 50 ? "warn" : "ok";
  return (
    <div className="obs-latency">
      <div className={`obs-latency__fill obs-latency__fill--${tone}`} style={{ width: `${pct}%` }} />
      <span>{ms != null ? `${Math.round(ms)}ms` : "—"}</span>
    </div>
  );
}

export function SpanTree({ nodes = [], depth = 0 }) {
  if (!nodes.length) return <div className="obs-empty">No spans</div>;
  return (
    <ul className="obs-span-tree" style={{ paddingLeft: depth ? 16 : 0 }}>
      {nodes.map((n) => (
        <li key={n.spanId}>
          <div className="obs-span-row">
            <StatusPill status={n.status} />
            <strong>{n.name}</strong>
            <span className="obs-muted">{n.kind}</span>
            <LatencyBar ms={n.durationMs} />
          </div>
          {n.error ? <div className="obs-error">{n.error}</div> : null}
          {n.children?.length ? <SpanTree nodes={n.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ul>
  );
}

export function TimelineList({ events = [] }) {
  if (!events.length) return <div className="obs-empty">No timeline events</div>;
  return (
    <ol className="obs-timeline">
      {events.map((ev, i) => (
        <li key={`${ev.at}-${i}`} className={`obs-timeline__item obs-timeline__item--${ev.type || "event"}`}>
          <div className="obs-timeline__time">{ev.at ? new Date(ev.at).toLocaleTimeString() : "—"}</div>
          <div className="obs-timeline__body">
            <div className="obs-timeline__label">
              <StatusPill status={ev.source || ev.type} />
              {ev.label || ev.type}
            </div>
            {ev.data?.durationMs != null ? (
              <div className="obs-muted">{Math.round(ev.data.durationMs)}ms</div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PromptViewer({ prompts = [] }) {
  if (!prompts.length) return <div className="obs-empty">No prompt traces</div>;
  return (
    <div className="obs-stack">
      {prompts.map((p) => (
        <article key={p.id} className="obs-panel">
          <header className="obs-panel__head">
            <strong>
              {p.provider}/{p.model}
            </strong>
            <StatusPill status={p.status} />
            <span className="obs-muted">{p.totalTokens} tok · {p.latencyMs}ms</span>
          </header>
          {p.systemPrompt ? (
            <pre className="obs-code">
              <span className="obs-code__tag">system</span>
              {p.systemPrompt.slice(0, 2000)}
            </pre>
          ) : null}
          {p.originalPrompt ? (
            <pre className="obs-code">
              <span className="obs-code__tag">prompt</span>
              {p.originalPrompt.slice(0, 3000)}
            </pre>
          ) : null}
          {p.response ? (
            <pre className="obs-code">
              <span className="obs-code__tag">response</span>
              {p.response.slice(0, 3000)}
            </pre>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ContextInspector({ contexts = [] }) {
  if (!contexts.length) return <div className="obs-empty">No context traces</div>;
  return (
    <div className="obs-stack">
      {contexts.map((c) => (
        <article key={c.id} className="obs-panel">
          <header className="obs-panel__head">
            <strong>Context session</strong>
            <span className="obs-muted">
              {c.usedTokens}/{c.tokenBudget} tokens · ratio {c.compressionRatio ?? "—"}
            </span>
          </header>
          <pre className="obs-code">{JSON.stringify(c.sources || {}, null, 2)}</pre>
          {Array.isArray(c.reasoningPath) && c.reasoningPath.length ? (
            <ol className="obs-mini-list">
              {c.reasoningPath.map((r, i) => (
                <li key={i}>
                  {r.step}: {r.detail || JSON.stringify(r)}
                </li>
              ))}
            </ol>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function KnowledgeInspector({ rows = [] }) {
  if (!rows.length) return <div className="obs-empty">No knowledge traces</div>;
  return (
    <div className="obs-stack">
      {rows.map((k) => (
        <article key={k.id} className="obs-panel">
          <header className="obs-panel__head">
            <strong>{k.query?.slice(0, 80) || "retrieval"}</strong>
            <span className="obs-muted">
              {k.resultCount} results · {k.searchLatencyMs}ms · {k.embeddingModel}
            </span>
          </header>
          <ul className="obs-mini-list">
            {(k.chunks || []).slice(0, 8).map((ch, i) => (
              <li key={i}>
                <span className="obs-muted">{(ch.score ?? ch.similarity ?? "—").toString().slice(0, 6)}</span>{" "}
                {String(ch.content || "").slice(0, 160)}
              </li>
            ))}
          </ul>
          {Array.isArray(k.graphPath) && k.graphPath.length ? (
            <pre className="obs-code">{JSON.stringify(k.graphPath.slice(0, 20), null, 2)}</pre>
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function RepositoryInspector({ rows = [] }) {
  if (!rows.length) return <div className="obs-empty">No repository traces</div>;
  return (
    <div className="obs-stack">
      {rows.map((r) => (
        <article key={r.id} className="obs-panel">
          <header className="obs-panel__head">
            <strong>{r.stage || "index"}</strong>
            <StatusPill status={r.status} />
            <span className="obs-muted">
              {r.filesProcessed}/{r.filesTotal} files · {r.symbolsIndexed} symbols · {r.durationMs}ms
            </span>
          </header>
          <pre className="obs-code">{JSON.stringify(r.health || {}, null, 2)}</pre>
        </article>
      ))}
    </div>
  );
}

export function ToolTimeline({ tools = [] }) {
  if (!tools.length) return <div className="obs-empty">No tool traces</div>;
  return (
    <table className="obs-table">
      <thead>
        <tr>
          <th>Tool</th>
          <th>Status</th>
          <th>Duration</th>
          <th>Retries</th>
        </tr>
      </thead>
      <tbody>
        {tools.map((t) => (
          <tr key={t.id}>
            <td>
              {t.toolName}
              <div className="obs-muted">{t.category}</div>
            </td>
            <td>
              <StatusPill status={t.status} />
            </td>
            <td>
              <LatencyBar ms={t.durationMs} />
            </td>
            <td>{t.retries}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function WorkflowTimeline({ rows = [] }) {
  if (!rows.length) return <div className="obs-empty">No workflow traces</div>;
  return (
    <div className="obs-stack">
      {rows.map((w) => (
        <article key={w.id} className="obs-panel">
          <header className="obs-panel__head">
            <strong>Workflow {w.workflowId?.slice(0, 8) || "—"}</strong>
            <StatusPill status={w.status} />
          </header>
          <div className="obs-chips">
            <span>completed {(w.completedNodes || []).length}</span>
            <span>failed {(w.failedNodes || []).length}</span>
            <span>queued {(w.queuedNodes || []).length}</span>
            <span>current {(w.currentNodeKeys || []).join(", ") || "—"}</span>
          </div>
          <TimelineList
            events={(w.executionTimeline || []).map((e) => ({
              at: e.at,
              type: e.event || "workflow",
              label: e.nodeKey || e.event,
              source: "workflow",
              data: e,
            }))}
          />
        </article>
      ))}
    </div>
  );
}

export function CostDashboard({ llm = {} }) {
  return (
    <div className="obs-metric-grid">
      <MetricCard label="Prompt tokens" value={llm.promptTokens ?? 0} />
      <MetricCard label="Completion tokens" value={llm.completionTokens ?? 0} />
      <MetricCard label="Total tokens" value={llm.totalTokens ?? 0} />
      <MetricCard label="Est. cost" value={`$${(llm.estimatedCost || 0).toFixed(4)}`} tone="accent" />
      <MetricCard label="RPM" value={llm.requestsPerMinute ?? 0} />
      <MetricCard label="Avg LLM latency" value={Math.round(llm.avgLatencyMs || 0)} suffix="ms" />
    </div>
  );
}

export function ErrorExplorer({ errors = [] }) {
  if (!errors.length) return <div className="obs-empty">No recent errors</div>;
  return (
    <ul className="obs-mini-list">
      {errors.map((e) => (
        <li key={e.traceId || e.id}>
          <StatusPill status="error" />
          <code>{e.traceId}</code> {e.error || e.name}
          <span className="obs-muted"> {e.durationMs}ms</span>
        </li>
      ))}
    </ul>
  );
}

export function AlertCenter({ alerts = [], onAck, onResolve }) {
  if (!alerts.length) return <div className="obs-empty">No open alerts</div>;
  return (
    <div className="obs-stack">
      {alerts.map((a) => (
        <article key={a.id} className={`obs-alert obs-alert--${a.severity}`}>
          <header className="obs-panel__head">
            <strong>{a.title}</strong>
            <StatusPill status={a.severity} />
          </header>
          <p>{a.message}</p>
          <div className="obs-actions">
            {a.status === "open" ? (
              <button type="button" onClick={() => onAck?.(a.id)}>
                Acknowledge
              </button>
            ) : null}
            {a.status !== "resolved" ? (
              <button type="button" onClick={() => onResolve?.(a.id)}>
                Resolve
              </button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}

export function ReplayViewer({ replay, playback, onPlay }) {
  if (!replay) return <div className="obs-empty">Select or create a replay</div>;
  return (
    <div className="obs-panel">
      <header className="obs-panel__head">
        <strong>Replay {replay.id?.slice(0, 8)}</strong>
        <StatusPill status={replay.status} />
        <button type="button" onClick={() => onPlay?.(replay.id)}>
          Play
        </button>
      </header>
      <ol className="obs-timeline">
        {(playback?.played || replay.steps || []).map((s, i) => (
          <li key={i} className="obs-timeline__item">
            <div className="obs-timeline__time">{s.type}</div>
            <div className="obs-timeline__body">{s.label}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
