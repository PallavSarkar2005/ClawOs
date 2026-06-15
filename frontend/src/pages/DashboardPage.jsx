import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import DashboardLayout from "../layouts/DashboardLayout";

function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold text-white">
            Welcome back, {user?.name} 👋
          </h1>

          <p className="mt-2 text-white/70">
            Manage your AI agents, workflows, memory, and automation from one
            place.
          </p>
        </div>

        {/* User Card */}
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-6 border border-white/10">
          <h2 className="text-2xl font-semibold text-white mb-4">
            Account Information
          </h2>

          <div className="space-y-3">
            <p className="text-white/80">
              <span className="font-semibold">Name:</span> {user?.name}
            </p>

            <p className="text-white/80">
              <span className="font-semibold">Email:</span> {user?.email}
            </p>

            <p className="text-white/80">
              <span className="font-semibold">User ID:</span> {user?.id}
            </p>

            <p className="text-white/80">
              <span className="font-semibold">Joined:</span>{" "}
              {new Date(user?.createdAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Future Features */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-[#F15B42] p-6 rounded-3xl">
            <h3 className="font-bold text-xl text-white">AI Agents</h3>

            <p className="text-white/80 mt-2">
              Create and manage autonomous AI agents.
            </p>
          </div>

          <div className="bg-[#7CAADC] p-6 rounded-3xl">
            <h3 className="font-bold text-xl text-white">Memory System</h3>

            <p className="text-white/80 mt-2">
              Persistent memory using Redis and PostgreSQL.
            </p>
          </div>

          <div className="bg-[#F49CC4] p-6 rounded-3xl">
            <h3 className="font-bold text-xl text-white">Workflows</h3>

            <p className="text-white/80 mt-2">
              Automate tasks with agent workflows.
            </p>
          </div>
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-xl text-white font-semibold transition"
        >
          Logout
        </button>
      </div>
    </DashboardLayout>
  );
}

export default DashboardPage;
