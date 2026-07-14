import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Sparkles, ArrowRight, Eye, EyeOff, X } from "lucide-react";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      await login(formData.email, formData.password, formData.rememberMe);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.message || "Authentication failed. Check credentials.");
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
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] items-center justify-center shadow-lg shadow-[#F15B42]/20 mb-4">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Welcome to Claw<span className="text-[#F15B42]">OS</span>
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Launch your secure autonomous sandboxed environment
          </p>
        </div>

        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-6 bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-2xl text-xs flex items-center gap-3"
            >
              <X size={16} className="text-red-400 shrink-0" />
              <span className="font-semibold">{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleLogin} className="space-y-5">
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
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="developer@clawos.dev"
                className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-white/5 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-xs transition-all placeholder-slate-600"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-[10px] font-bold text-[#F15B42] hover:text-[#e04a31] uppercase tracking-wider transition-colors"
              >
                Forgot Password?
              </Link>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                <Lock size={16} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3 bg-slate-950/40 border border-white/5 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-xs transition-all placeholder-slate-600"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                name="rememberMe"
                id="rememberMe"
                checked={formData.rememberMe}
                onChange={handleChange}
                className="accent-[#F15B42] h-4 w-4 bg-slate-900 border-white/10 rounded cursor-pointer"
              />
              <label htmlFor="rememberMe" className="text-[11px] text-slate-400 cursor-pointer select-none">
                Remember this device
              </label>
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
              <span>Decrypting profile node...</span>
            ) : (
              <>
                <span>Unlock Operating Node</span>
                <ArrowRight size={14} />
              </>
            )}
          </motion.button>
        </form>

        <p className="text-center mt-6 text-xs text-slate-400">
          Need a profile?{" "}
          <Link to="/register" className="text-[#F15B42] hover:text-[#e04a31] font-bold transition-colors">
            Register here
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
