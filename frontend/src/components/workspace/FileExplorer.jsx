import { useState, useRef, useMemo } from "react";
import {
  FileCode,
  FileJson,
  FileType,
  FileText,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
  Pencil,
  Upload,
  ChevronRight,
  ChevronDown,
  Braces,
  File,
  Circle,
} from "lucide-react";
import { buildFileTree } from "./workspaceUtils";
import "./ide.css";

function fileIcon(name, isFolder, open) {
  if (isFolder)
    return open ? (
      <FolderOpen size={14} className="text-amber-400/90" />
    ) : (
      <Folder size={14} className="text-amber-400/70" />
    );
  const ext = name.split(".").pop()?.toLowerCase();
  if (["js", "jsx", "ts", "tsx", "mjs", "cjs"].includes(ext))
    return <FileCode size={14} className="text-[#7CAADC]" />;
  if (ext === "json") return <FileJson size={14} className="text-amber-300" />;
  if (["html", "htm"].includes(ext)) return <Braces size={14} className="text-orange-400" />;
  if (["css", "scss", "less"].includes(ext)) return <FileType size={14} className="text-sky-400" />;
  if (["md", "mdx"].includes(ext)) return <FileText size={14} className="text-slate-400" />;
  if (ext === "py") return <FileCode size={14} className="text-yellow-300" />;
  return <File size={14} className="text-slate-500" />;
}

function filterTree(nodes, query) {
  if (!query) return nodes;
  const q = query.toLowerCase();
  const walk = (list) =>
    list
      .map((n) => {
        if (n.isFolder) {
          const children = walk(n.children || []);
          if (children.length || n.name.toLowerCase().includes(q)) {
            return { ...n, children };
          }
          return null;
        }
        return n.name.toLowerCase().includes(q) || n.path?.toLowerCase().includes(q)
          ? n
          : null;
      })
      .filter(Boolean);
  return walk(nodes);
}

