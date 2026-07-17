import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import {
  getWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
  cloneWorkflow,
  publishWorkflow,
  exportWorkflow,
  executeWorkflow,
  getExecutions,
  getExecution,
  pauseExecution,
  resumeExecution,
  cancelExecution,
  retryExecution,
  approveExecution,
  getTemplates,
  createFromTemplate,
  validateWorkflow,
  layoutWorkflow,
  createSchedule,
  createTrigger,
  getWorkflowMetrics,
  getNodeTypes,
} from "../api/workflowApi";
import {
  Play,
  Pause,
  Square,
  Save,
  Plus,
  Trash2,
  Copy,
  Upload,
  Download,
  LayoutGrid,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CheckCircle2,
  Clock,
  Activity,
  GitBranch,
  Settings2,
  Boxes,
} from "lucide-react";
import "../components/workflows/workflow.css";

const PALETTE = [
  {
    group: "Flow",
    items: [
      { type: "start", label: "Start" },
      { type: "end", label: "End" },
      { type: "condition", label: "Condition" },
      { type: "loop", label: "Loop" },
      { type: "delay", label: "Delay" },
      { type: "timer", label: "Timer" },
      { type: "wait", label: "Wait" },
      { type: "approval", label: "Approval" },
      { type: "retry", label: "Retry" },
    ],
  },
  {
    group: "Agents",
    items: [
      { type: "coordinator", label: "Coordinator" },
      { type: "research_agent", label: "Research" },
      { type: "architect_agent", label: "Architect" },
      { type: "coder_agent", label: "Coder" },
      { type: "reviewer_agent", label: "Reviewer" },
      { type: "tester_agent", label: "Tester" },
      { type: "llm", label: "LLM" },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { type: "workspace_intelligence", label: "Workspace Intel" },
      { type: "knowledge_retrieval", label: "Knowledge" },
      { type: "context_retrieval", label: "Context" },
      { type: "memory", label: "Memory" },
    ],
  },
  {
    group: "Tools",
    items: [
      { type: "tool", label: "Tool" },
      { type: "terminal", label: "Terminal" },
      { type: "filesystem", label: "Filesystem" },
      { type: "git", label: "Git" },
      { type: "browser", label: "Browser" },
      { type: "http", label: "HTTP" },
      { type: "webhook", label: "Webhook" },
      { type: "custom_script", label: "Custom Script" },
    ],
  },
  {
    group: "Notify",
    items: [
      { type: "notification", label: "Notification" },
      { type: "email", label: "Email" },
      { type: "slack", label: "Slack" },
      { type: "discord", label: "Discord" },
      { type: "github", label: "GitHub" },
    ],
  },
];

function uid(prefix = "n") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

