import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import {
  getObservabilityDashboard,
  searchTraces,
  getTrace,
  getTimeline,
  getAlerts,
  acknowledgeAlert,
  resolveAlert,
  createReplay,
  playReplay,
  getLogs,
  exportTrace,
} from "../api/observabilityApi";
import {
  MetricCard,
  StatusPill,
  LatencyBar,
  SpanTree,
  TimelineList,
  PromptViewer,
  ContextInspector,
  KnowledgeInspector,
  RepositoryInspector,
  ToolTimeline,
  WorkflowTimeline,
  CostDashboard,
  ErrorExplorer,
  AlertCenter,
  ReplayViewer,
} from "../components/observability/ObservabilityPanels";
import "../components/observability/observability.css";

const TABS = [
  "overview",
  "timeline",
  "trace",
  "spans",
  "prompts",
  "context",
  "knowledge",
  "repository",
  "workflow",
  "tools",
  "metrics",
  "cost",
  "errors",
  "replay",
  "alerts",
];

function pct(n) {
  return `${Math.round((Number(n) || 0) * 1000) / 10}%`;
}

export default function ObservabilityPage() {
  const [tab, setTab] = useState("overview");
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [traces, setTraces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [trace, setTrace] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [replay, setReplay] = useState(null);
  const [playback, setPlayback] = useState(null);
  const [query, setQuery] = useState({ q: "", status: "", agent: "", tool: "", model: "" });
  const [error, setError] = useState(null);

  const loadCore = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, search, alertRows, logRows] = await Promise.all([
        getObservabilityDashboard(hours),
        searchTraces({ limit: 40, ...query }),
        getAlerts({ status: "open", limit: 40 }),
        getLogs({ limit: 50 }),
      ]);
      setDashboard(dash);
      setTraces(search.items || []);
      setAlerts(alertRows || []);
      setLogs(logRows.items || []);
      if (!selectedId && search.items?.[0]) {
        setSelectedId(search.items[0].traceId);
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Failed to load observability");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    (async () => {
      try {
        const [detail, tl] = await Promise.all([getTrace(selectedId), getTimeline(selectedId)]);
        if (!cancelled) {
          setTrace(detail);
          setTimeline(tl);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const latency = dashboard?.metrics?.latency || {};
  const domain = dashboard?.metrics?.domain || {};
  const chartVals = (traces || [])
    .map((t) => t.durationMs || 0)
    .slice(0, 24)
    .reverse();
  const chartMax = Math.max(1, ...chartVals);

  return (
    <div className="obs-page">
      <Sidebar />
      <main className="obs-main">
        <header className="obs-header">
          <div>
            <h1>Observability</h1>
            <p>Distributed traces across coordinator, tools, workflows, context, knowledge, and repository intelligence.</p>
          </div>
          <div className="obs-toolbar">
            <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              <option value={1}>1h</option>
              <option value={6}>6h</option>
              <option value={24}>24h</option>
              <option value={168}>7d</option>
            </select>
            <button type="button" onClick={loadCore}>
              Refresh
            </button>
          </div>
        </header>

        {error ? <div className="obs-error">{error}</div> : null}
        {loading && !dashboard ? <div className="obs-empty">Loading traces…</div> : null}

        <div className="obs-metric-grid">
          <MetricCard label="Success rate" value={pct(latency.successRate)} tone="accent" />
          <MetricCard label="Failure rate" value={pct(latency.failureRate)} />
          <MetricCard label="Retry rate" value={pct(latency.retryRate)} />
          <MetricCard label="Avg latency" value={Math.round(latency.avgLatencyMs || 0)} suffix="ms" />
          <MetricCard label="P95" value={Math.round(latency.p95LatencyMs || 0)} suffix="ms" />
          <MetricCard label="P99" value={Math.round(latency.p99LatencyMs || 0)} suffix="ms" />
          <MetricCard label="Tokens" value={domain.llm?.totalTokens ?? 0} />
          <MetricCard label="Cost" value={`$${(domain.llm?.estimatedCost || 0).toFixed(4)}`} />
        </div>

        <div className="obs-chart" aria-label="Latency chart">
          {chartVals.map((v, i) => (
            <div
              key={i}
              className="obs-chart__bar"
              style={{ height: `${Math.max(4, (v / chartMax) * 100)}%` }}
              title={`${v}ms`}
            />
          ))}
        </div>

        <nav className="obs-tabs">
          {TABS.map((t) => (
            <button key={t} type="button" className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t}
            </button>
          ))}
        </nav>

        <div className="obs-toolbar">
          <input
            placeholder="Search traces"
            value={query.q}
            onChange={(e) => setQuery((q) => ({ ...q, q: e.target.value }))}
          />
          <input
            placeholder="Agent"
            value={query.agent}
            onChange={(e) => setQuery((q) => ({ ...q, agent: e.target.value }))}
          />
          <input
            placeholder="Tool"
            value={query.tool}
            onChange={(e) => setQuery((q) => ({ ...q, tool: e.target.value }))}
          />
          <input
            placeholder="Model"
            value={query.model}
            onChange={(e) => setQuery((q) => ({ ...q, model: e.target.value }))}
          />
          <select value={query.status} onChange={(e) => setQuery((q) => ({ ...q, status: e.target.value }))}>
            <option value="">Any status</option>
            <option value="ok">ok</option>
            <option value="error">error</option>
            <option value="running">running</option>
            <option value="cancelled">cancelled</option>
          </select>
          <button
            type="button"
            onClick={async () => {
              const res = await searchTraces({ limit: 40, ...query });
              setTraces(res.items || []);
            }}
          >
            Search
          </button>
        </div>

        <div className="obs-layout">
          <section className="obs-list">
            <div className="obs-list__head">
              <strong>Traces</strong>
              <span className="obs-muted">{traces.length}</span>
            </div>
            <div className="obs-list__body">
              {traces.map((t) => (
                <button
                  key={t.traceId}
                  type="button"
                  className={`obs-trace-item ${selectedId === t.traceId ? "active" : ""}`}
                  onClick={() => setSelectedId(t.traceId)}
                >
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <StatusPill status={t.status} />
                    <strong>{t.name}</strong>
                  </div>
                  <div className="obs-muted">{t.traceId}</div>
                  <LatencyBar ms={t.durationMs} />
                </button>
              ))}
              {!traces.length ? <div className="obs-empty">No traces yet — run an agent or workflow.</div> : null}
            </div>
          </section>

          <section className="obs-detail">
            <div className="obs-detail__head">
              <strong>
                {tab} {selectedId ? `· ${selectedId.slice(0, 12)}` : ""}
              </strong>
              <div className="obs-actions">
                {selectedId ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        const r = await createReplay(selectedId);
                        setReplay(r);
                        setTab("replay");
                      }}
                    >
                      Create replay
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        const data = await exportTrace(selectedId);
                        const blob = new Blob([JSON.stringify(data, null, 2)], {
                          type: "application/json",
                        });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `trace-${selectedId}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >
                      Export
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="obs-detail__body">
              {tab === "overview" && (
                <>
                  <CostDashboard llm={domain.llm || {}} />
                  <ErrorExplorer errors={dashboard?.errors || []} />
                  <h3>Recent logs</h3>
                  <ul className="obs-mini-list">
                    {logs.slice(0, 20).map((l, i) => (
                      <li key={i}>
                        <StatusPill status={l.level} /> {l.message}
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {tab === "timeline" && <TimelineList events={timeline?.events || []} />}
              {tab === "trace" && (
                <pre className="obs-code">{JSON.stringify(trace, null, 2)?.slice(0, 20000)}</pre>
              )}
              {tab === "spans" && <SpanTree nodes={trace?.spanTree || []} />}
              {tab === "prompts" && <PromptViewer prompts={trace?.promptTraces || []} />}
              {tab === "context" && <ContextInspector contexts={trace?.contextTraces || []} />}
              {tab === "knowledge" && <KnowledgeInspector rows={trace?.knowledgeTraces || []} />}
              {tab === "repository" && <RepositoryInspector rows={trace?.repositoryTraces || []} />}
              {tab === "workflow" && <WorkflowTimeline rows={trace?.workflowTraces || []} />}
              {tab === "tools" && <ToolTimeline tools={trace?.toolTraces || []} />}
              {tab === "metrics" && (
                <pre className="obs-code">{JSON.stringify(dashboard?.metrics || {}, null, 2)}</pre>
              )}
              {tab === "cost" && <CostDashboard llm={domain.llm || {}} />}
              {tab === "errors" && <ErrorExplorer errors={dashboard?.errors || []} />}
              {tab === "alerts" && (
                <AlertCenter
                  alerts={alerts}
                  onAck={async (id) => {
                    await acknowledgeAlert(id);
                    setAlerts(await getAlerts({ status: "open", limit: 40 }));
                  }}
                  onResolve={async (id) => {
                    await resolveAlert(id);
                    setAlerts(await getAlerts({ status: "open", limit: 40 }));
                  }}
                />
              )}
              {tab === "replay" && (
                <ReplayViewer
                  replay={replay}
                  playback={playback}
                  onPlay={async (id) => {
                    const result = await playReplay(id);
                    setPlayback(result);
                  }}
                />
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
