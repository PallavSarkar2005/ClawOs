import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import { Mail, Lock, User, Sparkles, ArrowRight, ExternalLink } from "lucide-react";
import api from "../services/api";

function SignupPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");

      await api.post("/auth/signup", formData);
      await login(formData.email, formData.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1B2748] flex items-center justify-center px-4 relative overflow-hidden font-sans">
      {/* Background Glow Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blob-blue rounded-full pointer-events-none blur-3xl opacity-60"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blob-pink rounded-full pointer-events-none blur-3xl opacity-60"></div>

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md glass-panel rounded-3xl p-8 shadow-2xl relative z-10 border border-white/10"
      >
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] items-center justify-center shadow-lg shadow-[#F15B42]/20 mb-4 animate-float">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-wide">Join Claw<span className="text-[#F15B42]">OS</span></h1>
          <p className="text-slate-400 mt-2 text-sm font-medium">Create your credentials to launch the agent node</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 bg-red-500/10 border border-red-500/20 text-red-300 p-3.5 rounded-2xl text-xs flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0"></span>
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div>
            <label className="block mb-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                <User size={18} />
              </span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ada Lovelace"
                className="w-full pl-11 pr-4 py-3 bg-[#1B2748]/50 border border-white/10 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-sm transition-all placeholder-slate-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block mb-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Email Address
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                <Mail size={18} />
              </span>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="ada@lovelace.org"
                className="w-full pl-11 pr-4 py-3 bg-[#1B2748]/50 border border-white/10 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-sm transition-all placeholder-slate-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block mb-2 text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-400">
                <Lock size={18} />
              </span>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3 bg-[#1B2748]/50 border border-white/10 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-sm transition-all placeholder-slate-500"
                required
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-[#F15B42] to-[#F49CC4]/80 hover:from-[#e14d35] hover:to-[#e14d35] text-white py-3.5 rounded-2xl font-semibold transition-all duration-300 shadow-lg shadow-[#F15B42]/20 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
          >
            <span>{loading ? "Registering Core..." : "Register OS Profile"}</span>
            <ArrowRight size={16} />
          </motion.button>
        </form>

        <div className="my-6 flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="text-slate-500 text-xs font-semibold tracking-wider">OR</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        <motion.button 
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          className="w-full bg-white/5 border border-white/10 text-white py-3.5 rounded-2xl font-semibold text-sm hover:bg-white/10 transition-all flex items-center justify-center gap-2"
        >
          <ExternalLink size={18} />
          <span>Continue with GitHub</span>
        </motion.button>

        <p className="text-center mt-6 text-sm text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="text-[#F15B42] hover:text-[#e14d35] font-semibold transition">
            Login
          </Link>
        </p>
      </motion.div>
    </div>
  );
}

export default SignupPage;
