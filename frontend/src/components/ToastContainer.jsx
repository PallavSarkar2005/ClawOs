import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, AlertTriangle, XCircle, Info, X } from "lucide-react";

export default function ToastContainer() {
  const { toasts, removeToast } = useAuth();

  const getIcon = (type) => {
    switch (type) {
      case "success":
        return <CheckCircle className="text-emerald-400" size={18} />;
      case "error":
        return <XCircle className="text-red-400" size={18} />;
      case "warning":
        return <AlertTriangle className="text-amber-400" size={18} />;
      default:
        return <Info className="text-sky-400" size={18} />;
    }
  };

  const getBorderColor = (type) => {
    switch (type) {
      case "success":
        return "border-emerald-500/20 shadow-emerald-950/20";
      case "error":
        return "border-red-500/20 shadow-red-950/20";
      case "warning":
        return "border-amber-500/20 shadow-amber-950/20";
      default:
        return "border-sky-500/20 shadow-sky-950/20";
    }
  };

  return (
    <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-full max-w-sm pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.2 } }}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-2xl border bg-slate-900/80 backdrop-blur-md shadow-xl ${getBorderColor(
              toast.type,
            )}`}
          >
            <div className="shrink-0 mt-0.5">{getIcon(toast.type)}</div>
            <div className="flex-1 text-xs font-medium text-slate-100 leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="shrink-0 text-slate-400 hover:text-white transition-colors"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
