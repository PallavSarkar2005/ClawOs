import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import {
  getAutonomyDashboard,
  createGoal,
  startExecution,
  getSession,
  getProgress,
  cancelSession,
  listArtifacts,
  getArtifact,
  listDecisions,
  listApprovals,
  resolveApproval,
  listBuilds,
  listTests,
  listReviews,
  listAgents,
  decomposeGoal,
  planGoal,
} from "../api/autonomyApi";
import {
  MetricTile,
  StatusPill,
  ExecutionGraph,
  TaskBoard,
  AgentActivity,
  ArtifactExplorer,
  DecisionViewer,
  ApprovalQueue,
  BuildTestReview,
  ProgressTimeline,
} from "../components/autonomy/AutonomyPanels";
import "../components/autonomy/autonomy.css";

const TABS = [
  "mission",
  "planner",
  "graph",
  "agents",
  "tasks",
  "artifacts",
  "decisions",
  "approvals",
  "builds",
  "reviews",
  "timeline",
];

export default function AutonomyPage() {
  const [tab, setTab] = useState("mission");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [agents, setAgents] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [session, setSession] = useState(null);
  const [progress, setProgress] = useState(null);
  const [artifacts, setArtifacts] = useState([]);
  const [artifactDetail, setArtifactDetail] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [builds, setBuilds] = useState([]);
  const [tests, setTests] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [planPreview, setPlanPreview] = useState(null);
  const [goalForm, setGoalForm] = useState({
    title: "",
    description: "Build an authentication system",
    projectId: "",
  });

  const loadCore = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dash, agentRows, approvalRows] = await Promise.all([
        getAutonomyDashboard(48),
        listAgents(),
        listApprovals({ status: "pending", limit: 40 }),
      ]);
      setDashboard(dash);
      setAgents(agentRows || []);
      setApprovals(approvalRows || []);
      if (!selectedSessionId && dash?.sessions?.[0]?.id) {
        setSelectedSessionId(dash.sessions[0].id);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const loadSessionExtras = async (id) => {
    if (!id) return;
    try {
      const [sess, prog, arts, decs, b, t, r] = await Promise.all([
        getSession(id),
        getProgress(id),
        listArtifacts({ sessionId: id, limit: 80 }),
        listDecisions({ sessionId: id, limit: 80 }),
        listBuilds({ sessionId: id, limit: 40 }),
        listTests({ sessionId: id, limit: 40 }),
        listReviews({ sessionId: id, limit: 40 }),
      ]);
      setSession(sess);
      setProgress(prog);
      setArtifacts(arts || []);
      setDecisions(decs || []);
      setBuilds(b || []);
      setTests(t || []);
      setReviews(r || []);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  useEffect(() => {
    loadCore();
  }, []);

  useEffect(() => {
    loadSessionExtras(selectedSessionId);
    if (!selectedSessionId) return undefined;
    const timer = setInterval(() => {
      getProgress(selectedSessionId)
        .then(setProgress)
        .catch(() => {});
    }, 4000);
    return () => clearInterval(timer);
  }, [selectedSessionId]);

  const onLaunch = async () => {
    setError(null);
    try {
      const goal = await createGoal({
        title: goalForm.title || goalForm.description.slice(0, 80),
        description: goalForm.description,
        projectId: goalForm.projectId || undefined,
      });
      const started = await startExecution({
        goalId: goal.id,
        projectId: goalForm.projectId || undefined,
        description: goalForm.description,
      });
      setSelectedSessionId(started.sessionId);
      await loadCore();
      setTab("timeline");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const onDecompose = async () => {
    try {
      const plan = await decomposeGoal(goalForm.description);
      setPlanPreview(plan);
      setTab("planner");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const onPlanSelectedGoal = async (goalId) => {
    try {
      const result = await planGoal(goalId);
      setPlanPreview(result.plan);
      setTab("graph");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const onResolve = async (id, approve) => {
    try {
      await resolveApproval(id, { approve });
      await loadCore();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const counts = dashboard?.counts || {};
  const tasks =
    session?.plan?.tasks ||
    planPreview?.tasks?.map((t) => ({
      ...t,
      agentType: t.agent,
      status: "pending",
    })) ||
    [];
  const graph =
    session?.plan?.executionGraph ||
    planPreview?.executionGraph ||
    null;

  return (
    <div className="ae-page">
      <Sidebar />
      <main className="ae-main">
        <header className="ae-header">
          <div>
            <h1>Autonomous Engineering</h1>
            <p>Mission control for planning, multi-agent execution, and quality gates.</p>
          </div>
          <div className="ae-actions">
            <button type="button" className="ae-btn" onClick={loadCore}>
              Refresh
            </button>
            {selectedSessionId && (
              <button
                type="button"
                className="ae-btn bad"
                onClick={() => cancelSession(selectedSessionId).then(loadCore)}
              >
                Cancel session
              </button>
            )}
          </div>
        </header>

        {error && <div className="ae-error">{error}</div>}

        <div className="ae-metrics">
          <MetricTile label="Goals" value={counts.goals ?? "—"} />
          <MetricTile label="Active" value={counts.active ?? "—"} tone="ok" />
          <MetricTile label="Approvals" value={counts.pendingApprovals ?? "—"} tone="warn" />
          <MetricTile label="Completed" value={counts.completed ?? "—"} />
          <MetricTile label="Failed" value={counts.failed ?? "—"} />
        </div>

        <div className="ae-tabs">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>

        {loading && <div className="ae-muted">Loading…</div>}

        {tab === "mission" && (
          <div className="ae-grid-2">
            <section className="ae-panel">
              <h3>Launch goal</h3>
              <div className="ae-form">
                <input
                  placeholder="Title (optional)"
                  value={goalForm.title}
                  onChange={(e) => setGoalForm((f) => ({ ...f, title: e.target.value }))}
                />
                <textarea
                  value={goalForm.description}
                  onChange={(e) => setGoalForm((f) => ({ ...f, description: e.target.value }))}
                />
                <input
                  placeholder="Project ID (optional)"
                  value={goalForm.projectId}
                  onChange={(e) => setGoalForm((f) => ({ ...f, projectId: e.target.value }))}
                />
                <div className="ae-actions">
                  <button type="button" className="ae-btn" onClick={onDecompose}>
                    Preview pipeline
                  </button>
                  <button type="button" className="ae-btn primary" onClick={onLaunch}>
                    Start autonomous run
                  </button>
                </div>
              </div>
            </section>
            <section className="ae-panel">
              <h3>Recent sessions</h3>
              <div className="ae-list">
                {(dashboard?.sessions || []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`ae-list-item ${selectedSessionId === s.id ? "active" : ""}`}
                    onClick={() => setSelectedSessionId(s.id)}
                  >
                    <div>
                      <div>{s.goal?.title || s.id.slice(0, 8)}</div>
                      <div className="ae-muted">{s.phase}</div>
                    </div>
                    <StatusPill status={s.status} />
                  </button>
                ))}
              </div>
            </section>
          </div>
        )}

        {tab === "planner" && (
          <div className="ae-grid-2">
            <section className="ae-panel">
              <h3>Goals</h3>
              <div className="ae-list">
                {(dashboard?.goals || []).map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className="ae-list-item"
                    onClick={() => onPlanSelectedGoal(g.id)}
                  >
                    <div>
                      <div>{g.title}</div>
                      <div className="ae-muted">{g.description?.slice(0, 120)}</div>
                    </div>
                    <StatusPill status={g.status} />
                  </button>
                ))}
              </div>
            </section>
            <section className="ae-panel">
              <h3>Plan preview</h3>
              {!planPreview && <div className="ae-empty">Decompose or plan a goal.</div>}
              {planPreview && (
                <>
                  <p>{planPreview.strategy}</p>
                  <ul>
                    {(planPreview.milestones || []).map((m) => (
                      <li key={m.id}>
                        {m.title} <span className="ae-muted">({m.phase})</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        )}

        {tab === "graph" && (
          <section className="ae-panel">
            <h3>Execution graph</h3>
            <ExecutionGraph graph={graph} />
          </section>
        )}

        {tab === "agents" && (
          <section className="ae-panel">
            <h3>Agent roster</h3>
            <AgentActivity agents={agents} session={session || progress} />
          </section>
        )}

        {tab === "tasks" && (
          <section className="ae-panel">
            <h3>Task board</h3>
            <TaskBoard tasks={tasks} />
          </section>
        )}

        {tab === "artifacts" && (
          <div className="ae-grid-2">
            <section className="ae-panel">
              <h3>Artifacts</h3>
              <ArtifactExplorer
                artifacts={artifacts}
                onOpen={async (a) => {
                  const full = await getArtifact(a.id);
                  setArtifactDetail(full);
                }}
              />
            </section>
            <section className="ae-panel">
              <h3>Preview</h3>
              {!artifactDetail && <div className="ae-empty">Select an artifact.</div>}
              {artifactDetail && (
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "0.8rem" }}>
                  {artifactDetail.content ||
                    JSON.stringify(artifactDetail.contentJson, null, 2)}
                </pre>
              )}
            </section>
          </div>
        )}

        {tab === "decisions" && (
          <section className="ae-panel">
            <h3>Decision log</h3>
            <DecisionViewer decisions={decisions.length ? decisions : dashboard?.decisions || []} />
          </section>
        )}

        {tab === "approvals" && (
          <section className="ae-panel">
            <h3>Approval queue</h3>
            <ApprovalQueue approvals={approvals} onResolve={onResolve} />
          </section>
        )}

        {(tab === "builds" || tab === "reviews") && (
          <section className="ae-panel">
            <h3>Quality status</h3>
            <BuildTestReview builds={builds} tests={tests} reviews={reviews} />
          </section>
        )}

        {tab === "timeline" && (
          <section className="ae-panel">
            <h3>Progress timeline</h3>
            <ProgressTimeline session={session || progress} />
          </section>
        )}
      </main>
    </div>
  );
}