function emptyDef() {
  return {
    nodes: [
      { id: "start", type: "start", label: "Start", position: { x: 120, y: 200 }, config: {} },
      { id: "end", type: "end", label: "End", position: { x: 480, y: 200 }, config: {} },
    ],
    edges: [{ id: "e_start_end", source: "start", target: "end" }],
    groups: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function statusBadge(status) {
  const s = String(status || "").toUpperCase();
  if (["COMPLETED", "PUBLISHED"].includes(s)) return "ok";
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(s)) return "err";
  if (["RUNNING", "QUEUED", "WAITING", "AWAITING_APPROVAL", "PAUSED"].includes(s)) return "run";
  return "";
}

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [definition, setDefinition] = useState(emptyDef());
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("builder");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [variablesText, setVariablesText] = useState("{}");
  const [executions, setExecutions] = useState([]);
  const [activeExec, setActiveExec] = useState(null);
  const [nodeStates, setNodeStates] = useState({});
  const [logs, setLogs] = useState([]);
  const [templates, setTemplates] = useState({ builtins: [], custom: [] });
  const [metrics, setMetrics] = useState(null);
  const [validation, setValidation] = useState(null);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const [connecting, setConnecting] = useState(null);
  const [history, setHistory] = useState([]);
  const [future, setFuture] = useState([]);
  const [clipboard, setClipboard] = useState(null);
  const [runInputs, setRunInputs] = useState('{"message":"Hello workflow"}');
  const [cronExpr, setCronExpr] = useState("0 * * * *");
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);

  const active = useMemo(
    () => workflows.find((w) => w.id === activeId) || null,
    [workflows, activeId],
  );
  const selected = useMemo(
    () => definition.nodes.find((n) => n.id === selectedId) || null,
    [definition, selectedId],
  );

  const pushHistory = useCallback((next) => {
    setHistory((h) => [...h.slice(-49), definition]);
    setFuture([]);
    setDefinition(next);
  }, [definition]);

  const undo = () => {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [definition, ...f]);
    setHistory((h) => h.slice(0, -1));
    setDefinition(prev);
  };

  const redo = () => {
    if (!future.length) return;
    const next = future[0];
    setHistory((h) => [...h, definition]);
    setFuture((f) => f.slice(1));
    setDefinition(next);
  };

  const loadList = async () => {
    const data = await getWorkflows();
    setWorkflows(data || []);
    if (!activeId && data?.[0]) setActiveId(data[0].id);
  };

  const loadOne = async (id) => {
    if (!id) return;
    const wf = await getWorkflow(id);
    setName(wf.name || "");
    setDescription(wf.description || "");
    setDefinition(wf.definition?.nodes ? wf.definition : emptyDef());
    setViewport(wf.definition?.viewport || { x: 0, y: 0, zoom: 1 });
    setVariablesText(JSON.stringify(wf.variables || {}, null, 2));
    setSelectedId(null);
    const ex = await getExecutions(id);
    setExecutions(ex || []);
    try {
      setMetrics(await getWorkflowMetrics(id));
    } catch {
      setMetrics(null);
    }
  };

  useEffect(() => {
    loadList().catch(console.error);
    getTemplates().then(setTemplates).catch(() => null);
    getNodeTypes().catch(() => null);
  }, []);

  useEffect(() => {
    if (activeId) loadOne(activeId).catch(console.error);
  }, [activeId]);

  useEffect(() => {
    const onKey = (e) => {
      if (tab !== "builder") return;
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (meta && e.key === "y") {
        e.preventDefault();
        redo();
      }
      if (meta && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (meta && e.key === "c" && selected) {
        setClipboard(JSON.parse(JSON.stringify(selected)));
      }
      if (meta && e.key === "v" && clipboard) {
        const copy = {
          ...clipboard,
          id: uid("n"),
          position: {
            x: (clipboard.position?.x || 0) + 40,
            y: (clipboard.position?.y || 0) + 40,
          },
        };
        pushHistory({ ...definition, nodes: [...definition.nodes, copy] });
        setSelectedId(copy.id);
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selected && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
        deleteSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const handleCreate = async () => {
    const wf = await createWorkflow({
      name: `Workflow ${workflows.length + 1}`,
      description: "",
      definition: emptyDef(),
    });
    await loadList();
    setActiveId(wf.id);
  };

  const handleSave = async () => {
    if (!activeId) return;
    setSaving(true);
    try {
      let variables = {};
      try {
        variables = JSON.parse(variablesText || "{}");
      } catch {
        /* keep */
      }
      await updateWorkflow(activeId, {
        name,
        description,
        definition: { ...definition, viewport },
        variables,
      });
      await loadList();
      setLogs((l) => [`[${new Date().toLocaleTimeString()}] Saved`, ...l].slice(0, 100));
    } finally {
      setSaving(false);
    }
  };

  const handleRun = async () => {
    if (!activeId) return;
    setRunning(true);
    setNodeStates({});
    setLogs([]);
    try {
      let inputs = {};
      try {
        inputs = JSON.parse(runInputs || "{}");
      } catch {
        inputs = { message: runInputs };
      }
      const exec = await executeWorkflow(activeId, inputs);
      setActiveExec(exec);
      setTab("monitor");
      pollExecution(exec.id);
    } catch (err) {
      setLogs((l) => [`Error: ${err.message}`, ...l]);
    } finally {
      setRunning(false);
    }
  };

  const pollExecution = async (executionId) => {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const exec = await getExecution(executionId);
        setActiveExec(exec);
        const map = {};
        for (const n of exec.nodes || []) {
          map[n.nodeKey] = n.status;
        }
        setNodeStates(map);
        setLogs((prev) => {
          const lines = (exec.nodes || [])
            .filter((n) => n.status === "COMPLETED" || n.status === "FAILED")
            .map((n) => `[${n.nodeType}] ${n.nodeKey}: ${n.status}${n.error ? " — " + n.error : ""}`);
          return [...lines, ...prev].slice(0, 200);
        });
        const terminal = ["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(exec.status);
        if (!terminal && tries < 120) setTimeout(tick, 1500);
        else {
          const ex = await getExecutions(activeId);
          setExecutions(ex || []);
        }
      } catch {
        /* ignore */
      }
    };
    tick();
  };

  const addNode = (type, label, at = null) => {
    const id = uid(type);
    const rect = canvasRef.current?.getBoundingClientRect();
    const position = at || {
      x: ((rect?.width || 600) / 2 - viewport.x) / viewport.zoom - 70,
      y: ((rect?.height || 400) / 2 - viewport.y) / viewport.zoom - 30,
    };
    const node = { id, type, label: label || type, position, config: {} };
    pushHistory({ ...definition, nodes: [...definition.nodes, node] });
    setSelectedId(id);
  };

  const updateSelected = (patch) => {
    if (!selected) return;
    pushHistory({
      ...definition,
      nodes: definition.nodes.map((n) => (n.id === selected.id ? { ...n, ...patch } : n)),
    });
  };

  const updateSelectedConfig = (key, value) => {
    if (!selected) return;
    updateSelected({ config: { ...(selected.config || {}), [key]: value } });
  };

  const deleteSelected = () => {
    if (!selected) return;
    pushHistory({
      ...definition,
      nodes: definition.nodes.filter((n) => n.id !== selected.id),
      edges: definition.edges.filter((e) => e.source !== selected.id && e.target !== selected.id),
    });
    setSelectedId(null);
  };

  const onPortDown = (nodeId, handle, e) => {
    e.stopPropagation();
    setConnecting({ source: nodeId, sourceHandle: handle });
  };

  const onPortUp = (nodeId, handle, e) => {
    e.stopPropagation();
    if (!connecting || connecting.source === nodeId) {
      setConnecting(null);
      return;
    }
    const edge = {
      id: uid("e"),
      source: connecting.source,
      target: nodeId,
      sourceHandle: connecting.sourceHandle || null,
      targetHandle: handle || null,
    };
    pushHistory({ ...definition, edges: [...definition.edges, edge] });
    setConnecting(null);
  };

  const onNodeMouseDown = (node, e) => {
    if (e.target.classList?.contains("wf-port")) return;
    setSelectedId(node.id);
    const startX = e.clientX;
    const startY = e.clientY;
    const orig = { ...node.position };
    dragRef.current = { id: node.id, startX, startY, orig };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (dragRef.current) {
        const { id, startX, startY, orig } = dragRef.current;
        const dx = (e.clientX - startX) / viewport.zoom;
        const dy = (e.clientY - startY) / viewport.zoom;
        setDefinition((d) => ({
          ...d,
          nodes: d.nodes.map((n) =>
            n.id === id ? { ...n, position: { x: orig.x + dx, y: orig.y + dy } } : n,
          ),
        }));
      }
      if (panRef.current) {
        const dx = e.clientX - panRef.current.x;
        const dy = e.clientY - panRef.current.y;
        setViewport((v) => ({ ...v, x: panRef.current.vx + dx, y: panRef.current.vy + dy }));
      }
    };
    const onUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        setHistory((h) => [...h.slice(-49), definition]);
      }
      panRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [viewport.zoom, definition]);

  const edgePath = (e) => {
    const s = definition.nodes.find((n) => n.id === e.source);
    const t = definition.nodes.find((n) => n.id === e.target);
    if (!s || !t) return "";
    const x1 = (s.position?.x || 0) + 150;
    const y1 = (s.position?.y || 0) + 28;
    const x2 = t.position?.x || 0;
    const y2 = (t.position?.y || 0) + 28;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  };

  const nodeClass = (n) => {
    const st = nodeStates[n.id];
    const parts = ["wf-node"];
    if (selectedId === n.id) parts.push("selected");
    if (st === "RUNNING" || st === "RETRYING") parts.push("running");
    if (st === "COMPLETED") parts.push("completed");
    if (st === "FAILED") parts.push("failed");
    if (st === "QUEUED" || st === "PENDING") parts.push("queued");
    return parts.join(" ");
  };

  return (
    <div className="wf-root">
      <Sidebar />
      <div className="wf-main">
        <div className="wf-toolbar">
          <GitBranch size={16} color="#F15B42" />
          <h1>Workflow Engine</h1>
          <button className="wf-btn" onClick={handleCreate}><Plus size={14} /> New</button>
          <button className="wf-btn" onClick={handleSave} disabled={!activeId || saving}>
            <Save size={14} /> {saving ? "Saving…" : "Save"}
          </button>
          <button className="wf-btn primary" onClick={handleRun} disabled={!activeId || running}>
            <Play size={14} /> Run
          </button>
          <button className="wf-btn" onClick={undo} disabled={!history.length}><RotateCcw size={14} /> Undo</button>
          <button className="wf-btn" onClick={() => activeId && layoutWorkflow(activeId).then((w) => { setDefinition(w.definition); loadList(); })}>
            <LayoutGrid size={14} /> Auto layout
          </button>
          <button className="wf-btn" onClick={async () => {
            if (!activeId) return;
            setValidation(await validateWorkflow(activeId));
            setTab("validate");
          }}>Validate</button>
          <button className="wf-btn" onClick={async () => {
            if (!activeId) return;
            await publishWorkflow(activeId);
            loadList();
          }}>Publish</button>
          <button className="wf-btn" onClick={async () => {
            if (!activeId) return;
            const data = await exportWorkflow(activeId);
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${name || "workflow"}.json`;
            a.click();
          }}><Download size={14} /></button>
          <button className="wf-btn" onClick={async () => {
            if (!activeId) return;
            const wf = await cloneWorkflow(activeId);
            await loadList();
            setActiveId(wf.id);
          }}><Copy size={14} /></button>
          <button className="wf-btn" onClick={async () => {
            if (!activeId) return;
            await deleteWorkflow(activeId);
            setActiveId(null);
            loadList();
          }}><Trash2 size={14} /></button>

          <div className="wf-tabs" style={{ marginLeft: "auto", marginBottom: 0 }}>
            {["builder", "monitor", "history", "templates", "triggers", "metrics", "variables", "validate"].map((t) => (
              <button key={t} className={`wf-tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "builder" && (
          <div className="wf-workspace">
            <aside className="wf-palette">
              <h3>Workflows</h3>
              <div className="wf-list" style={{ marginBottom: "1rem" }}>
                {workflows.map((w) => (
                  <div
                    key={w.id}
                    className={`wf-list-item ${w.id === activeId ? "active" : ""}`}
                    onClick={() => setActiveId(w.id)}
                  >
                    <div style={{ fontWeight: 600 }}>{w.name}</div>
                    <div style={{ fontSize: "0.65rem", color: "#94a3b8" }}>
                      v{w.version} · <span className={`wf-badge ${statusBadge(w.status)}`}>{w.status}</span>
                    </div>
                  </div>
                ))}
              </div>
              <h3>Node palette</h3>
              {PALETTE.map((g) => (
                <div key={g.group} className="wf-palette-group">
                  <div style={{ fontSize: "0.65rem", color: "#64748b", marginBottom: 4 }}>{g.group}</div>
                  {g.items.map((item) => (
                    <div
                      key={item.type}
                      className="wf-palette-item"
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("application/wf-node", JSON.stringify(item))}
                      onDoubleClick={() => addNode(item.type, item.label)}
                    >
                      <Boxes size={12} /> {item.label}
                    </div>
                  ))}
                </div>
              ))}
            </aside>

            <div
              className="wf-canvas-wrap"
              ref={canvasRef}
              onWheel={(e) => {
                e.preventDefault();
                const delta = e.deltaY > 0 ? 0.9 : 1.1;
                setViewport((v) => ({ ...v, zoom: Math.min(2.5, Math.max(0.35, v.zoom * delta)) }));
              }}
              onMouseDown={(e) => {
                if (e.button === 1 || e.altKey || e.target === canvasRef.current) {
                  panRef.current = { x: e.clientX, y: e.clientY, vx: viewport.x, vy: viewport.y };
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const raw = e.dataTransfer.getData("application/wf-node");
                if (!raw) return;
                const item = JSON.parse(raw);
                const rect = canvasRef.current.getBoundingClientRect();
                addNode(item.type, item.label, {
                  x: (e.clientX - rect.left - viewport.x) / viewport.zoom - 70,
                  y: (e.clientY - rect.top - viewport.y) / viewport.zoom - 20,
                });
              }}
              onClick={() => setSelectedId(null)}
            >
              <div
                className="wf-canvas-inner"
                style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
              >
                <svg width="4000" height="3000" style={{ position: "absolute", inset: 0, overflow: "visible" }}>
                  {definition.edges.map((e) => (
                    <path
                      key={e.id}
                      d={edgePath(e)}
                      className={`wf-edge ${nodeStates[e.source] === "COMPLETED" ? "completed" : ""}`}
                      onDoubleClick={() =>
                        pushHistory({ ...definition, edges: definition.edges.filter((x) => x.id !== e.id) })
                      }
                    />
                  ))}
                </svg>
                {definition.nodes.map((n) => (
                  <div
                    key={n.id}
                    className={nodeClass(n)}
                    style={{ left: n.position?.x || 0, top: n.position?.y || 0 }}
                    onMouseDown={(e) => onNodeMouseDown(n, e)}
                    onClick={(e) => { e.stopPropagation(); setSelectedId(n.id); }}
                  >
                    <div className="wf-node-header">{n.label || n.type}</div>
                    <div className="wf-node-body">{n.type}</div>
                    <div
                      className="wf-port in"
                      onMouseDown={(e) => e.stopPropagation()}
                      onMouseUp={(e) => onPortUp(n.id, "in", e)}
                    />
                    {n.type === "condition" ? (
                      <>
                        <div className="wf-port true" title="true" onMouseDown={(e) => onPortDown(n.id, "true", e)} />
                        <div className="wf-port false" title="false" onMouseDown={(e) => onPortDown(n.id, "false", e)} />
                      </>
                    ) : (
                      <div className="wf-port out" onMouseDown={(e) => onPortDown(n.id, "out", e)} />
                    )}
                  </div>
                ))}
              </div>

              <div className="wf-zoom">
                <button className="wf-btn" onClick={() => setViewport((v) => ({ ...v, zoom: Math.min(2.5, v.zoom * 1.15) }))}><ZoomIn size={14} /></button>
                <button className="wf-btn" onClick={() => setViewport((v) => ({ ...v, zoom: Math.max(0.35, v.zoom / 1.15) }))}><ZoomOut size={14} /></button>
                <button className="wf-btn" onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}>Reset</button>
              </div>

              <div className="wf-minimap">
                {definition.nodes.map((n) => (
                  <div
                    key={n.id}
                    className="wf-minimap-node"
                    style={{
                      left: ((n.position?.x || 0) / 4000) * 160,
                      top: ((n.position?.y || 0) / 3000) * 100,
                    }}
                  />
                ))}
              </div>
            </div>

            <aside className="wf-inspector">
              <h3>Inspector</h3>
              {active && (
                <>
                  <div className="wf-field">
                    <label>Name</label>
                    <input value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                  <div className="wf-field">
                    <label>Description</label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div className="wf-field">
                    <label>Run inputs (JSON)</label>
                    <textarea value={runInputs} onChange={(e) => setRunInputs(e.target.value)} />
                  </div>
                </>
              )}
              {selected ? (
                <>
                  <h3>Node</h3>
                  <div className="wf-field">
                    <label>Label</label>
                    <input value={selected.label || ""} onChange={(e) => updateSelected({ label: e.target.value })} />
                  </div>
                  <div className="wf-field">
                    <label>Type</label>
                    <input value={selected.type} disabled />
                  </div>
                  {["llm", "coordinator", "research_agent", "architect_agent", "coder_agent", "reviewer_agent", "tester_agent"].includes(selected.type) && (
                    <div className="wf-field">
                      <label>Message / Prompt</label>
                      <textarea
                        value={selected.config?.message || selected.config?.prompt || ""}
                        onChange={(e) => updateSelectedConfig(selected.type === "llm" ? "prompt" : "message", e.target.value)}
                      />
                    </div>
                  )}
                  {selected.type === "condition" && (
                    <div className="wf-field">
                      <label>Expression</label>
                      <input
                        value={selected.config?.expression || ""}
                        onChange={(e) => updateSelectedConfig("expression", e.target.value)}
                        placeholder="inputs.severity == true"
                      />
                    </div>
                  )}
                  {selected.type === "delay" && (
                    <div className="wf-field">
                      <label>Delay ms</label>
                      <input
                        type="number"
                        value={selected.config?.ms || 1000}
                        onChange={(e) => updateSelectedConfig("ms", Number(e.target.value))}
                      />
                    </div>
                  )}
                  {selected.type === "http" && (
                    <>
                      <div className="wf-field">
                        <label>Method</label>
                        <select
                          value={selected.config?.method || "GET"}
                          onChange={(e) => updateSelectedConfig("method", e.target.value)}
                        >
                          {["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <div className="wf-field">
                        <label>URL</label>
                        <input
                          value={selected.config?.url || ""}
                          onChange={(e) => updateSelectedConfig("url", e.target.value)}
                        />
                      </div>
                    </>
                  )}
                  {selected.type === "custom_script" && (
                    <div className="wf-field">
                      <label>Code</label>
                      <textarea
                        value={selected.config?.code || ""}
                        onChange={(e) => updateSelectedConfig("code", e.target.value)}
                        placeholder={"function run(inputs, variables) {\n  return { ok: true };\n}"}
                      />
                    </div>
                  )}
                  {["knowledge_retrieval", "context_retrieval", "workspace_intelligence"].includes(selected.type) && (
                    <div className="wf-field">
                      <label>Query</label>
                      <textarea
                        value={selected.config?.query || ""}
                        onChange={(e) => updateSelectedConfig("query", e.target.value)}
                      />
                    </div>
                  )}
                  {selected.type === "tool" && (
                    <>
                      <div className="wf-field">
                        <label>Tool ID</label>
                        <input
                          value={selected.config?.tool || ""}
                          onChange={(e) => updateSelectedConfig("tool", e.target.value)}
                          placeholder="filesystem.read_file"
                        />
                      </div>
                      <div className="wf-field">
                        <label>Arguments JSON</label>
                        <textarea
                          value={JSON.stringify(selected.config?.arguments || {}, null, 2)}
                          onChange={(e) => {
                            try {
                              updateSelectedConfig("arguments", JSON.parse(e.target.value));
                            } catch { /* */ }
                          }}
                        />
                      </div>
                    </>
                  )}
                  <button className="wf-btn" onClick={deleteSelected}><Trash2 size={14} /> Delete node</button>
                </>
              ) : (
                <div className="wf-empty">Select a node or drag from the palette</div>
              )}
            </aside>
          </div>
        )}

        {tab === "monitor" && (
          <div style={{ padding: "1rem", overflow: "auto" }}>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <button className="wf-btn" disabled={!activeExec} onClick={() => pauseExecution(activeExec.id)}><Pause size={14} /> Pause</button>
              <button className="wf-btn" disabled={!activeExec} onClick={() => resumeExecution(activeExec.id).then(() => pollExecution(activeExec.id))}><Play size={14} /> Resume</button>
              <button className="wf-btn" disabled={!activeExec} onClick={() => cancelExecution(activeExec.id)}><Square size={14} /> Cancel</button>
              <button className="wf-btn" disabled={!activeExec} onClick={() => retryExecution(activeExec.id).then(() => pollExecution(activeExec.id))}><RotateCcw size={14} /> Retry</button>
              <button className="wf-btn primary" disabled={!activeExec} onClick={() => approveExecution(activeExec.id, { approved: true }).then(() => pollExecution(activeExec.id))}>
                <CheckCircle2 size={14} /> Approve
              </button>
            </div>
            {activeExec ? (
              <>
                <div style={{ marginBottom: "0.75rem" }}>
                  Status: <span className={`wf-badge ${statusBadge(activeExec.status)}`}>{activeExec.status}</span>
                  {activeExec.durationMs != null && <> · {activeExec.durationMs}ms</>}
                  {activeExec.error && <> · {activeExec.error}</>}
                </div>
                <h3 style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Execution graph</h3>
                <div className="wf-list" style={{ marginBottom: "1rem" }}>
                  {(activeExec.nodes || []).map((n) => (
                    <div key={n.id} className="wf-list-item">
                      <strong>{n.label || n.nodeKey}</strong> · {n.nodeType}{" "}
                      <span className={`wf-badge ${statusBadge(n.status)}`}>{n.status}</span>
                      {n.latencyMs != null && <span style={{ color: "#64748b" }}> · {n.latencyMs}ms</span>}
                      {n.tokensUsed > 0 && <span> · {n.tokensUsed} tok</span>}
                    </div>
                  ))}
                </div>
                <h3 style={{ fontSize: "0.8rem", color: "#94a3b8" }}>Logs</h3>
                <div className="wf-logs">
                  {logs.map((l, i) => <div key={i} className="wf-log-line">{l}</div>)}
                </div>
                <h3 style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "1rem" }}>Artifacts</h3>
                <div className="wf-list">
                  {(activeExec.artifacts || []).map((a) => (
                    <div key={a.id} className="wf-list-item">
                      {a.name} · {a.type} · {a.sizeBytes}B
                      <pre style={{ fontSize: "0.65rem", marginTop: 4, whiteSpace: "pre-wrap" }}>
                        {a.content || JSON.stringify(a.data, null, 2)}
                      </pre>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="wf-empty">Run a workflow to monitor execution</div>
            )}
          </div>
        )}

        {tab === "history" && (
          <div style={{ padding: "1rem", overflow: "auto" }}>
            <div className="wf-list">
              {executions.map((ex) => (
                <div
                  key={ex.id}
                  className="wf-list-item"
                  onClick={() => getExecution(ex.id).then((e) => { setActiveExec(e); setTab("monitor"); })}
                >
                  <Clock size={12} style={{ display: "inline", marginRight: 6 }} />
                  {ex.id.slice(0, 8)} · <span className={`wf-badge ${statusBadge(ex.status)}`}>{ex.status}</span>
                  · {ex.triggerType} · {new Date(ex.createdAt).toLocaleString()}
                </div>
              ))}
              {!executions.length && <div className="wf-empty">No executions yet</div>}
            </div>
          </div>
        )}

        {tab === "templates" && (
          <div style={{ padding: "1rem", overflow: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: "0.75rem" }}>
            {[...(templates.builtins || []), ...(templates.custom || [])].map((t) => (
              <div key={t.id} className="wf-list-item">
                <div style={{ fontWeight: 600 }}>{t.name}</div>
                <div style={{ fontSize: "0.7rem", color: "#94a3b8", margin: "0.35rem 0" }}>{t.description}</div>
                <button
                  className="wf-btn primary"
                  onClick={async () => {
                    const wf = await createFromTemplate(t.id);
                    await loadList();
                    setActiveId(wf.id);
                    setTab("builder");
                  }}
                >
                  <Upload size={14} /> Use template
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "triggers" && activeId && (
          <div style={{ padding: "1rem", maxWidth: 520 }}>
            <h3 style={{ fontSize: "0.85rem" }}>Schedule (cron)</h3>
            <div className="wf-field">
              <label>Cron expression</label>
              <input value={cronExpr} onChange={(e) => setCronExpr(e.target.value)} />
            </div>
            <button
              className="wf-btn primary"
              onClick={async () => {
                await createSchedule(activeId, { cron: cronExpr, timezone: "UTC", inputs: JSON.parse(runInputs || "{}") });
                setLogs((l) => ["Schedule created", ...l]);
              }}
            >
              <Activity size={14} /> Add schedule
            </button>
            <h3 style={{ fontSize: "0.85rem", marginTop: "1.25rem" }}>Webhook trigger</h3>
            <button
              className="wf-btn"
              onClick={async () => {
                const t = await createTrigger(activeId, { type: "webhook", name: "API Webhook" });
                setLogs((l) => [`Webhook trigger ${t.id} secret=${t.webhookSecret}`, ...l]);
                alert(`POST /api/workflows/hooks/${t.id}\nHeader x-webhook-secret: ${t.webhookSecret}`);
              }}
            >
              <Settings2 size={14} /> Create webhook
            </button>
          </div>
        )}

        {tab === "metrics" && (
          <div style={{ padding: "1rem" }}>
            {metrics ? (
              <>
                <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                  <div className="wf-list-item">Runs: {metrics.runCount}</div>
                  <div className="wf-list-item">Avg latency: {metrics.avgLatencyMs}ms</div>
                  <div className="wf-list-item">Last: {metrics.lastRunAt ? new Date(metrics.lastRunAt).toLocaleString() : "—"}</div>
                </div>
                <pre style={{ fontSize: "0.7rem", marginTop: "1rem", color: "#94a3b8" }}>
                  {JSON.stringify(metrics.byStatus, null, 2)}
                </pre>
              </>
            ) : (
              <div className="wf-empty">No metrics</div>
            )}
          </div>
        )}

        {tab === "variables" && (
          <div style={{ padding: "1rem", maxWidth: 640 }}>
            <div className="wf-field">
              <label>Workflow variables (JSON)</label>
              <textarea rows={16} value={variablesText} onChange={(e) => setVariablesText(e.target.value)} />
            </div>
            <button className="wf-btn primary" onClick={handleSave}>Save variables</button>
          </div>
        )}

        {tab === "validate" && (
          <div style={{ padding: "1rem" }}>
            {validation ? (
              <>
                <div className={`wf-badge ${validation.ok ? "ok" : "err"}`}>
                  {validation.ok ? "Valid" : "Invalid"}
                </div>
                <pre style={{ fontSize: "0.7rem", marginTop: "0.75rem" }}>
                  {JSON.stringify({ errors: validation.errors, warnings: validation.warnings }, null, 2)}
                </pre>
              </>
            ) : (
              <div className="wf-empty">Click Validate in the toolbar</div>
            )}
          </div>
        )}

        <div className="wf-bottom">
          <div className="wf-logs" style={{ maxHeight: 80 }}>
            {logs.slice(0, 8).map((l, i) => <div key={i} className="wf-log-line">{l}</div>)}
            {!logs.length && <div className="wf-log-line">Ready — drag nodes, connect ports, Run to execute via Coordinator / Tools / Knowledge / Intelligence.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
