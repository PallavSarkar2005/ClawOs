import Navbar from "../components/Navbar";

function LandingPage() {
  return (
    <div className="min-h-screen bg-[#2C3D73] text-white">
      <Navbar />

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-6 py-28 text-center">
        <p className="text-[#FFD372] font-semibold mb-4">
          OPEN SOURCE AI AGENT PLATFORM
        </p>

        <h1 className="text-6xl md:text-7xl font-bold leading-tight">
          Build, Automate & Scale
          <span className="block text-[#F49CC4]">
            Intelligent Agents
          </span>
        </h1>

        <p className="mt-8 text-xl text-gray-200 max-w-3xl mx-auto">
          ClawOS combines AI Agents, Memory, Workflows,
          Browser Automation and Skills into a single
          operating system for intelligent automation.
        </p>

        <div className="mt-10 flex justify-center gap-4 flex-wrap">
          <button className="bg-[#F15B42] hover:bg-[#e44c33] px-8 py-4 rounded-xl font-semibold transition">
            Get Started
          </button>

          <button className="bg-[#FFD372] text-[#2C3D73] hover:scale-105 transition px-8 py-4 rounded-xl font-semibold">
            View GitHub
          </button>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-4xl font-bold text-center mb-12">
          Core Features
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/10">
            <h3 className="text-2xl font-bold text-[#FFD372] mb-4">
              AI Agents
            </h3>

            <p className="text-gray-200">
              Multi-agent architecture for intelligent task execution.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/10">
            <h3 className="text-2xl font-bold text-[#F49CC4] mb-4">
              Long-Term Memory
            </h3>

            <p className="text-gray-200">
              Store user preferences, workflows and context.
            </p>
          </div>

          <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/10">
            <h3 className="text-2xl font-bold text-[#7CAADC] mb-4">
              Browser Automation
            </h3>

            <p className="text-gray-200">
              Control websites and automate repetitive tasks.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

export default LandingPage;