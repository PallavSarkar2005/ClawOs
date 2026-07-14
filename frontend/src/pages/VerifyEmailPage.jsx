import { useEffect, useState, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, CheckCircle2, XCircle, ArrowRight, Loader } from "lucide-react";

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const { verifyEmail } = useAuth();
  const token = searchParams.get("token");

  const [status, setStatus] = useState("loading"); // loading, success, error
  const [errorMessage, setErrorMessage] = useState("");
  const effectRan = useRef(false);

  useEffect(() => {
    // Avoid double trigger in React 18 StrictMode
    if (effectRan.current) return;
    effectRan.current = true;

    const performVerification = async () => {
      if (!token) {
        setStatus("error");
        setErrorMessage("Verification token is missing from the query path.");
        return;
      }

      try {
        await verifyEmail(token);
        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err?.response?.data?.message ||
            "The verification link has expired or is invalid.",
        );
      }
    };

    performVerification();
  }, [token, verifyEmail]);

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Background Glow Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#7CAADC]/10 rounded-full pointer-events-none blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F49CC4]/15 rounded-full pointer-events-none blur-3xl"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md glass rounded-3xl p-8 shadow-2xl relative z-10 border border-white/5"
      >
        <div className="text-center">
          <AnimatePresence mode="wait">
            {status === "loading" && (
              <motion.div
                key="loading-state"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="py-8 flex flex-col items-center gap-4"
              >
                <Loader className="text-[#F15B42] animate-spin" size={32} />
                <h2 className="text-xl font-bold text-white">Verifying credentials...</h2>
                <p className="text-xs text-slate-400">
                  Securing authorization signatures in the directory node
                </p>
              </motion.div>
            )}

            {status === "success" && (
              <motion.div
                key="success-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-4"
              >
                <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/10 items-center justify-center mb-6">
                  <CheckCircle2 size={36} className="text-emerald-400" />
                </div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight mb-3">
                  Email verified
                </h2>
                <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto mb-8">
                  Your email verification has been registered successfully. Your account is fully active.
                </p>
                <Link
                  to="/login"
                  className="w-full bg-[#F15B42] hover:bg-[#e04a31] text-white py-3.5 px-6 rounded-2xl font-bold transition-all duration-300 shadow-lg shadow-[#F15B42]/10 inline-flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  <span>Go to Dashboard</span>
                  <ArrowRight size={14} />
                </Link>
              </motion.div>
            )}

            {status === "error" && (
              <motion.div
                key="error-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-4"
              >
                <div className="inline-flex w-16 h-16 rounded-full bg-red-500/10 items-center justify-center mb-6">
                  <XCircle size={36} className="text-red-400" />
                </div>
                <h2 className="text-2xl font-extrabold text-white tracking-tight mb-3">
                  Verification failed
                </h2>
                <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto mb-8">
                  {errorMessage}
                </p>
                <Link
                  to="/login"
                  className="w-full bg-white/5 border border-white/10 hover:bg-white/10 text-white py-3.5 px-6 rounded-2xl font-bold transition-all inline-flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  <span>Return to Login</span>
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
