import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Sparkles, ArrowLeft, Send, CheckCircle2, X } from "lucide-react";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      await forgotPassword(email);
      setSuccess(true);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to dispatch recovery link.");
    } finally {
      setLoading(false);
    }
  };

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
        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
              key="request-form"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] items-center justify-center shadow-lg shadow-[#F15B42]/20 mb-4">
                  <Sparkles size={24} className="text-white" />
                </div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">
                  Recover access
                </h1>
                <p className="text-slate-400 mt-2 text-sm">
                  We will transmit a secure signature link to restore your node
                </p>
              </div>

              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-2xl text-xs flex items-center gap-3">
                  <X size={16} className="text-red-400 shrink-0" />
                  <span className="font-semibold">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                      <Mail size={16} />
                    </span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="developer@clawos.dev"
                      className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-white/5 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-xs transition-all placeholder-slate-600"
                      required
                    />
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={loading}
                  className="w-full bg-[#F15B42] hover:bg-[#e04a31] text-white py-3.5 rounded-2xl font-bold transition-all duration-300 shadow-lg shadow-[#F15B42]/10 disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  {loading ? (
                    <span>Transmitting signature...</span>
                  ) : (
                    <>
                      <span>Transmit Recovery Link</span>
                      <Send size={12} />
                    </>
                  )}
                </motion.button>
              </form>
            </motion.div>
          ) : (
            <motion.div
              key="success-card"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="text-center py-6"
            >
              <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/10 items-center justify-center mb-6">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight mb-3">
                Link dispatched
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto mb-8">
                If the email <span className="text-white font-semibold">{email}</span> exists in our directory nodes, a recovery instruction payload has been dispatched. Check your inbox.
              </p>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-6">
                Note: Reset link printed to backend server console.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-8 pt-6 border-t border-white/5 flex justify-center">
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider"
          >
            <ArrowLeft size={14} />
            <span>Return to Login</span>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
