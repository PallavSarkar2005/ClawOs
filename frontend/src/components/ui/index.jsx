import { motion, AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { forwardRef } from "react";

/* =====================
   BUTTON
   ===================== */
export const Button = forwardRef(({
  children,
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  className = "",
  disabled,
  ...props
}, ref) => {
  const variants = {
    primary: "btn btn-primary text-white",
    ghost:   "btn btn-ghost",
    danger:  "btn btn-danger",
    outline: "btn border border-white/10 text-slate-300 hover:border-white/20 hover:text-white hover:bg-white/5",
  };
  const sizes = {
    xs: "text-xs px-3 py-1.5 rounded-lg",
    sm: "text-sm px-4 py-2 rounded-xl",
    md: "text-sm px-5 py-2.5 rounded-xl",
    lg: "text-base px-6 py-3 rounded-xl",
  };

  return (
    <motion.button
      ref={ref}
      whileHover={{ scale: disabled || loading ? 1 : 1.02 }}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      className={`${variants[variant]} ${sizes[size]} ${className} ${disabled || loading ? "opacity-50 cursor-not-allowed" : ""}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children}
      {iconRight && !loading && <span className="flex-shrink-0">{iconRight}</span>}
    </motion.button>
  );
});
Button.displayName = "Button";

/* =====================
   CARD
   ===================== */
export const Card = ({ children, className = "", hover = true, elevated = false, ...props }) => (
  <div className={`${elevated ? "card-elevated" : "card"} ${hover ? "" : "hover:transform-none hover:shadow-none"} ${className}`} {...props}>
    {children}
  </div>
);

/* =====================
   BADGE
   ===================== */
export const Badge = ({ children, color = "default", className = "" }) => {
  const colors = {
    default: "bg-white/5 text-white/60 border border-white/10",
    orange:  "bg-[#F15B42]/10 text-[#F15B42] border border-[#F15B42]/20",
    blue:    "bg-[#7CAADC]/10 text-[#7CAADC] border border-[#7CAADC]/20",
    pink:    "bg-[#F49CC4]/10 text-[#F49CC4] border border-[#F49CC4]/20",
    green:   "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
    red:     "bg-red-500/10 text-red-400 border border-red-500/20",
    yellow:  "bg-amber-500/10 text-amber-400 border border-amber-500/20",
  };
  return (
    <span className={`badge ${colors[color]} ${className}`}>
      {children}
    </span>
  );
};

/* =====================
   SKELETON
   ===================== */
export const Skeleton = ({ className = "", ...props }) => (
  <div className={`skeleton ${className}`} {...props} />
);

export const SkeletonText = ({ lines = 3, className = "" }) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
    ))}
  </div>
);

/* =====================
   AVATAR
   ===================== */
export const Avatar = ({ name, src, size = "md", className = "" }) => {
  const sizes = { sm: "w-7 h-7 text-xs", md: "w-9 h-9 text-sm", lg: "w-12 h-12 text-base" };
  const initials = name?.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() || "?";
  
  return (
    <div className={`${sizes[size]} rounded-full flex items-center justify-center font-bold flex-shrink-0 ${className}`}
      style={{ background: "linear-gradient(135deg, #F15B42, #F49CC4)" }}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover rounded-full" />
      ) : (
        <span className="text-white">{initials}</span>
      )}
    </div>
  );
};

/* =====================
   STATUS DOT
   ===================== */
export const StatusDot = ({ status = "offline", label }) => {
  const statusClass = {
    online: "status-online",
    idle: "status-idle",
    offline: "status-offline",
    error: "status-error",
  };
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2 h-2 rounded-full ${statusClass[status]}`} />
      {label && <span className="text-xs text-slate-400">{label}</span>}
    </div>
  );
};

/* =====================
   TOOLTIP
   ===================== */
export const Tooltip = ({ children, label, side = "top" }) => {
  const positions = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };
  return (
    <div className="relative group">
      {children}
      <div className={`tooltip absolute z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none ${positions[side]}`}>
        {label}
      </div>
    </div>
  );
};

/* =====================
   DIVIDER
   ===================== */
export const Divider = ({ label, className = "" }) => (
  <div className={`flex items-center gap-3 ${className}`}>
    <div className="flex-1 h-px bg-white/8" />
    {label && <span className="text-xs text-slate-500 font-medium uppercase tracking-widest">{label}</span>}
    <div className="flex-1 h-px bg-white/8" />
  </div>
);

/* =====================
   MODAL
   ===================== */
export const Modal = ({ open, onClose, children, title, size = "md" }) => {
  const sizes = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className={`relative w-full ${sizes[size]} glass-strong rounded-2xl p-6 shadow-2xl z-10`}
          >
            {title && (
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">{title}</h3>
                <button onClick={onClose} className="btn-ghost btn w-8 h-8 p-0 text-slate-400 hover:text-white text-xl leading-none">×</button>
              </div>
            )}
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/* =====================
   EMPTY STATE
   ===================== */
export const EmptyState = ({ icon, title, description, action }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.96 }}
    animate={{ opacity: 1, scale: 1 }}
    className="flex flex-col items-center justify-center py-16 text-center"
  >
    {icon && (
      <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/7 flex items-center justify-center text-slate-500 mb-5">
        {icon}
      </div>
    )}
    <h4 className="text-base font-semibold text-white mb-1.5">{title}</h4>
    {description && <p className="text-sm text-slate-400 max-w-xs leading-relaxed mb-5">{description}</p>}
    {action}
  </motion.div>
);

