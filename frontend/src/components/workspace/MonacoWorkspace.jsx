import { lazy, Suspense, useEffect, useRef, useCallback, useState } from "react";
import {
  X,
  Circle,
  Sparkles,
  Wand2,
  Bug,
  MessageSquare,
  RefreshCw,
  Columns2,
  Map,
  AlignLeft,
  Search,
  ChevronRight,
  Play,
  Square,
  Eye,
  Save,
  Loader2,
} from "lucide-react";
import { getLanguageFromFilename } from "./workspaceUtils";
import "./ide.css";

const Editor = lazy(() => import("@monaco-editor/react"));

const AI_ACTIONS = [
  { id: "improve", label: "Improve", icon: Sparkles },
  { id: "optimize", label: "Optimize", icon: Wand2 },
  { id: "refactor", label: "Refactor", icon: RefreshCw },
  { id: "fix", label: "Fix", icon: Bug },
  { id: "explain", label: "Explain", icon: MessageSquare },
];

function fileIconColor(name) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (["js", "jsx", "mjs"].includes(ext)) return "#f7df1e";
  if (["ts", "tsx"].includes(ext)) return "#3178c6";
  if (ext === "json") return "#cbcb41";
  if (["css", "scss"].includes(ext)) return "#563d7c";
  if (["html", "htm"].includes(ext)) return "#e34c26";
  if (ext === "md") return "#519aba";
  if (ext === "py") return "#3572a5";
  return "#7CAADC";
}

