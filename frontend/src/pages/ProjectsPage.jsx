import { useCallback, useEffect, useRef, useState, lazy, Suspense } from "react";
import {
  PanelLeft,
  PanelRight,
  Loader2,
} from "lucide-react";
import { Panel, Group, Separator } from "react-resizable-panels";
import Sidebar from "../components/Sidebar";
import WorkspaceExplorer from "../components/workspace/WorkspaceExplorer";
import FileExplorer from "../components/workspace/FileExplorer";
import * as projectApi from "../api/projectApi";
import "../components/workspace/ide.css";

const MonacoWorkspace = lazy(() => import("../components/workspace/MonacoWorkspace"));
const BottomPanel = lazy(() => import("../components/workspace/BottomPanel"));
const AiExecutionPanel = lazy(() => import("../components/workspace/AiExecutionPanel"));
const LivePreview = lazy(() => import("../components/workspace/LivePreview"));
const IntelligencePanel = lazy(() => import("../components/intelligence/IntelligencePanel"));

const AUTOSAVE_MS = 1200;
const LAYOUT_SAVE_MS = 800;

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState(null);
  const [creating, setCreating] = useState(false);
  const [loadingProject, setLoadingProject] = useState(false);

  const [tabs, setTabs] = useState([]);
  const [activeTabId, setActiveTabId] = useState(null);
  const [dirtyMap, setDirtyMap] = useState({});
  const [selection, setSelection] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState(null);

  const [logs, setLogs] = useState([]);
  const [diffs, setDiffs] = useState([]);
  const [problems, setProblems] = useState([]);
  const [executions, setExecutions] = useState([]);

  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState("terminal");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [rightTab, setRightTab] = useState("intelligence");
  const [mobileExplorer, setMobileExplorer] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const [secondaryTabId, setSecondaryTabId] = useState(null);

  const [runState, setRunState] = useState(null);
  const [detectInfo, setDetectInfo] = useState(null);
  const [running, setRunning] = useState(false);

  const saveTimers = useRef({});
  const contentRef = useRef({});
  const layoutTimer = useRef(null);
  const pollRef = useRef(null);

  const loadProjects = useCallback(async () => {
    try {
      const data = await projectApi.getProjects();
      setProjects(data || []);
      return data || [];
    } catch (err) {
      console.error(err);
      return [];
    }
  }, []);

  const refreshProjectSideData = useCallback(async (projectId, projectPayload) => {
    if (!projectId) return;
    try {
      const [logsData, diffsData, problemsData, execData, runsData, detect] =
        await Promise.all([
          projectPayload?.logs
            ? Promise.resolve(projectPayload.logs)
            : projectApi.getLogs(projectId),
          projectPayload?.diffs
            ? Promise.resolve(projectPayload.diffs)
            : projectApi.getDiffs(projectId, "pending"),
          projectApi.getProblems(projectId),
          projectPayload?.executions
            ? Promise.resolve(projectPayload.executions)
            : projectApi.getExecutions(projectId),
          projectApi.listRuns(projectId).catch(() => ({ runs: [], activeId: null })),
          projectApi.detectType(projectId).catch(() => null),
        ]);
      setLogs(logsData || []);
      setDiffs((diffsData || []).filter((d) => d.status === "pending"));
      setProblems(problemsData || []);
      setExecutions(execData || []);
      setSelectedExecution(execData?.[0] || null);
      setDetectInfo(detect);
      const active = (runsData?.runs || []).find((r) => r.id === runsData.activeId) ||
        (runsData?.runs || []).find((r) => r.status === "running");
      setRunState(active || runsData?.runs?.[0] || null);
      setRunning(Boolean(active && active.status === "running"));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const persistLayout = useCallback(
    (projectId, nextTabs, nextActive, layoutExtra = {}) => {
      if (!projectId) return;
      clearTimeout(layoutTimer.current);
      layoutTimer.current = setTimeout(() => {
        projectApi
          .saveLayout(projectId, {
            layout: {
              bottomOpen,
              bottomTab,
              leftOpen,
              rightOpen,
              previewOpen,
              splitView,
              secondaryTabId,
              ...layoutExtra,
            },
            tabs: (nextTabs || tabs).map((t, i) => ({
              fileId: t.id,
              isActive: t.id === (nextActive ?? activeTabId),
              viewGroup: "main",
              sortOrder: i,
            })),
          })
          .catch(() => {});
      }, LAYOUT_SAVE_MS);
    },
    [
      tabs,
      activeTabId,
      bottomOpen,
      bottomTab,
      leftOpen,
      rightOpen,
      previewOpen,
      splitView,
      secondaryTabId,
    ]
  );

  const openFile = (file, project = selectedProject) => {
    if (!file || file.isFolder) return;
    setTabs((prev) => {
      let next;
      if (prev.some((t) => t.id === file.id)) {
        next = prev;
      } else {
        const content = file.content ?? "";
        contentRef.current[file.id] = content;
        next = [...prev, { id: file.id, name: file.name, path: file.path, content }];
      }
      persistLayout(project?.id, next, file.id);
      return next;
    });
    setActiveTabId(file.id);
  };

  const openFileByPath = useCallback(
    (path) => {
      if (!path || !selectedProject?.files) return;
      const normalized = String(path).replace(/\\/g, "/");
      const file = selectedProject.files.find((f) => {
        const p = String(f.path || "").replace(/\\/g, "/");
        return p === normalized || p.endsWith("/" + normalized) || p.endsWith(normalized);
      });
      if (file) openFile(file);
    },
    [selectedProject],
  );

  const selectProject = useCallback(
    async (projectId) => {
      if (!projectId) {
        setSelectedProject(null);
        setTabs([]);
        setActiveTabId(null);
        return;
      }
      setLoadingProject(true);
      setMobileExplorer(false);
      try {
        const project = await projectApi.getProject(projectId);
        setSelectedProject(project);
        setDirtyMap({});
        contentRef.current = {};
        await projectApi.syncWorkspace(projectId).catch(() => {});
        await refreshProjectSideData(projectId, project);

        const layoutData = await projectApi.getLayout(projectId).catch(() => null);
        if (layoutData?.layout) {
          const L = layoutData.layout;
          if (typeof L.bottomOpen === "boolean") setBottomOpen(L.bottomOpen);
          if (L.bottomTab) setBottomTab(L.bottomTab);
          if (typeof L.leftOpen === "boolean") setLeftOpen(L.leftOpen);
          if (typeof L.rightOpen === "boolean") setRightOpen(L.rightOpen);
          if (typeof L.previewOpen === "boolean") setPreviewOpen(L.previewOpen);
          if (typeof L.splitView === "boolean") setSplitView(L.splitView);
          if (L.secondaryTabId) setSecondaryTabId(L.secondaryTabId);
        }

        const savedTabs = layoutData?.tabs || [];
        if (savedTabs.length) {
          const restored = [];
          for (const t of savedTabs) {
            const f = project.files.find((x) => x.id === t.fileId);
            if (f && !f.isFolder) {
              contentRef.current[f.id] = f.content ?? "";
              restored.push({
                id: f.id,
                name: f.name,
                path: f.path,
                content: f.content ?? "",
              });
            }
          }
          setTabs(restored);
          const active = savedTabs.find((t) => t.isActive)?.fileId || restored[0]?.id;
          setActiveTabId(active || null);
        } else {
          setTabs([]);
          setActiveTabId(null);
          const firstFile = project.files?.find((f) => !f.isFolder);
          if (firstFile) openFile(firstFile, project);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProject(false);
      }
    },
    [refreshProjectSideData]
  );

  useEffect(() => {
    (async () => {
      const list = await loadProjects();
      if (list.length) await selectProject(list[0].id);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll active run
  useEffect(() => {
    clearInterval(pollRef.current);
    if (!selectedProject || !running || !runState?.id) return;
    pollRef.current = setInterval(async () => {
      try {
        const run = await projectApi.getRun(selectedProject.id, runState.id);
        setRunState(run);
        if (run.status !== "running") {
          setRunning(false);
          const logsData = await projectApi.getLogs(selectedProject.id);
          setLogs(logsData);
        }
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [selectedProject, running, runState?.id]);

  const handleContentChange = (fileId, value) => {
    contentRef.current[fileId] = value;
    setTabs((prev) =>
      prev.map((t) => (t.id === fileId ? { ...t, content: value } : t))
    );
    setDirtyMap((prev) => ({ ...prev, [fileId]: true }));

    setSelectedProject((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        files: prev.files.map((f) =>
          f.id === fileId ? { ...f, content: value } : f
        ),
      };
    });

    clearTimeout(saveTimers.current[fileId]);
    saveTimers.current[fileId] = setTimeout(() => {
      saveFile(fileId, value);
    }, AUTOSAVE_MS);
  };

  const saveFile = async (fileId, value) => {
    const content = value ?? contentRef.current[fileId];
    if (content === undefined) return;
    try {
      await projectApi.updateFile(fileId, { content });
      setDirtyMap((prev) => ({ ...prev, [fileId]: false }));
      setTabs((prev) =>
        prev.map((t) => (t.id === fileId ? { ...t, content } : t))
      );
      if (selectedProject) {
        const [logsData, problemsData] = await Promise.all([
          projectApi.getLogs(selectedProject.id),
          projectApi.getProblems(selectedProject.id),
        ]);
        setLogs(logsData);
        setProblems(problemsData);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateProject = async ({ name, framework, description }) => {
    setCreating(true);
    try {
      const project = await projectApi.createProject({
        name,
        framework,
        description,
        generate: true,
      });
      await loadProjects();
      setSelectedProject(project);
      setTabs([]);
      setActiveTabId(null);
      await refreshProjectSideData(project.id, project);
      const firstFile = project.files?.find((f) => !f.isFolder);
      if (firstFile) openFile(firstFile, project);
      setBottomTab("ai");
      setBottomOpen(true);
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to create project");
    } finally {
      setCreating(false);
    }
  };

  const handleRenameProject = async (id, name) => {
    await projectApi.updateProject(id, { name });
    await loadProjects();
    if (selectedProject?.id === id) {
      setSelectedProject((p) => ({ ...p, name }));
    }
  };

  const handleDeleteProject = async (id) => {
    await projectApi.deleteProject(id);
    const list = await loadProjects();
    if (selectedProject?.id === id) {
      if (list[0]) await selectProject(list[0].id);
      else {
        setSelectedProject(null);
        setTabs([]);
        setActiveTabId(null);
      }
    }
  };

  const handleToggleFavorite = async (p) => {
    await projectApi.updateProject(p.id, { isFavorite: !p.isFavorite });
    await loadProjects();
  };

  const handleReorder = async (orderedIds) => {
    setProjects((prev) => {
      const map = Object.fromEntries(prev.map((p) => [p.id, p]));
      return orderedIds.map((id) => map[id]).filter(Boolean);
    });
    try {
      await projectApi.reorderProjects(orderedIds);
    } catch (err) {
      console.error(err);
      await loadProjects();
    }
  };

  const reloadSelectedProject = async () => {
    if (!selectedProject) return;
    const project = await projectApi.getProject(selectedProject.id);
    setSelectedProject(project);
    setTabs((prev) =>
      prev.map((t) => {
        const f = project.files.find((x) => x.id === t.id);
        if (!f) return t;
        if (dirtyMap[t.id]) return t;
        contentRef.current[t.id] = f.content;
        return { ...t, name: f.name, path: f.path, content: f.content };
      })
    );
    await refreshProjectSideData(project.id, project);
  };

  const handleCreateFile = async (name, parentId) => {
    if (!selectedProject) return;
    const file = await projectApi.createFile(selectedProject.id, {
      name,
      parentId,
      content: "",
      isFolder: false,
    });
    await reloadSelectedProject();
    openFile(file);
  };

  const handleCreateFolder = async (name, parentId) => {
    if (!selectedProject) return;
    await projectApi.createFile(selectedProject.id, {
      name,
      parentId,
      isFolder: true,
      content: "",
    });
    await reloadSelectedProject();
  };

  const handleRenameFile = async (fileId, name) => {
    await projectApi.renameFile(fileId, name);
    await reloadSelectedProject();
    setTabs((prev) =>
      prev.map((t) => (t.id === fileId ? { ...t, name } : t))
    );
  };

  const handleDeleteFile = async (fileId) => {
    await projectApi.deleteFile(fileId);
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== fileId);
      if (activeTabId === fileId) {
        setActiveTabId(next[next.length - 1]?.id || null);
      }
      persistLayout(selectedProject?.id, next);
      return next;
    });
    await reloadSelectedProject();
  };

  const handleMoveFile = async (fileId, parentId) => {
    await projectApi.moveFile(fileId, { parentId });
    await reloadSelectedProject();
  };

  const handleUpload = async (files) => {
    if (!selectedProject) return;
    await projectApi.uploadFiles(selectedProject.id, files);
    await reloadSelectedProject();
  };

  const handleAiAction = async (action, sel) => {
    if (!selectedProject || !activeTabId) return;
    setAiBusy(true);
    setBottomTab("ai");
    setBottomOpen(true);
    try {
      if (dirtyMap[activeTabId]) {
        await saveFile(activeTabId, contentRef.current[activeTabId]);
      }
      const project = await projectApi.aiEdit(selectedProject.id, {
        fileId: activeTabId,
        selection: sel || undefined,
        action,
      });
      setSelectedProject(project);
      await refreshProjectSideData(project.id, project);
      setBottomTab("diff");
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "AI edit failed");
    } finally {
      setAiBusy(false);
    }
  };

  const handleAcceptDiff = async (diffId) => {
    if (!selectedProject) return;
    await projectApi.acceptDiff(selectedProject.id, diffId);
    await reloadSelectedProject();
    const project = await projectApi.getProject(selectedProject.id);
    setTabs((prev) =>
      prev.map((t) => {
        const f = project.files.find((x) => x.id === t.id);
        if (!f) return t;
        contentRef.current[t.id] = f.content;
        return { ...t, content: f.content };
      })
    );
    setDirtyMap({});
  };

  const handleRejectDiff = async (diffId) => {
    if (!selectedProject) return;
    await projectApi.rejectDiff(selectedProject.id, diffId);
    await refreshProjectSideData(selectedProject.id);
  };

  const handleRun = async () => {
    if (!selectedProject) return;
    setBottomTab("logs");
    setBottomOpen(true);
    setRunning(true);
    try {
      // flush dirty
      await Promise.all(
        Object.entries(dirtyMap)
          .filter(([, d]) => d)
          .map(([id]) => saveFile(id))
      );
      const run = await projectApi.startRun(selectedProject.id);
      setRunState(run);
      if (run.status !== "running") setRunning(false);
      const logsData = await projectApi.getLogs(selectedProject.id);
      setLogs(logsData);
      if (detectInfo?.type === "static" || run.command === "preview:static") {
        setPreviewOpen(true);
      }
    } catch (err) {
      setRunning(false);
      alert(err.response?.data?.message || "Run failed");
    }
  };

  const handleStop = async () => {
    if (!selectedProject) return;
    try {
      await projectApi.stopRun(selectedProject.id, {
        runId: runState?.id,
      });
      setRunning(false);
      const data = await projectApi.listRuns(selectedProject.id);
      setRunState(data.runs?.[0] || null);
      const logsData = await projectApi.getLogs(selectedProject.id);
      setLogs(logsData);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelAi = async (executionId) => {
    if (!selectedProject) return;
    await projectApi.cancelExecution(selectedProject.id, executionId);
    await refreshProjectSideData(selectedProject.id);
  };

  const handleProblemClick = (p) => {
    if (!selectedProject) return;
    const file = selectedProject.files.find((f) => f.id === p.fileId);
    if (file) openFile(file);
  };

  const closeTab = (id) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        setActiveTabId(next[next.length - 1]?.id || null);
      }
      if (secondaryTabId === id) setSecondaryTabId(next[0]?.id || null);
      persistLayout(selectedProject?.id, next);
      return next;
    });
  };

  useEffect(() => {
    if (selectedProject) {
      persistLayout(selectedProject.id);
    }
  }, [bottomOpen, bottomTab, leftOpen, rightOpen, previewOpen, splitView]); // eslint-disable-line

  useEffect(() => {
    localStorage.setItem("clawos_sidebar_collapsed", "true");
  }, []);

  const explorer = (
    <div className="ide-sidebar h-full">
      <WorkspaceExplorer
        projects={projects}
        selectedProjectId={selectedProject?.id}
        search={search}
        onSearch={setSearch}
        onSelect={selectProject}
        onCreate={handleCreateProject}
        onRename={handleRenameProject}
        onDelete={handleDeleteProject}
        onToggleFavorite={handleToggleFavorite}
        onReorder={handleReorder}
        creating={creating}
        onCollapse={() => setLeftOpen(false)}
      />
      {selectedProject && (
        <FileExplorer
          files={selectedProject.files}
          selectedFileId={activeTabId}
          dirtyMap={dirtyMap}
          onSelectFile={openFile}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onRenameFile={handleRenameFile}
          onDeleteFile={handleDeleteFile}
          onUpload={handleUpload}
          onMoveFile={handleMoveFile}
        />
      )}
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[#0b1220] text-slate-100">
      <Sidebar />

      <div className="ide-shell flex-1 min-w-0 relative">
        <button
          onClick={() => setMobileExplorer(true)}
          className="md:hidden absolute top-2 left-2 z-30 ide-btn ide-btn--icon"
          style={{ background: "var(--ide-elevated)" }}
        >
          <PanelLeft size={16} />
        </button>

        {!leftOpen && (
          <button
            className="ide-hide-sm absolute left-2 top-2 z-20 ide-btn ide-btn--icon"
            style={{ background: "var(--ide-elevated)", boxShadow: "var(--ide-shadow)" }}
            onClick={() => setLeftOpen(true)}
            title="Show explorer"
          >
            <PanelLeft size={14} />
          </button>
        )}
        {!rightOpen && (
          <button
            className="ide-hide-sm absolute right-2 top-2 z-20 ide-btn ide-btn--icon"
            style={{ background: "var(--ide-elevated)", boxShadow: "var(--ide-shadow)" }}
            onClick={() => setRightOpen(true)}
            title="Show AI panel"
          >
            <PanelRight size={14} />
          </button>
        )}

        <div className="ide-body">
          <Group orientation="horizontal" className="flex-1 min-w-0 h-full">
            {leftOpen && (
              <>
                <Panel
                  id="explorer"
                  defaultSize={280}
                  minSize={200}
                  maxSize={400}
                  className="ide-hide-sm"
                >
                  {explorer}
                </Panel>
                <Separator className="ide-sep-h ide-hide-sm" />
              </>
            )}

            <Panel id="main" minSize="40%" className="min-w-0">
              <Group orientation="vertical" className="h-full">
                <Panel id="editor" defaultSize={bottomOpen ? "75%" : "100%"} minSize="40%">
                  <div className="ide-editor-col relative">
                    <Suspense
                      fallback={
                        <div className="ide-empty">
                          <Loader2 className="animate-spin text-[#F15B42]" size={20} />
                        </div>
                      }
                    >
                      <MonacoWorkspace
                        tabs={tabs}
                        activeTabId={activeTabId}
                        dirtyMap={dirtyMap}
                        onSelectTab={(id) => {
                          setActiveTabId(id);
                          persistLayout(selectedProject?.id, tabs, id);
                        }}
                        onCloseTab={closeTab}
                        onChange={handleContentChange}
                        onSave={(id) => saveFile(id)}
                        onAiAction={handleAiAction}
                        aiBusy={aiBusy}
                        selection={selection}
                        onSelectionChange={setSelection}
                        problems={problems}
                        splitView={splitView}
                        onSplitViewChange={setSplitView}
                        secondaryTabId={secondaryTabId}
                        onSecondaryTabChange={setSecondaryTabId}
                        onRun={handleRun}
                        onStop={handleStop}
                        running={running}
                        onPreview={() => setPreviewOpen((v) => !v)}
                        previewOpen={previewOpen}
                        projectName={selectedProject?.name}
                        detectLabel={
                          selectedProject
                            ? `${detectInfo?.label || selectedProject.framework} · ${selectedProject.status}`
                            : null
                        }
                        busy={creating || aiBusy || loadingProject || running}
                      />
                    </Suspense>
                    <Suspense fallback={null}>
                      <LivePreview
                        files={selectedProject?.files}
                        open={previewOpen}
                        onClose={() => setPreviewOpen(false)}
                      />
                    </Suspense>
                  </div>
                </Panel>

                {bottomOpen && (
                  <>
                    <Separator className="ide-sep-v" />
                    <Panel id="bottom" defaultSize="25%" minSize="12%" maxSize="45%">
                      <Suspense fallback={null}>
                        <BottomPanel
                          open={bottomOpen}
                          onToggle={setBottomOpen}
                          activeTab={bottomTab}
                          onTabChange={setBottomTab}
                          logs={logs}
                          diffs={diffs}
                          problems={problems}
                          executions={executions}
                          onAcceptDiff={handleAcceptDiff}
                          onRejectDiff={handleRejectDiff}
                          onProblemClick={handleProblemClick}
                          projectId={selectedProject?.id}
                          runInfo={runState}
                        />
                      </Suspense>
                    </Panel>
                  </>
                )}

                {!bottomOpen && (
                  <div style={{ height: 28, flexShrink: 0 }}>
                    <Suspense fallback={null}>
                      <BottomPanel
                        open={false}
                        onToggle={setBottomOpen}
                        activeTab={bottomTab}
                        onTabChange={setBottomTab}
                        logs={logs}
                        diffs={diffs}
                        problems={problems}
                        executions={executions}
                        onAcceptDiff={handleAcceptDiff}
                        onRejectDiff={handleRejectDiff}
                        onProblemClick={handleProblemClick}
                        projectId={selectedProject?.id}
                        runInfo={runState}
                      />
                    </Suspense>
                  </div>
                )}
              </Group>
            </Panel>

            {rightOpen && (
              <>
                <Separator className="ide-sep-h ide-hide-sm" />
                <Panel
                  id="ai"
                  defaultSize={380}
                  minSize={300}
                  maxSize={520}
                  className="ide-hide-sm min-w-0"
                >
                  <div className="h-full flex flex-col min-h-0 bg-[#0f1419]">
                    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[#2a3542] shrink-0">
                      <button
                        type="button"
                        className={`text-[11px] px-2.5 py-1 rounded ${
                          rightTab === "intelligence"
                            ? "bg-[#3d9cf0]/20 text-[#d7e0ea]"
                            : "text-[#8b9aab]"
                        }`}
                        onClick={() => setRightTab("intelligence")}
                      >
                        Intelligence
                      </button>
                      <button
                        type="button"
                        className={`text-[11px] px-2.5 py-1 rounded ${
                          rightTab === "ai"
                            ? "bg-[#3d9cf0]/20 text-[#d7e0ea]"
                            : "text-[#8b9aab]"
                        }`}
                        onClick={() => setRightTab("ai")}
                      >
                        AI Runtime
                      </button>
                      <button
                        type="button"
                        className="ml-auto text-[#8b9aab] text-xs px-2"
                        onClick={() => setRightOpen(false)}
                        title="Collapse"
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex-1 min-h-0">
                      <Suspense fallback={null}>
                        {rightTab === "intelligence" ? (
                          <IntelligencePanel
                            projectId={selectedProject?.id}
                            onOpenFile={openFileByPath}
                          />
                        ) : (
                          <AiExecutionPanel
                            execution={selectedExecution}
                            executions={executions}
                            loading={creating || (loadingProject && !executions.length)}
                            onCancel={handleCancelAi}
                            onSelectExecution={setSelectedExecution}
                            onCollapse={() => setRightOpen(false)}
                          />
                        )}
                      </Suspense>
                    </div>
                  </div>
                </Panel>
              </>
            )}
          </Group>
        </div>

        {mobileExplorer && (
          <div className="md:hidden fixed inset-0 z-40 flex">
            <div className="absolute inset-0 bg-black/60" onClick={() => setMobileExplorer(false)} />
            <div className="relative w-[280px] max-w-[85vw] h-full ide-sidebar">
              <WorkspaceExplorer
                projects={projects}
                selectedProjectId={selectedProject?.id}
                search={search}
                onSearch={setSearch}
                onSelect={(id) => {
                  selectProject(id);
                  setMobileExplorer(false);
                }}
                onCreate={handleCreateProject}
                onRename={handleRenameProject}
                onDelete={handleDeleteProject}
                onToggleFavorite={handleToggleFavorite}
                onReorder={handleReorder}
                creating={creating}
              />
              {selectedProject && (
                <FileExplorer
                  files={selectedProject.files}
                  selectedFileId={activeTabId}
                  dirtyMap={dirtyMap}
                  onSelectFile={(f) => {
                    openFile(f);
                    setMobileExplorer(false);
                  }}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onRenameFile={handleRenameFile}
                  onDeleteFile={handleDeleteFile}
                  onUpload={handleUpload}
                  onMoveFile={handleMoveFile}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
