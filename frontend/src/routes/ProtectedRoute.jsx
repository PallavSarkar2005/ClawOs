import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

// Spinner component used while restoring session
function AuthLoadingScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: "#0F172A" }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] flex items-center justify-center shadow-lg shadow-[#F15B42]/20"
      >
        <Sparkles size={22} className="text-white" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xs text-slate-500 font-bold tracking-wider"
      >
        INITIALIZING SECURE CONTEXT...
      </motion.p>
    </div>
  );
}

// ProtectedRoute: Only authenticated users
export function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

// PublicRoute: Only unauthenticated users (login, signup, recover)
export function PublicRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  return !isAuthenticated ? children : <Navigate to="/dashboard" replace />;
}

export default ProtectedRoute;