export default function MonacoWorkspace({
  tabs,
  activeTabId,
  dirtyMap,
  onSelectTab,
  onCloseTab,
  onChange,
  onSave,
  onAiAction,
  aiBusy,
  selection,
  onSelectionChange,
  problems = [],
  splitView,
  onSplitViewChange,
  secondaryTabId,
  onSecondaryTabChange,
  onRun,
  onStop,
  running,
  onPreview,
  previewOpen,
  projectName,
  detectLabel,
  busy,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const editorsById = useRef({});
  const [minimap, setMinimap] = useState(true);
  const active = tabs.find((t) => t.id === activeTabId);
  const secondary = tabs.find((t) => t.id === secondaryTabId);

  const applyMarkers = useCallback(
    (monaco, model, fileId) => {
      if (!monaco || !model) return;
      const fileProblems = problems.filter((p) => p.fileId === fileId);
      monaco.editor.setModelMarkers(
        model,
        "clawos",
        fileProblems.map((p) => ({
          startLineNumber: p.line || 1,
          startColumn: 1,
          endLineNumber: p.line || 1,
          endColumn: 200,
          message: p.message,
          severity:
            p.severity === "error"
              ? monaco.MarkerSeverity.Error
              : monaco.MarkerSeverity.Warning,
        }))
      );
    },
    [problems]
  );

  const handleMount = (editor, monaco, fileId) => {
    editorsById.current[fileId] = editor;
    if (fileId === activeTabId) {
      editorRef.current = editor;
      monacoRef.current = monaco;
    }
    editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (!model || !sel) return;
      const text = model.getValueInRange(sel);
      onSelectionChange?.(text && !sel.isEmpty() ? text : "");
    });
    applyMarkers(monaco, editor.getModel(), fileId);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      onSave?.(fileId);
    });
  };

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    for (const [fileId, ed] of Object.entries(editorsById.current)) {
      applyMarkers(monaco, ed.getModel(), fileId);
    }
  }, [problems, applyMarkers]);

  const formatDoc = () => editorRef.current?.getAction("editor.action.formatDocument")?.run();
  const openFind = () => editorRef.current?.getAction("actions.find")?.run();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (active) onSave(active.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onSave]);

  const crumbs = (active?.path || active?.name || "")
    .replace(/^\//, "")
    .split("/")
    .filter(Boolean);

  const renderEditor = (tab, withMinimap) => (
    <div className="ide-editor-surface" style={{ flex: 1 }}>
      {tab ? (
        <Suspense
          fallback={
            <div className="ide-empty">
              <Loader2 className="animate-spin text-[#F15B42]" size={20} />
            </div>
          }
        >
          <Editor
            key={tab.id}
            height="100%"
            theme="vs-dark"
            path={tab.path || tab.name}
            language={getLanguageFromFilename(tab.name)}
            value={tab.content ?? ""}
            onChange={(val) => onChange(tab.id, val ?? "")}
            onMount={(editor, monaco) => handleMount(editor, monaco, tab.id)}
            options={{
              fontSize: 13,
              fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
              fontLigatures: true,
              lineHeight: 20,
              minimap: { enabled: withMinimap, scale: 0.7, renderCharacters: false },
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 8, bottom: 8 },
              renderLineHighlight: "all",
              cursorBlinking: "smooth",
              smoothScrolling: true,
              bracketPairColorization: { enabled: true },
              guides: { indentation: true, bracketPairs: true },
              scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
            }}
          />
        </Suspense>
      ) : (
        <div className="ide-empty">
          <p>No file in this pane</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0">
      {/* Unified title + actions */}
      <div className="ide-titlebar">
        <span className="ide-titlebar__brand">{projectName || "Workspace"}</span>
        {detectLabel && <span className="ide-titlebar__meta">{detectLabel}</span>}
        {busy && <Loader2 size={12} className="text-[#F15B42] animate-spin" />}
        <div className="ide-toolbar__spacer" />
        {active && dirtyMap[active.id] && (
          <button className="ide-btn ide-btn--primary" onClick={() => onSave(active.id)}>
            <Save size={12} /> Save
          </button>
        )}
        {!running ? (
          <button className="ide-btn ide-btn--success" onClick={onRun} disabled={!projectName}>
            <Play size={12} /> Run
          </button>
        ) : (
          <button className="ide-btn ide-btn--danger" onClick={onStop}>
            <Square size={12} /> Stop
          </button>
        )}
        <button
          className={`ide-btn ${previewOpen ? "ide-btn--ghost-active" : ""}`}
          onClick={onPreview}
          disabled={!projectName}
        >
          <Eye size={12} /> Preview
        </button>
      </div>

      {/* Tabs */}
      <div className="ide-tabs">
        {tabs.length === 0 && (
          <div className="px-3 text-[11px] text-[var(--ide-dim)] flex items-center">
            No open editors
          </div>
        )}
        {tabs.map((tab) => {
          const dirty = dirtyMap[tab.id];
          const isActive = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              className={`ide-tab ${isActive ? "is-active" : ""}`}
              onClick={() => onSelectTab(tab.id)}
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ background: fileIconColor(tab.name) }}
              />
              {dirty ? (
                <Circle size={7} className="text-[#F15B42] fill-[#F15B42] shrink-0" />
              ) : null}
              <span className="ide-tab__name">{tab.name}</span>
              <span
                className="ide-tab__close"
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }
                }}
              >
                <X size={11} />
              </span>
            </button>
          );
        })}
      </div>

      {active && (
        <div className="ide-breadcrumb">
          {crumbs.map((p, i) => (
            <span key={`${p}-${i}`} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={10} className="text-[var(--ide-dim)]" />}
              <span className={i === crumbs.length - 1 ? "is-file" : ""}>{p}</span>
            </span>
          ))}
        </div>
      )}

      {active && (
        <div className="ide-toolbar">
          {AI_ACTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className="ide-btn"
              disabled={aiBusy}
              onClick={() => onAiAction(id, selection)}
              title={label}
            >
              <Icon size={12} className="text-[#F15B42]" />
              {label}
            </button>
          ))}
          <div className="ide-toolbar__divider" />
          <button className="ide-btn ide-btn--icon" onClick={openFind} title="Find">
            <Search size={13} />
          </button>
          <button className="ide-btn ide-btn--icon" onClick={formatDoc} title="Format">
            <AlignLeft size={13} />
          </button>
          <button
            className={`ide-btn ide-btn--icon ${minimap ? "ide-btn--ghost-active" : ""}`}
            onClick={() => setMinimap((v) => !v)}
            title="Minimap"
          >
            <Map size={13} />
          </button>
          <button
            className={`ide-btn ide-btn--icon ${splitView ? "ide-btn--ghost-active" : ""}`}
            onClick={() => {
              const next = !splitView;
              onSplitViewChange?.(next);
              if (next && !secondaryTabId && tabs[0]) {
                onSecondaryTabChange?.(
                  tabs.find((t) => t.id !== activeTabId)?.id || tabs[0].id
                );
              }
            }}
            title="Split"
          >
            <Columns2 size={13} />
          </button>
          <div className="ide-toolbar__spacer" />
          <span className="text-[10px] text-[var(--ide-dim)] pr-1">
            {selection ? `${selection.length} sel` : "Ctrl+S"}
          </span>
        </div>
      )}

      {!tabs.length ? (
        <div className="ide-empty">
          <div className="w-10 h-10 rounded-xl bg-[#F15B42]/10 flex items-center justify-center mx-auto">
            <Sparkles className="text-[#F15B42]" size={18} />
          </div>
          <h3>Open a file to start editing</h3>
          <p>Select a file from the explorer, or create a project to generate a scaffold.</p>
        </div>
      ) : (
        <div className={`flex-1 min-h-0 flex ${splitView ? "flex-row" : "flex-col"}`}>
          {renderEditor(active, minimap)}
          {splitView && (
            <>
              <div className="w-px bg-white/[0.04] shrink-0" />
              <div className="flex-1 min-w-0 flex flex-col min-h-0">
                <div className="ide-tabs" style={{ height: 28 }}>
                  {tabs.map((t) => (
                    <button
                      key={`sec-${t.id}`}
                      className={`ide-tab ${secondaryTabId === t.id ? "is-active" : ""}`}
                      style={{ height: 28, fontSize: 11 }}
                      onClick={() => onSecondaryTabChange?.(t.id)}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                {renderEditor(secondary, false)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
