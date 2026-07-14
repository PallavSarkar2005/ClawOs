import Navbar from "../components/Navbar";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Sparkles,
  Cpu,
  Brain,
  GitBranch,
  FolderOpen,
  ArrowRight,
  ExternalLink
} from "lucide-react";

function LandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.5 } }
  };

  return (
    <div className="min-h-screen bg-[#1B2748] text-white relative overflow-hidden font-sans">
      {/* Visual Ambient Background Blobs */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blob-blue rounded-full pointer-events-none blur-3xl opacity-50"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[65%] h-[65%] bg-blob-pink rounded-full pointer-events-none blur-3xl opacity-50"></div>

      <Navbar />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-28 text-center relative z-10">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-[#7CAADC] mb-6 uppercase tracking-wider shadow-sm"
        >
          <Sparkles size={14} className="text-[#F15B42]" />
          <span>PRODUCTION-GRADE MULTI-AGENT OS</span>
        </motion.div>

        <motion.h1
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.6 }}
          className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-slate-300"
        >
          Build, Coordinate &amp; Orchestrate
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-[#F15B42] to-[#F49CC4] font-black">
            Autonomous Agents
          </span>
        </motion.h1>

        <motion.p
          initial={{ y: 25, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="mt-8 text-lg md:text-xl text-slate-300 max-w-3xl mx-auto font-medium leading-relaxed"
        >
          ClawOS combines decentralized AI Agents, persistent long-term memory retrieval,
          automated workflows, and multi-format document ingestion into a premium sandboxed agent runtime.
        </motion.p>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-10 flex justify-center gap-4 flex-wrap"
        >
          <Link
            to="/signup"
            className="bg-gradient-to-r from-[#F15B42] to-[#F15B42]/90 hover:from-[#e14d35] hover:to-[#e14d35] px-8 py-4 rounded-xl font-bold transition-all duration-300 shadow-lg shadow-[#F15B42]/20 flex items-center gap-2 group"
          >
            <span>Get Started</span>
            <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
          </Link>

          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="bg-white/5 hover:bg-white/10 border border-white/10 px-8 py-4 rounded-xl font-bold transition-all flex items-center gap-2"
          >
            <ExternalLink size={18} />
            <span>View GitHub</span>
          </a>
        </motion.div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 py-20 relative z-10">
        <h2 className="text-3xl font-extrabold text-center mb-16 tracking-tight">
          Engineered for Advanced Autonomy
        </h2>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid md:grid-cols-3 gap-8"
        >
          <motion.div
            variants={itemVariants}
            className="glass-panel p-8 rounded-3xl border border-white/10 glass-card-hover"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F15B42]/10 flex items-center justify-center mb-6 text-[#F15B42] border border-[#F15B42]/20">
              <Cpu size={22} />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Multi-Agent Engine
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Coordinate research, execution, planning, and preview compilation through a decoupled pipeline.
            </p>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-panel p-8 rounded-3xl border border-white/10 glass-card-hover"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#7CAADC]/10 flex items-center justify-center mb-6 text-[#7CAADC] border border-[#7CAADC]/20">
              <Brain size={22} />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Persistent Memory Bank
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Auto-indexing facts and heuristics from user interactions to dynamically append context windows.
            </p>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="glass-panel p-8 rounded-3xl border border-white/10 glass-card-hover"
          >
            <div className="w-12 h-12 rounded-2xl bg-[#F49CC4]/10 flex items-center justify-center mb-6 text-[#F49CC4] border border-[#F49CC4]/20">
              <GitBranch size={22} />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">
              Workflow Automation
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Define multi-step visual graphs containing conditional model paths, tool definitions, and triggers.
            </p>
          </motion.div>
        </motion.div>
      </section>
    </div>
  );
}

export default LandingPage;