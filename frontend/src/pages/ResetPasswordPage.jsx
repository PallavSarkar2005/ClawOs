import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Lock, Sparkles, ArrowRight, Eye, EyeOff, ShieldCheck, Check, X, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

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

    const score = Object.values(criteria).filter(Boolean).length;
    setStrengthScore(score);
  }, [formData.password]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (strengthScore < 5) {
      setError("Please satisfy all password security requirements.");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      await resetPassword(token, formData.password, formData.confirmPassword);
      setSuccess(true);
      setTimeout(() => {
        navigate("/login");
      }, 3000);
    } catch (err) {
      setError(err?.response?.data?.message || "Failed to reset password. Link may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

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

  const strength = getStrengthLabel();

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
              key="reset-form"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] items-center justify-center shadow-lg shadow-[#F15B42]/20 mb-4">
                  <Sparkles size={24} className="text-white" />
                </div>
                <h1 className="text-3xl font-extrabold text-white tracking-tight">
                  Update password
                </h1>
                <p className="text-slate-400 mt-2 text-sm">
                  Apply a secure password sequence to launch your account node
                </p>
              </div>

              {error && (
                <div className="mb-6 bg-red-500/10 border border-red-500/20 text-red-300 p-4 rounded-2xl text-xs flex items-center gap-3">
                  <X size={16} className="text-red-400 shrink-0" />
                  <span className="font-semibold">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    New Password
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

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-medium text-slate-400 pt-0.5">
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.length ? (
                            <Check className="text-emerald-500" size={10} />
                          ) : (
                            <X className="text-slate-600" size={10} />
                          )}
                          <span>Min 8 characters</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.uppercase ? (
                            <Check className="text-emerald-500" size={10} />
                          ) : (
                            <X className="text-slate-600" size={10} />
                          )}
                          <span>Uppercase letter</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.lowercase ? (
                            <Check className="text-emerald-500" size={10} />
                          ) : (
                            <X className="text-slate-600" size={10} />
                          )}
                          <span>Lowercase letter</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {passwordCriteria.number ? (
                            <Check className="text-emerald-500" size={10} />
                          ) : (
                            <X className="text-slate-600" size={10} />
                          )}
                          <span>Numeric character</span>
                        </div>
                        <div className="flex items-center gap-1.5 col-span-2">
                          {passwordCriteria.special ? (
                            <Check className="text-emerald-500" size={10} />
                          ) : (
                            <X className="text-slate-600" size={10} />
                          )}
                          <span>Special character (!@#$)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block mb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Confirm New Password
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

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  type="submit"
                  disabled={loading || strengthScore < 5}
                  className="w-full bg-[#F15B42] hover:bg-[#e04a31] text-white py-3.5 rounded-2xl font-bold transition-all duration-300 shadow-lg shadow-[#F15B42]/10 disabled:opacity-50 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
                >
                  {loading ? (
                    <span>Updating password...</span>
                  ) : (
                    <>
                      <span>Apply New Credentials</span>
                      <ArrowRight size={14} />
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
              className="text-center py-6"
            >
              <div className="inline-flex w-16 h-16 rounded-full bg-emerald-500/10 items-center justify-center mb-6">
                <CheckCircle2 size={36} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-extrabold text-white tracking-tight mb-3">
                Password updated
              </h2>
              <p className="text-slate-400 text-xs leading-relaxed max-w-sm mx-auto">
                Your credentials have been successfully updated. Redirecting you to login...
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
