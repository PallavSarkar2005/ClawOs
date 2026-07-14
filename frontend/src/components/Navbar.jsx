import { Link } from "react-router-dom";
import { Sparkles, ExternalLink } from "lucide-react";
import { motion } from "framer-motion";

function Navbar() {
  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-[#1B2748]/65 backdrop-blur-md border-b border-white/10 sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#F15B42] to-[#F49CC4] flex items-center justify-center shadow-md">
            <Sparkles size={18} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-wide">
            Claw<span className="text-[#F15B42]">OS</span>
          </h1>
        </Link>

        <div className="flex items-center gap-6">
          <Link
            to="/login"
            className="text-slate-300 hover:text-white transition font-medium text-sm"
          >
            Sign In
          </Link>

          <Link
            to="/signup"
            className="bg-gradient-to-r from-[#F15B42] to-[#F15B42]/90 hover:from-[#e14d35] hover:to-[#e14d35] px-5 py-2.5 rounded-xl text-white font-semibold text-sm transition-all duration-300 shadow-md shadow-[#F15B42]/10"
          >
            Launch System
          </Link>
        </div>
      </div>
    </motion.nav>
  );
}

export default Navbar;