/* =====================
   INPUT
   ===================== */
export const Input = forwardRef(({ className = "", icon, ...props }, ref) => (
  <div className="relative">
    {icon && <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">{icon}</span>}
    <input
      ref={ref}
      className={`input-premium w-full py-2.5 text-sm ${icon ? "pl-10 pr-4" : "px-4"} focus-ring ${className}`}
      {...props}
    />
  </div>
));
Input.displayName = "Input";

/* =====================
   TABS
   ===================== */
export const Tabs = ({ tabs, active, onChange, className = "" }) => (
  <div className={`flex items-center gap-1 p-1 glass rounded-xl ${className}`}>
    {tabs.map(tab => (
      <button
        key={tab.id}
        onClick={() => onChange(tab.id)}
        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
          active === tab.id
            ? "bg-[#F15B42] text-white shadow-md"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        }`}
      >
        {tab.icon && <span>{tab.icon}</span>}
        {tab.label}
      </button>
    ))}
  </div>
);

/* =====================
   CHIP
   ===================== */
export const Chip = ({ children, onRemove, className = "" }) => (
  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-sm text-white ${className}`}>
    {children}
    {onRemove && (
      <button onClick={onRemove} className="text-slate-400 hover:text-white transition ml-0.5">×</button>
    )}
  </div>
);

/* =====================
   LOADER
   ===================== */
export const Loader = ({ size = 16, className = "" }) => (
  <Loader2 size={size} className={`animate-spin text-[#F15B42] ${className}`} />
);

/* =====================
   AI THINKING ANIMATION
   ===================== */
export const ThinkingDots = () => (
  <div className="flex items-center gap-1 py-1 px-1">
    {[0, 1, 2].map(i => (
      <motion.div
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-[#F15B42]"
        animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1, 0.8] }}
        transition={{ duration: 1.2, delay: i * 0.2, repeat: Infinity }}
      />
    ))}
  </div>
);

/* =====================
   PAGE WRAPPER
   ===================== */
export const PageWrapper = ({ children, className = "" }) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    className={`h-full overflow-auto ${className}`}
  >
    {children}
  </motion.div>
);

export const Section = ({ title, description, action, children, className = "" }) => (
  <div className={`space-y-4 ${className}`}>
    {(title || action) && (
      <div className="flex items-start justify-between">
        <div>
          {title && <h2 className="text-base font-bold text-white">{title}</h2>}
          {description && <p className="text-sm text-slate-400 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </div>
);
