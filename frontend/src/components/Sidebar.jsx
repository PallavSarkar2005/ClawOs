import { Link } from "react-router-dom";

function Sidebar() {
  return (
    <div className="w-64 bg-[#233566] border-r border-white/10 min-h-screen">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-white">
          ClawOS
        </h1>
      </div>

      <nav className="px-4 space-y-2">
        <Link
          to="/dashboard"
          className="block p-3 rounded-xl text-white hover:bg-white/10"
        >
          Dashboard
        </Link>

        <Link
          to="/chat"
          className="block p-3 rounded-xl text-white hover:bg-white/10"
        >
          Chat
        </Link>

        <Link
          to="/skills"
          className="block p-3 rounded-xl text-white hover:bg-white/10"
        >
          Skills
        </Link>

        <Link
          to="/memory"
          className="block p-3 rounded-xl text-white hover:bg-white/10"
        >
          Memory
        </Link>

        <Link
          to="/workflows"
          className="block p-3 rounded-xl text-white hover:bg-white/10"
        >
          Workflows
        </Link>

        <Link
          to="/settings"
          className="block p-3 rounded-xl text-white hover:bg-white/10"
        >
          Settings
        </Link>
      </nav>
    </div>
  );
}

export default Sidebar;