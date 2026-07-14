import { useState } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Folder,
  Plus,
  Star,
  Search,
  Trash2,
  Pencil,
  Clock,
  GripVertical,
  X,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
} from "lucide-react";
import { statusColor } from "./workspaceUtils";
import "./ide.css";

const FRAMEWORKS = [
  { id: "react", label: "React" },
  { id: "html", label: "HTML" },
  { id: "vanilla", label: "Vanilla JS" },
];

export default function WorkspaceExplorer({
  projects,
  selectedProjectId,
  search,
  onSearch,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onToggleFavorite,
  onReorder,
  creating,
  onCollapse,
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [framework, setFramework] = useState("react");
  const [description, setDescription] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [favOpen, setFavOpen] = useState(true);
  const [recentOpen, setRecentOpen] = useState(true);
  const [allOpen, setAllOpen] = useState(true);

  const filtered = projects.filter((p) =>
    !search
      ? true
      : p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const favorites = filtered.filter((p) => p.isFavorite);
  const recent = [...filtered]
    .filter((p) => p.lastOpenedAt)
    .sort((a, b) => new Date(b.lastOpenedAt) - new Date(a.lastOpenedAt))
    .slice(0, 5);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    await onCreate({ name: name.trim(), framework, description: description.trim() });
    setName("");
    setDescription("");
    setFramework("react");
    setShowCreate(false);
  };

  const commitRename = async (id) => {
    if (renameValue.trim()) await onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  const ProjectRow = ({ p }) => (
    <div
      onClick={() => onSelect(p.id)}
      className={`ide-tree-row ${selectedProjectId === p.id ? "is-active" : ""}`}
      style={{ paddingLeft: 8 }}
    >
      <GripVertical size={11} className="opacity-25 shrink-0 cursor-grab" />
      <div
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: statusColor(p.status) }}
      />
      {renamingId === p.id ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={() => commitRename(p.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(p.id);
            if (e.key === "Escape") setRenamingId(null);
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-black/40 rounded px-1.5 py-0.5 text-[12px] text-white outline-none"
        />
      ) : (
        <span className="flex-1 truncate font-medium">{p.name}</span>
      )}
      <div className="ide-tree-actions">
        <button
          className="ide-btn ide-btn--icon"
          style={{ width: 20, height: 20, opacity: p.isFavorite ? 1 : undefined }}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(p);
          }}
        >
          <Star size={11} className={p.isFavorite ? "text-amber-400" : ""} fill={p.isFavorite ? "currentColor" : "none"} />
        </button>
        <button
          className="ide-btn ide-btn--icon"
          style={{ width: 20, height: 20 }}
          onClick={(e) => {
            e.stopPropagation();
            setRenamingId(p.id);
            setRenameValue(p.name);
          }}
        >
          <Pencil size={10} />
        </button>
        <button
          className="ide-btn ide-btn--icon"
          style={{ width: 20, height: 20 }}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(`Delete project "${p.name}"?`)) onDelete(p.id);
          }}
        >
          <Trash2 size={10} />
        </button>
      </div>
    </div>
  );

  const Section = ({ title, open, setOpen, children, icon }) => (
    <div className="ide-section">
      <button className="ide-section__title" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        {icon}
        <span>{title}</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  return (
    <div
      className={`flex flex-col shrink-0 ${selectedProjectId ? "max-h-[38%]" : "flex-1"}`}
      style={{ boxShadow: "inset 0 -1px 0 rgba(255,255,255,0.04)" }}
    >
      <div className="ide-sidebar__head">
        <span className="ide-sidebar__label">Explorer</span>
        <div className="ide-sidebar__tools">
          <button className="ide-btn ide-btn--primary ide-btn--icon" onClick={() => setShowCreate(true)} title="New Project">
            <Plus size={14} />
          </button>
          {onCollapse && (
            <button className="ide-btn ide-btn--icon" onClick={onCollapse} title="Collapse">
              <PanelLeftClose size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="ide-search">
        <Search size={12} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search projects & files…"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-1 pb-2 min-h-0">
        {favorites.length > 0 && (
          <Section title="Favorites" open={favOpen} setOpen={setFavOpen} icon={<Star size={10} className="text-amber-400" />}>
            {favorites.map((p) => (
              <ProjectRow key={`fav-${p.id}`} p={p} />
            ))}
          </Section>
        )}
        {recent.length > 0 && (
          <Section title="Recent" open={recentOpen} setOpen={setRecentOpen} icon={<Clock size={10} className="text-[#7CAADC]" />}>
            {recent.map((p) => (
              <ProjectRow key={`recent-${p.id}`} p={p} />
            ))}
          </Section>
        )}
        <Section title="Projects" open={allOpen} setOpen={setAllOpen} icon={<Folder size={10} />}>
          {filtered.length === 0 ? (
            <div className="text-[11px] text-[var(--ide-dim)] px-2 py-4 text-center">
              No projects yet
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={filtered.map((p) => p.id)}
              onReorder={(ids) => onReorder(ids)}
            >
              {filtered.map((p) => (
                <Reorder.Item key={p.id} value={p.id} className="list-none">
                  <ProjectRow p={p} />
                </Reorder.Item>
              ))}
            </Reorder.Group>
          )}
        </Section>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => !creating && setShowCreate(false)}
          >
            <motion.form
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleCreate}
              className="w-full max-w-md rounded-xl p-5 shadow-2xl"
              style={{ background: "#151d2e", boxShadow: "0 24px 64px rgba(0,0,0,0.55)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">New Project</h3>
                <button type="button" onClick={() => setShowCreate(false)} className="ide-btn ide-btn--icon">
                  <X size={16} />
                </button>
              </div>
              <label className="block text-[10px] font-bold uppercase text-[var(--ide-muted)] mb-1">Name</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full mb-3 h-9 px-3 rounded-lg bg-black/35 text-sm text-white outline-none"
                placeholder="My App"
                autoFocus
              />
              <label className="block text-[10px] font-bold uppercase text-[var(--ide-muted)] mb-1">Framework</label>
              <div className="flex gap-2 mb-3">
                {FRAMEWORKS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFramework(f.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold transition ${
                      framework === f.id ? "ide-btn--ghost-active" : "bg-black/25 text-slate-400"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <label className="block text-[10px] font-bold uppercase text-[var(--ide-muted)] mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full mb-4 px-3 py-2 rounded-lg bg-black/35 text-sm text-white outline-none resize-none"
                placeholder="What should this project do?"
              />
              <button
                type="submit"
                disabled={creating || !name.trim()}
                className="ide-btn ide-btn--primary w-full"
                style={{ height: 36 }}
              >
                {creating ? "Generating…" : "Create & Generate"}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