function TreeNode({
  node,
  depth,
  selectedFileId,
  collapsed,
  onToggle,
  onSelect,
  onRename,
  onDelete,
  setContextMenu,
  dirtyMap,
  onMove,
  dragId,
  setDragId,
}) {
  const isOpen = !collapsed[node.id];
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.name);
  const dirty = dirtyMap?.[node.id];

  const commitRename = async () => {
    if (renameVal.trim() && renameVal !== node.name) {
      await onRename(node.id, renameVal.trim());
    }
    setRenaming(false);
  };

  return (
    <div>
      <div
        draggable
        onDragStart={(e) => {
          setDragId(node.id);
          e.dataTransfer.setData("text/plain", node.id);
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(e) => {
          if (node.isFolder) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = e.dataTransfer.getData("text/plain") || dragId;
          if (!id || id === node.id || !node.isFolder) return;
          await onMove?.(id, node.id);
          setDragId(null);
        }}
        className={`ide-tree-row ${selectedFileId === node.id && !node.isFolder ? "is-active" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 }}
        onClick={() => {
          if (node.isFolder) onToggle(node.id);
          else onSelect(node);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setContextMenu({ x: e.clientX, y: e.clientY, node });
        }}
        onDoubleClick={() => {
          if (!node.isFolder) return;
          setRenaming(true);
          setRenameVal(node.name);
        }}
      >
        {node.isFolder ? (
          <span className="w-3 shrink-0 text-slate-600">
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {fileIcon(node.name, node.isFolder, isOpen)}
        {renaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-black/40 rounded px-1 text-[12px] text-white outline-none"
          />
        ) : (
          <span className="flex-1 truncate font-medium flex items-center gap-1.5">
            {node.name}
            {dirty && <Circle size={5} className="text-[#F15B42] fill-[#F15B42] shrink-0" />}
          </span>
        )}
        <div className="ide-tree-actions">
          <button
            className="ide-btn ide-btn--icon"
            style={{ width: 20, height: 20 }}
            onClick={(e) => {
              e.stopPropagation();
              setRenaming(true);
              setRenameVal(node.name);
            }}
          >
            <Pencil size={10} />
          </button>
          <button
            className="ide-btn ide-btn--icon"
            style={{ width: 20, height: 20 }}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`Delete ${node.name}?`)) onDelete(node.id);
            }}
          >
            <Trash2 size={10} />
          </button>
        </div>
      </div>

      {node.isFolder &&
        isOpen &&
        node.children?.map((child) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedFileId={selectedFileId}
            collapsed={collapsed}
            onToggle={onToggle}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            setContextMenu={setContextMenu}
            dirtyMap={dirtyMap}
            onMove={onMove}
            dragId={dragId}
            setDragId={setDragId}
          />
        ))}
    </div>
  );
}

export default function FileExplorer({
  files,
  selectedFileId,
  onSelectFile,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
  onUpload,
  onMoveFile,
  dirtyMap,
}) {
  const [collapsed, setCollapsed] = useState({});
  const [showNew, setShowNew] = useState(null);
  const [newName, setNewName] = useState("");
  const [parentId, setParentId] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [dragId, setDragId] = useState(null);
  const fileInputRef = useRef(null);

  const tree = useMemo(() => buildFileTree(files || []), [files]);

  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const submitNew = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    if (showNew === "folder") await onCreateFolder(newName.trim(), parentId);
    else await onCreateFile(newName.trim(), parentId);
    setNewName("");
    setShowNew(null);
    setParentId(null);
  };

  const handleUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    if (!list.length) return;
    const payloads = await Promise.all(
      list.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                name: file.name,
                path: `/${file.name}`,
                content: String(reader.result || ""),
              });
            reader.readAsText(file);
          })
      )
    );
    await onUpload(payloads);
    e.target.value = "";
  };

  return (
    <div
      className="flex flex-col min-h-0 flex-1"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        const id = e.dataTransfer.getData("text/plain") || dragId;
        if (id) await onMoveFile?.(id, null);
        setDragId(null);
      }}
    >
      <div className="ide-sidebar__head">
        <span className="ide-sidebar__label">Files</span>
        <div className="ide-sidebar__tools">
          <button
            className="ide-btn ide-btn--icon"
            title="New file"
            onClick={() => {
              setShowNew("file");
              setParentId(null);
            }}
          >
            <Plus size={13} />
          </button>
          <button
            className="ide-btn ide-btn--icon"
            title="New folder"
            onClick={() => {
              setShowNew("folder");
              setParentId(null);
            }}
          >
            <Folder size={13} />
          </button>
          <button
            className="ide-btn ide-btn--icon"
            title="Upload"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={13} />
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {showNew && (
        <form onSubmit={submitNew} className="px-2 pb-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onBlur={() => {
              if (!newName.trim()) setShowNew(null);
            }}
            placeholder={showNew === "folder" ? "folder-name" : "file.js"}
            className="w-full h-7 px-2 rounded-md bg-black/35 text-[12px] text-white outline-none"
          />
        </form>
      )}

      <div className="ide-tree">
        {tree.length === 0 ? (
          <div className="text-[11px] text-[var(--ide-dim)] text-center py-8 px-3">
            Empty project
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedFileId={selectedFileId}
              collapsed={collapsed}
              onToggle={toggle}
              onSelect={onSelectFile}
              onRename={onRenameFile}
              onDelete={onDeleteFile}
              setContextMenu={setContextMenu}
              dirtyMap={dirtyMap}
              onMove={onMoveFile}
              dragId={dragId}
              setDragId={setDragId}
            />
          ))
        )}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div className="ide-ctx" style={{ top: contextMenu.y, left: contextMenu.x }}>
            {contextMenu.node.isFolder && (
              <>
                <button
                  onClick={() => {
                    setParentId(contextMenu.node.id);
                    setShowNew("file");
                    setContextMenu(null);
                  }}
                >
                  New File
                </button>
                <button
                  onClick={() => {
                    setParentId(contextMenu.node.id);
                    setShowNew("folder");
                    setContextMenu(null);
                  }}
                >
                  New Folder
                </button>
              </>
            )}
            <button
              onClick={() => {
                const node = contextMenu.node;
                setContextMenu(null);
                const name = prompt("Rename to:", node.name);
                if (name?.trim() && name.trim() !== node.name) {
                  onRenameFile(node.id, name.trim());
                }
              }}
            >
              Rename
            </button>
            <button
              className="is-danger"
              onClick={() => {
                onDeleteFile(contextMenu.node.id);
                setContextMenu(null);
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { filterTree };
