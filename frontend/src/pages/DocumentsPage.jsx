import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Sidebar from "../components/Sidebar";
import {
  getDocuments,
  uploadDocument,
  deleteDocument,
} from "../api/documentApi";
import {
  FolderOpen,
  UploadCloud,
  FileText,
  Trash2,
  CheckCircle,
  AlertCircle,
  Eye,
  FileIcon,
  Search,
  Database
} from "lucide-react";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const data = await getDocuments();
      setDocuments(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setUploading(true);
      await uploadDocument(file);
      setFile(null);
      await loadDocuments();
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteDocument(id);
      await loadDocuments();
      if (selectedDoc?.id === id) {
        setSelectedDoc(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const filteredDocs = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden font-sans relative">
      {/* Background ambient blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] bg-[#7CAADC]/10 rounded-full pointer-events-none blur-3xl z-0"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-[#F49CC4]/15 rounded-full pointer-events-none blur-3xl z-0"></div>

      <Sidebar />

      <div className="flex-1 p-6 md:p-8 overflow-y-auto relative z-10 space-y-8">
        {/* Header Block */}
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <FolderOpen className="text-[#F49CC4]" size={28} />
            <span>Context Ingestion</span>
          </h1>
          <p className="text-slate-400 text-sm mt-1.5 font-medium">
            Upload PDF, DOCX, or TXT documents to index text segments into the agent vector store.
          </p>
        </div>

        {/* Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* File Dropper Card */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`glass p-6 rounded-3xl border flex flex-col items-center justify-center text-center transition-all duration-300 min-h-[260px] ${
              dragOver ? "border-[#F15B42] bg-[#F15B42]/5" : "border-white/5"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all ${
              file ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-[#F15B42]/10 text-[#F15B42] border border-[#F15B42]/20"
            }`}>
              <UploadCloud size={24} className={uploading ? "animate-bounce" : ""} />
            </div>

            <h3 className="text-xs font-bold text-white mb-1">
              {file ? file.name : "Drag & drop your context file"}
            </h3>
            <p className="text-[10px] text-slate-500 max-w-xs mb-6 font-semibold">
              Supports PDF, Word (DOCX), or plain TXT text files up to 10MB.
            </p>

            <div className="flex items-center gap-3 w-full">
              <label className="flex-1 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 text-[10px] font-bold uppercase tracking-wider py-2.5 rounded-xl cursor-pointer transition text-center select-none">
                Browse Files
                <input
                  type="file"
                  onChange={(e) => setFile(e.target.files[0])}
                  className="hidden"
                />
              </label>

              <button
                onClick={handleUpload}
                disabled={uploading || !file}
                className="flex-1 bg-[#F15B42] hover:bg-[#e04a31] disabled:opacity-30 text-white text-[10px] font-bold uppercase tracking-wider py-2.5 rounded-xl transition shadow-lg shadow-[#F15B42]/10"
              >
                {uploading ? "Embedding..." : "Upload Context"}
              </button>
            </div>
          </motion.div>

          {/* Ingested Documents List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3 bg-slate-900 border border-white/5 px-4 py-2.5 rounded-2xl">
              <Search className="text-slate-500 shrink-0" size={16} />
              <input
                type="text"
                placeholder="Search ingested index..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="flex-1 bg-transparent text-white text-xs outline-none placeholder-slate-600 font-bold"
              />
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 glass rounded-2xl animate-pulse"></div>
                ))}
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="glass rounded-3xl p-12 text-center border border-white/5 flex flex-col items-center justify-center">
                <FileIcon size={32} className="text-slate-700 mb-3 animate-pulse" />
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">No files indexed</h3>
                <p className="text-[10px] text-slate-500 max-w-xs mt-1 leading-normal">
                  Ingest documentation context files to enable vector search matching in Chat modes.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredDocs.map((doc) => (
                  <motion.div
                    key={doc.id}
                    layoutId={`doc-card-${doc.id}`}
                    className="glass p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:border-white/10 transition-all duration-300 shadow-xl shadow-black/5"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="p-2.5 bg-slate-950/40 border border-white/5 text-slate-400 rounded-xl">
                        <FileText size={18} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-200 truncate">{doc.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5 text-[9px] text-slate-500 font-semibold uppercase tracking-wider">
                          <CheckCircle size={10} className="text-emerald-400" />
                          <span>Indexed</span>
                          <span>•</span>
                          <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedDoc(doc)}
                        className="p-2 text-slate-500 hover:text-white hover:bg-white/5 rounded-xl transition"
                        title="Preview contents"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition"
                        title="Delete index file"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notion Sidebar-style Document Content Previewer */}
      <AnimatePresence>
        {selectedDoc && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs"
            onClick={() => setSelectedDoc(null)}
          >
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="w-full max-w-xl h-full bg-[#0F172A] border-l border-white/5 p-6 flex flex-col justify-between overflow-hidden shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-6 flex-1 flex flex-col min-h-0">
                <div className="flex justify-between items-center border-b border-white/5 pb-4">
                  <div className="flex items-center gap-2.5">
                    <FileText size={18} className="text-[#F15B42]" />
                    <h3 className="text-sm font-bold text-white truncate max-w-[320px]">{selectedDoc.name}</h3>
                  </div>
                  <button
                    onClick={() => setSelectedDoc(null)}
                    className="text-xs font-bold text-[#F15B42] hover:underline"
                  >
                    Close Preview
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto bg-slate-950/45 p-4 rounded-2xl border border-white/5 font-mono text-[10px] text-slate-300 leading-relaxed">
                  {selectedDoc.content || "Empty document content"}
                </div>
              </div>

              <div className="pt-4 border-t border-white/5 flex gap-4 text-[10px] text-slate-500 uppercase font-bold shrink-0">
                <span>Vector Ingestion: PG-VECTOR</span>
                <span>•</span>
                <span>Type: text/plain</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
