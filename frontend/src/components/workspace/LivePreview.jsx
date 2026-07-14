import { useMemo, useState, useEffect, useRef } from "react";
import { RefreshCw, ExternalLink, Eye, AlertTriangle, X } from "lucide-react";
import { buildPreviewHtml } from "./workspaceUtils";
import "./ide.css";

export default function LivePreview({ files, open, onClose }) {
  const [nonce, setNonce] = useState(0);
  const [errors, setErrors] = useState([]);
  const iframeRef = useRef(null);

  const html = useMemo(() => buildPreviewHtml(files || []), [files, nonce]);

  const fingerprint = useMemo(
    () =>
      (files || [])
        .filter((f) => !f.isFolder)
        .map((f) => `${f.id}:${f.updatedAt || ""}:${(f.content || "").length}`)
        .join("|"),
    [files]
  );

  useEffect(() => {
    setNonce((n) => n + 1);
    setErrors([]);
  }, [fingerprint]);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.source === "clawos-preview-error") {
        setErrors((prev) => [
          ...prev.slice(-19),
          { message: e.data.message, time: Date.now() },
        ]);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  const injectErrorBridge = (doc) => {
    const bridge = `<script>
window.onerror=function(msg){parent.postMessage({source:'clawos-preview-error',message:String(msg)},'*')};
window.addEventListener('unhandledrejection',function(e){parent.postMessage({source:'clawos-preview-error',message:String(e.reason)},'*')});
</script>`;
    if (doc.includes("</head>")) return doc.replace("</head>", `${bridge}</head>`);
    return bridge + doc;
  };

  const srcDoc = useMemo(() => injectErrorBridge(html), [html]);

  if (!open) return null;

  const openExternal = () => {
    const blob = new Blob([srcDoc], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="ide-preview-layer">
      <div className="ide-titlebar">
        <Eye size={13} className="text-[#7CAADC]" />
        <span className="ide-titlebar__brand">Live Preview</span>
        <span className="ide-titlebar__meta">auto-refresh</span>
        <div className="ide-toolbar__spacer" />
        <button
          className="ide-btn"
          onClick={() => {
            setNonce((n) => n + 1);
            setErrors([]);
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
        <button className="ide-btn" onClick={openExternal}>
          <ExternalLink size={12} /> Browser
        </button>
        <button className="ide-btn ide-btn--icon" onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 relative min-h-0">
        <iframe
          ref={iframeRef}
          title="Live Preview"
          sandbox="allow-scripts allow-same-origin"
          srcDoc={srcDoc}
          className="absolute inset-0 w-full h-full bg-white border-0"
        />
        {errors.length > 0 && (
          <div className="absolute bottom-0 left-0 right-0 max-h-28 overflow-y-auto bg-red-950/95 p-2 text-[11px] font-mono">
            <div className="flex items-center gap-1 text-red-300 font-bold mb-1">
              <AlertTriangle size={12} /> Runtime errors
              <button className="ml-auto ide-btn" onClick={() => setErrors([])}>
                Dismiss
              </button>
            </div>
            {errors.map((err, i) => (
              <div key={i} className="text-red-200/90 mb-1 break-all">
                {err.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
