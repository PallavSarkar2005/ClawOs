import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Boxes,
  CircleDot,
  Database,
  GitBranch,
  Loader2,
  Network,
  Radar,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  Workflow,
} from "lucide-react";
import * as intelApi from "../../api/intelligenceApi";
import "./intelligence.css";

const VIEWS = [
  { id: "overview", label: "Health", icon: Activity },
  { id: "architecture", label: "Architecture", icon: Boxes },
  { id: "dependencies", label: "Dependencies", icon: GitBranch },
  { id: "calls", label: "Call Graph", icon: Workflow },
  { id: "components", label: "Components", icon: Network },
  { id: "api", label: "API", icon: CircleDot },
  { id: "database", label: "Database", icon: Database },
  { id: "symbols", label: "Symbols", icon: Radar },
  { id: "search", label: "Search", icon: Search },
  { id: "debt", label: "Debt", icon: ShieldAlert },
  { id: "ask", label: "Ask", icon: Sparkles },
];

export default function IntelligencePanel({ projectId, onOpenFile }) {
  const [view, setView] = useState("overview");
  const [status, setStatus] = useState(null);
  const [graphs, setGraphs] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [debt, setDebt] = useState(null);
  const [architecture, setArchitecture] = useState(null);
  const [obs, setObs] = useState(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [askQ, setAskQ] = useState("Where is authentication?");
  const [askResult, setAskResult] = useState(null);
  const [error, setError] = useState(null);
  const [impactTarget, setImpactTarget] = useState("");
  const [impact, setImpact] = useState(null);

  const loadCore = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    try {
      const [st, g, arch, o] = await Promise.all([
        intelApi.getStatus(projectId),
        intelApi.getGraphs(projectId),
        intelApi.getArchitecture(projectId),
        intelApi.getObservability(projectId),
      ]);
      setStatus(st);
      setGraphs(g);
      setArchitecture(arch);
      setObs(o);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    }
  }, [projectId]);

  useEffect(() => {
    loadCore();
  }, [loadCore]);

  const runIndex = async (incremental = false) => {
    setBusy(true);
    setError(null);
    try {
      await intelApi.indexRepository(projectId, { incremental });
      await loadCore();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadSymbols = async () => {
    const data = await intelApi.getSymbols(projectId, { limit: 150 });
    setSymbols(data || []);
  };

  const loadDebt = async () => {
    const data = await intelApi.getDebt(projectId);
    setDebt(data);
  };

  useEffect(() => {
    if (!projectId) return;
    if (view === "symbols") loadSymbols().catch(() => {});
    if (view === "debt") loadDebt().catch(() => {});
  }, [view, projectId]);

  const healthColor = useMemo(() => {
    const h = status?.healthScore ?? 0;
    if (h >= 80) return "var(--intel-ok)";
    if (h >= 55) return "var(--intel-warn)";
    return "var(--intel-bad)";
  }, [status]);

  const doSearch = async () => {
    if (!query.trim()) return;
    setBusy(true);
    try {
      const data = await intelApi.searchEverywhere(projectId, query.trim());
      setSearchResult(data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const doAsk = async () => {
    setBusy(true);
    try {
      const data = await intelApi.askRepository(projectId, askQ);
      setAskResult(data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const doImpact = async () => {
    if (!impactTarget.trim()) return;
    setBusy(true);
    try {
      const data = await intelApi.impactAnalysis(projectId, {
        path: impactTarget.includes(".") ? impactTarget : undefined,
        symbol: impactTarget.includes(".") ? undefined : impactTarget,
      });
      setImpact(data);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return <div className="intel-empty">Select a project to analyze the repository.</div>;
  }

  return (
    <div className="intel-root">
      <header className="intel-header">
        <div>
          <div className="intel-kicker">Repository Intelligence</div>
          <div className="intel-title-row">
            <h2>Workspace Graph</h2>
            <span className="intel-health" style={{ color: healthColor }}>
              {status?.healthScore != null ? `${Math.round(status.healthScore)}` : "—"}
            </span>
          </div>
        </div>
        <div className="intel-actions">
          <button type="button" className="intel-btn" onClick={() => runIndex(true)} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
            Incremental
          </button>
          <button type="button" className="intel-btn primary" onClick={() => runIndex(false)} disabled={busy}>
            {busy ? <Loader2 size={14} className="spin" /> : <Radar size={14} />}
            Full Index
          </button>
        </div>
      </header>

      {error && <div className="intel-error">{error}</div>}

      <div className="intel-obs">
        <span>{status?.filesIndexed ?? 0} files</span>
        <span>{status?.symbolsIndexed ?? 0} symbols</span>
        <span>{status?.depsIndexed ?? 0} deps</span>
        <span>{status?.indexStatus || "idle"}</span>
        {obs?.searchLatencyMs != null && <span>{obs.searchLatencyMs}ms search</span>}
      </div>

      <nav className="intel-nav">
        {VIEWS.map((v) => {
          const Icon = v.icon;
          return (
            <button
              key={v.id}
              type="button"
              className={view === v.id ? "active" : ""}
              onClick={() => setView(v.id)}
            >
              <Icon size={13} />
              {v.label}
            </button>
          );
        })}
      </nav>

      <div className="intel-body">
        {view === "overview" && (
          <Overview status={status} architecture={architecture} graphs={graphs} />
        )}
        {view === "architecture" && <ArchitectureView architecture={architecture} />}
        {view === "dependencies" && (
          <GraphList
            title="Dependency edges"
            edges={(graphs?.dependency?.edges || graphs?.import?.edges || []).slice(0, 120)}
            onOpen={onOpenFile}
          />
        )}
        {view === "calls" && (
          <GraphList
            title="Call graph"
            edges={(graphs?.call?.edges || []).slice(0, 120)}
            nodes={graphs?.call?.nodes}
            onOpen={onOpenFile}
          />
        )}
        {view === "components" && (
          <ComponentView graph={graphs?.component} onOpen={onOpenFile} />
        )}
        {view === "api" && <ApiView graph={graphs?.api} onOpen={onOpenFile} />}
        {view === "database" && <DatabaseView graph={graphs?.database || architecture?.diagrams?.database} />}
        {view === "symbols" && (
          <SymbolExplorer symbols={symbols} onOpen={onOpenFile} projectId={projectId} />
        )}
        {view === "search" && (
          <div className="intel-search">
            <div className="intel-search-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search everywhere — symbols, files, routes"
                onKeyDown={(e) => e.key === "Enter" && doSearch()}
              />
              <button type="button" className="intel-btn primary" onClick={doSearch} disabled={busy}>
                Search
              </button>
            </div>
            {searchResult && (
              <div className="intel-results">
                <div className="intel-meta">{searchResult.latencyMs}ms · {searchResult.mode}</div>
                {(searchResult.symbols || []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="intel-hit"
                    onClick={() => onOpenFile?.(s.path, s.line)}
                  >
                    <span className="kind">{s.kind}</span>
                    <strong>{s.name}</strong>
                    <em>{s.path}:{s.line}</em>
                  </button>
                ))}
                {(searchResult.files || []).map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="intel-hit"
                    onClick={() => onOpenFile?.(f.path)}
                  >
                    <span className="kind">file</span>
                    <strong>{f.path}</strong>
                  </button>
                ))}
              </div>
            )}
            <div className="intel-impact">
              <h4>Impact analysis</h4>
              <div className="intel-search-row">
                <input
                  value={impactTarget}
                  onChange={(e) => setImpactTarget(e.target.value)}
                  placeholder="File path or symbol name"
                />
                <button type="button" className="intel-btn" onClick={doImpact} disabled={busy}>
                  Analyze
                </button>
              </div>
              {impact && (
                <pre className="intel-pre">{JSON.stringify(impact, null, 2)}</pre>
              )}
            </div>
          </div>
        )}
        {view === "debt" && <DebtView debt={debt} onOpen={onOpenFile} />}
        {view === "ask" && (
          <div className="intel-ask">
            <div className="intel-search-row">
              <input value={askQ} onChange={(e) => setAskQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAsk()} />
              <button type="button" className="intel-btn primary" onClick={doAsk} disabled={busy}>
                Ask
              </button>
            </div>
            <div className="intel-chips">
              {[
                "Where is authentication?",
                "How does login work?",
                "Which files use JWT?",
                "Show architecture",
              ].map((q) => (
                <button key={q} type="button" onClick={() => setAskQ(q)}>
                  {q}
                </button>
              ))}
            </div>
            {askResult && (
              <div className="intel-answer">
                <p>{askResult.answer}</p>
                <pre className="intel-pre">{JSON.stringify(askResult, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Overview({ status, architecture, graphs }) {
  const langs = Object.entries(status?.languageStats || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="intel-overview">
      <p className="intel-summary">{architecture?.architecture?.summary || status?.summary || "Index the repository to generate architecture."}</p>
      <div className="intel-grid">
        <Stat label="Files" value={status?.filesIndexed} />
        <Stat label="Symbols" value={status?.symbolsIndexed} />
        <Stat label="Dependencies" value={status?.depsIndexed} />
        <Stat label="Components" value={graphs?.component?.nodes?.length || 0} />
        <Stat label="Routes" value={(graphs?.api?.routes || []).length} />
        <Stat label="Health" value={status?.healthScore != null ? Math.round(status.healthScore) : "—"} />
      </div>
      <h4>Technology inventory</h4>
      <div className="intel-tags">
        {(status?.techInventory || architecture?.techStack || []).map((t, i) => (
          <span key={i}>{typeof t === "string" ? t : t.name}</span>
        ))}
      </div>
      <h4>Languages</h4>
      <div className="intel-bars">
        {langs.map(([lang, count]) => (
          <div key={lang} className="intel-bar-row">
            <span>{lang}</span>
            <div className="intel-bar"><i style={{ width: `${Math.min(100, count * 8)}%` }} /></div>
            <em>{count}</em>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="intel-stat">
      <em>{label}</em>
      <strong>{value ?? 0}</strong>
    </div>
  );
}

function ArchitectureView({ architecture }) {
  const arch = architecture?.architecture || architecture;
  if (!arch) return <div className="intel-empty">No architecture snapshot yet.</div>;
  return (
    <div className="intel-arch">
      <p>{arch.summary}</p>
      <h4>Layers</h4>
      <div className="intel-tags">
        {(arch.layers || []).map((l) => (
          <span key={l.name}>{l.name} ({l.count})</span>
        ))}
      </div>
      <h4>Patterns</h4>
      <ul>
        {(arch.patterns || []).map((p) => (
          <li key={p.name}>{p.name} — {(p.confidence * 100).toFixed(0)}%</li>
        ))}
      </ul>
      <h4>Request lifecycle</h4>
      <ol>
        {(arch.diagrams?.requestLifecycle || []).map((s, i) => (
          <li key={i}>{s.name}{s.layer ? ` (${s.layer})` : ""}</li>
        ))}
      </ol>
      <h4>Violations</h4>
      <ul className="intel-warn-list">
        {(arch.violations || []).slice(0, 30).map((v, i) => (
          <li key={i}>{v.message || v.type}</li>
        ))}
      </ul>
    </div>
  );
}

function GraphList({ title, edges, nodes, onOpen }) {
  return (
    <div>
      <h4>{title} ({edges?.length || 0})</h4>
      <div className="intel-edge-list">
        {(edges || []).map((e, i) => (
          <button
            key={i}
            type="button"
            className="intel-edge"
            onClick={() => onOpen?.(typeof e.from === "string" && e.from.includes(".") ? e.from : e.file)}
          >
            <span>{labelNode(e.from, nodes)}</span>
            <em>{e.kind || "→"}</em>
            <span>{labelNode(e.to, nodes)}</span>
            {e.isCircular && <strong className="bad">cycle</strong>}
          </button>
        ))}
      </div>
    </div>
  );
}

function labelNode(id, nodes) {
  if (!id) return "?";
  const n = (nodes || []).find((x) => x.id === id);
  return n?.label || String(id).split("/").pop() || id;
}

function ComponentView({ graph, onOpen }) {
  return (
    <div>
      <h4>Component tree ({graph?.nodes?.length || 0})</h4>
      <div className="intel-edge-list">
        {(graph?.nodes || []).map((n) => (
          <button key={n.id} type="button" className="intel-hit" onClick={() => onOpen?.(n.path, n.line)}>
            <span className="kind">component</span>
            <strong>{n.label}</strong>
            <em>{n.path}</em>
          </button>
        ))}
      </div>
      <GraphList title="Renders" edges={graph?.edges || []} nodes={graph?.nodes} onOpen={onOpen} />
    </div>
  );
}

function ApiView({ graph, onOpen }) {
  const routes = graph?.routes || [];
  return (
    <div>
      <h4>API explorer ({routes.length})</h4>
      <div className="intel-edge-list">
        {routes.map((r, i) => (
          <button key={i} type="button" className="intel-hit" onClick={() => onOpen?.(r.file, r.line)}>
            <span className="kind">{r.method}</span>
            <strong>{r.path}</strong>
            <em>{r.file}:{r.line}</em>
          </button>
        ))}
      </div>
    </div>
  );
}

function DatabaseView({ graph }) {
  const nodes = graph?.nodes || [];
  const edges = graph?.edges || [];
  return (
    <div>
      <h4>Database models ({nodes.length})</h4>
      <div className="intel-tags">
        {nodes.map((n) => (
          <span key={n.id || n.label}>{n.label || n.id}</span>
        ))}
      </div>
      <h4>Relations</h4>
      <div className="intel-edge-list">
        {edges.map((e, i) => (
          <div key={i} className="intel-edge">
            <span>{e.from}</span>
            <em>{e.kind}</em>
            <span>{e.to}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SymbolExplorer({ symbols, onOpen, projectId }) {
  const [refs, setRefs] = useState(null);
  const inspect = async (name) => {
    const data = await intelApi.findReferences(projectId, { name });
    setRefs({ name, data });
  };
  return (
    <div>
      <h4>Symbol explorer ({symbols.length})</h4>
      <div className="intel-edge-list">
        {symbols.map((s) => (
          <div key={s.id} className="intel-symbol-row">
            <button type="button" className="intel-hit" onClick={() => onOpen?.(s.path, s.line)}>
              <span className="kind">{s.kind}</span>
              <strong>{s.name}</strong>
              <em>{s.path}:{s.line}</em>
            </button>
            <button type="button" className="intel-btn tiny" onClick={() => inspect(s.name)}>
              Refs
            </button>
          </div>
        ))}
      </div>
      {refs && (
        <div className="intel-answer">
          <h4>References to {refs.name}</h4>
          <pre className="intel-pre">{JSON.stringify(refs.data, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

function DebtView({ debt, onOpen }) {
  if (!debt) return <div className="intel-empty">Loading technical debt…</div>;
  return (
    <div className="intel-debt">
      <div className="intel-grid">
        <Stat label="Health" value={Math.round(debt.healthScore || 0)} />
        <Stat label="Dead code" value={debt.deadCode?.length || 0} />
        <Stat label="Cycles" value={debt.cycles?.length || 0} />
        <Stat label="Unused files" value={debt.unusedFiles?.length || 0} />
      </div>
      <h4>Dead symbols</h4>
      {(debt.deadCode || []).slice(0, 40).map((d, i) => (
        <button key={i} type="button" className="intel-hit" onClick={() => onOpen?.(d.path, d.line)}>
          <span className="kind">{d.kind}</span>
          <strong>{d.name}</strong>
          <em>{d.path}</em>
        </button>
      ))}
      <h4>Circular dependencies</h4>
      <ul className="intel-warn-list">
        {(debt.cycles || []).slice(0, 20).map((c, i) => (
          <li key={i}>{Array.isArray(c) ? c.join(" → ") : String(c)}</li>
        ))}
      </ul>
      <h4>Security / quality</h4>
      {[...(debt.security || []), ...(debt.largeFiles || []), ...(debt.complexMethods || [])]
        .slice(0, 40)
        .map((m, i) => (
          <button key={i} type="button" className="intel-hit" onClick={() => onOpen?.(m.path)}>
            <span className="kind">{m.severity || m.metricType}</span>
            <strong>{m.message || m.metricType}</strong>
            <em>{m.path}</em>
          </button>
        ))}
    </div>
  );
}
