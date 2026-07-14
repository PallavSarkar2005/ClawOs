import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, User, Sparkles, ArrowRight, Eye, EyeOff, ShieldCheck, Check, X } from "lucide-react";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, login } = useAuth();

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Real-time validations
  const [passwordCriteria, setPasswordCriteria] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
  });
  const [strengthScore, setStrengthScore] = useState(0);

  useEffect(() => {
    const pwd = formData.password;
    const criteria = {
      length: pwd.length >= 8,
      uppercase: /[A-Z]/.test(pwd),
      lowercase: /[a-z]/.test(pwd),
      number: /[0-9]/.test(pwd),
      special: /[^A-Za-z0-9]/.test(pwd),
    };
    setPasswordCriteria(criteria);

    // Calculate score (0 to 5)
    const score = Object.values(criteria).filter(Boolean).length;
    setStrengthScore(score);
  }, [formData.password]);

  const getStrengthLabel = () => {
    if (formData.password.length === 0) return { label: "Empty", color: "bg-slate-600/30", text: "text-slate-400" };
    switch (strengthScore) {
      case 1:
        return { label: "Very Weak", color: "bg-red-500", text: "text-red-400" };
      case 2:
        return { label: "Weak", color: "bg-orange-500", text: "text-orange-400" };
      case 3:
        return { label: "Fair", color: "bg-yellow-500", text: "text-yellow-400" };
      case 4:
        return { label: "Strong", color: "bg-indigo-500", text: "text-indigo-400" };
      case 5:
        return { label: "Excellent", color: "bg-emerald-500", text: "text-emerald-400" };
      default:
        return { label: "Weak", color: "bg-red-500", text: "text-red-400" };
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (strengthScore < 5) {
      setError("Please satisfy all password security requirements.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!formData.acceptTerms) {
      setError("You must accept the terms of service.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await register(formData.name, formData.email, formData.password, formData.confirmPassword, formData.acceptTerms);
      
      // Auto login after signup
      await login(formData.email, formData.password, true);
      navigate("/dashboard");
    } catch (err) {
      setError(err?.response?.data?.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const strength = getStrengthLabel();

  return (
    <div className="min-h-screen bg-[#0F172A] flex items-center justify-center px-4 py-12 relative overflow-hidden font-sans">
      {/* Background Glow Blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#7CAADC]/10 rounded-full pointer-events-none blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#F49CC4]/15 rounded-full pointer-events-none blur-3xl"></div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-lg glass rounded-3xl p-8 shadow-2xl relative z-10 border border-white/5"
      >
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] items-center justify-center shadow-lg shadow-[#F15B42]/20 mb-4 animate-pulse">
            <Sparkles size={24} className="text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Create account
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Launch your autonomous developer workspace node
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

        <form onSubmit={handleRegister} className="space-y-4">
          <div>
            <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Full Name
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                <User size={16} />
              </span>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="Ada Lovelace"
                className="w-full pl-11 pr-4 py-3 bg-slate-950/40 border border-white/5 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-xs transition-all placeholder-slate-600"
                required
              />
            </div>
          </div>

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
            <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Password
            </label>
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

            {/* Password Strength Meter */}
            {formData.password.length > 0 && (
              <div className="mt-3 space-y-2">
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-500 font-semibold uppercase">Strength</span>
                  <span className={`${strength.text} font-bold`}>{strength.label}</span>
                </div>
                <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-full flex-1 transition-all duration-300 ${
                        i < strengthScore ? strength.color : "bg-slate-800"
                      }`}
                    ></div>
                  ))}
                </div>

                {/* Checklist */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-[10px] font-medium text-slate-400">
                  <div className="flex items-center gap-1.5">
                    {passwordCriteria.length ? (
                      <Check className="text-emerald-500" size={12} />
                    ) : (
                      <X className="text-slate-600" size={12} />
                    )}
                    <span>Min 8 characters</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {passwordCriteria.uppercase ? (
                      <Check className="text-emerald-500" size={12} />
                    ) : (
                      <X className="text-slate-600" size={12} />
                    )}
                    <span>Uppercase letter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {passwordCriteria.lowercase ? (
                      <Check className="text-emerald-500" size={12} />
                    ) : (
                      <X className="text-slate-600" size={12} />
                    )}
                    <span>Lowercase letter</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {passwordCriteria.number ? (
                      <Check className="text-emerald-500" size={12} />
                    ) : (
                      <X className="text-slate-600" size={12} />
                    )}
                    <span>Numeric character</span>
                  </div>
                  <div className="flex items-center gap-1.5 col-span-2">
                    {passwordCriteria.special ? (
                      <Check className="text-emerald-500" size={12} />
                    ) : (
                      <X className="text-slate-600" size={12} />
                    )}
                    <span>Special character (!@#$%)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Confirm Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-4 flex items-center text-slate-500">
                <Lock size={16} />
              </span>
              <input
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-11 pr-11 py-3 bg-slate-950/40 border border-white/5 rounded-2xl focus:outline-none focus:border-[#F15B42] focus:ring-1 focus:ring-[#F15B42] text-white text-xs transition-all placeholder-slate-600"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 py-2">
            <input
              type="checkbox"
              name="acceptTerms"
              id="acceptTerms"
              checked={formData.acceptTerms}
              onChange={handleChange}
              className="mt-1 accent-[#F15B42] h-4 w-4 bg-slate-900 border-white/10 rounded cursor-pointer"
              required
            />
            <label htmlFor="acceptTerms" className="text-[11px] text-slate-400 cursor-pointer select-none">
              I agree to the{" "}
              <span className="text-[#F15B42] hover:underline">Terms of Service</span> and{" "}
              <span className="text-[#F15B42] hover:underline">Privacy Policy</span>.
            </label>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={loading || strengthScore < 5}
            className="w-full bg-[#F15B42] hover:bg-[#e04a31] text-white py-3.5 rounded-2xl font-bold transition-all duration-300 shadow-lg shadow-[#F15B42]/10 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
          >
            {loading ? (
              <span>Provisioning Sandbox...</span>
            ) : (
              <>
                <span>Launch Profile Node</span>
                <ArrowRight size={14} />
              </>
            )}
          </motion.button>
        </form>

        <p className="text-center mt-6 text-xs text-slate-400">
          Already have an account?{" "}
          <Link to="/login" className="text-[#F15B42] hover:text-[#e04a31] font-bold transition-colors">
            Login here
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
